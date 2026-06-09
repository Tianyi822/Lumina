import { create } from 'zustand'
import { deepClone } from '@shared/utils'
import { usePaperChatMessageCacheStore } from './paperChatMessageCacheStore'
import { useReactIterationManager } from './paperChatReactIteration'
import { usePlanStateManager } from './paperChatPlanState'
import type { Message, StreamEvent, UserInteractionRequest } from '@renderer/types'

export interface CapabilitySuggestionData {
  capabilities: Array<{
    id: string
    displayName: string
    description: string
    reason?: string
  }>
}

export type { PlanStepIteration, PaperChatPlanState } from './paperChatPlanState'

/**
 * 流式聊天状态 Store 类型
 * 管理 AI 对话的流式传输状态，包括发送状态、会话快照、流事件处理等
 */
export interface PaperChatStreamState {
  isSending: boolean
  sessionSendingStates: Map<string, boolean>
  messagesSnapshots: Map<string, Message[]>
  streamingSessionId: string | null
  cleanupStreamListenerFn: (() => void) | null
  showUserInteraction: boolean
  userInteractionInfo: UserInteractionRequest | null
  showCapabilitySuggestion: boolean
  capabilitySuggestion: CapabilitySuggestionData | null

  streamingSessionCount: () => number
  activeSessionIds: () => string[]

  getSessionSendingState: (sessionId: string) => boolean
  setSessionSendingState: (sessionId: string, state: boolean, isCurrentSession?: boolean) => void
  setIsSending: (state: boolean) => void
  saveMessagesSnapshot: (sessionId: string, messages: Message[]) => void
  getMessagesSnapshot: (sessionId: string) => Message[] | null
  clearMessagesSnapshot: (sessionId: string) => void
  hideUserInteraction: () => void
  hideCapabilitySuggestion: () => void
  beginPlanning: (sessionId: string, turnId: string) => void
  failPlanState: (sessionId: string, error: string) => void
  getSessionPlanState: (
    sessionId: string
  ) => ReturnType<ReturnType<typeof usePlanStateManager>['getSessionPlanState']>
  resetPlanState: (sessionId: string) => void
  handleStreamEvent: (
    event: StreamEvent,
    currentSessionId: string | null,
    currentMessages: Message[]
  ) => void
  setupStreamListener: (handler: (event: StreamEvent) => void) => void
  cleanupStreamListener: () => void
  stopRequest: (sessionId?: string, currentMessages?: Message[]) => Promise<void>
  resetSessionState: (sessionId: string) => void
  resetAllState: () => void
}

const paperChatMessageCache = usePaperChatMessageCacheStore
const reactIteration = useReactIterationManager()
const planManager = usePlanStateManager()
const REQUEST_FAILED_MESSAGE = '请求失败，请稍后重试或换一个模型。'

/**
 * 流式聊天 Store
 * 处理 AI 响应的流式接收，管理 ReAct 迭代分组、Plan 执行状态、工具调用等
 */
export const usePaperChatStreamStore = create<PaperChatStreamState>()((set, get) => ({
  isSending: false,
  sessionSendingStates: new Map(),
  messagesSnapshots: new Map(),
  streamingSessionId: null,
  cleanupStreamListenerFn: null,
  showUserInteraction: false,
  userInteractionInfo: null,
  showCapabilitySuggestion: false,
  capabilitySuggestion: null,

  streamingSessionCount: () => {
    let count = 0
    for (const [, isSending] of get().sessionSendingStates.entries()) {
      if (isSending) count++
    }
    return count
  },

  activeSessionIds: () => {
    const ids: string[] = []
    for (const [sessionId, sending] of get().sessionSendingStates.entries()) {
      if (sending) ids.push(sessionId)
    }
    return ids
  },

  getSessionSendingState: (sessionId) => get().sessionSendingStates.get(sessionId) || false,

  setSessionSendingState: (sessionId, state, isCurrentSession = false) =>
        // 更新会话发送状态，可选标记为当前会话
    set((s) => {
      const next = new Map(s.sessionSendingStates)
      next.set(sessionId, state)

      const patch: Partial<PaperChatStreamState> = { sessionSendingStates: next }

      if (isCurrentSession) {
        patch.isSending = state
      }

      if (state) {
        patch.streamingSessionId = sessionId
        if (isCurrentSession) {
          patch.showUserInteraction = false
          patch.userInteractionInfo = null
          patch.showCapabilitySuggestion = false
          patch.capabilitySuggestion = null
        }
      } else if (s.streamingSessionId === sessionId) {
        patch.streamingSessionId = null
      }

      return patch
    }),

  setIsSending: (state) => set({ isSending: state }),

  saveMessagesSnapshot: (sessionId, messages) =>
    set((s) => {
      const next = new Map(s.messagesSnapshots)
      next.set(sessionId, deepClone(messages))
      return { messagesSnapshots: next }
    }),

  getMessagesSnapshot: (sessionId) => get().messagesSnapshots.get(sessionId) || null,

  clearMessagesSnapshot: (sessionId) =>
    set((s) => {
      const next = new Map(s.messagesSnapshots)
      next.delete(sessionId)
      return { messagesSnapshots: next }
    }),

  hideUserInteraction: () => set({ showUserInteraction: false, userInteractionInfo: null }),

  hideCapabilitySuggestion: () =>
    set({ showCapabilitySuggestion: false, capabilitySuggestion: null }),

  beginPlanning: planManager.beginPlanning,
  failPlanState: planManager.failPlanState,
  getSessionPlanState: planManager.getSessionPlanState,
  resetPlanState: planManager.resetPlanState,

  handleStreamEvent: (event, currentSessionId, currentMessages) => {
    // 根据事件类型分发到不同的处理逻辑
    const state = get()
    const targetSessionId = event.sessionId || state.streamingSessionId
    if (!targetSessionId) return

    const isCurrentSession = targetSessionId === currentSessionId

    let targetMessages: Message[]
    if (isCurrentSession) {
      targetMessages = currentMessages
    } else {
      const cached = paperChatMessageCache.getState().getCachedMessagesRef(targetSessionId)
      if (cached) {
        targetMessages = cached
      } else {
        targetMessages = []
        targetMessages = paperChatMessageCache
          .getState()
          .cacheSession(targetSessionId, targetMessages)
      }
    }

    // 查找当前流式消息
    const streamingMessage = targetMessages.find(
      (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
    )

    // 优先处理 Plan 相关事件
    if (event.type === 'plan_status') {
      planManager.handlePlanStatusEvent(targetSessionId, event)
      return
    }

    if (event.type === 'plan_generated') {
      planManager.handlePlanGeneratedEvent(targetSessionId, event)
      return
    }

    if (event.type === 'plan_step_update') {
      planManager.handlePlanStepUpdateEvent(
        targetSessionId,
        event,
        streamingMessage,
        reactIteration.currentIterationIndex
      )
      return
    }

    // 按事件类型分发处理
    switch (event.type) {
      case 'content':
        // 追加文本内容到流式消息或 Plan 步骤迭代
        if (streamingMessage && event.content) {
          const activePlan = planManager.planStates.value.get(targetSessionId)
          const isPlanStepContent =
            activePlan?.status === 'running' && activePlan.currentStepIndex >= 0

          if (isPlanStepContent) {
            const contentIter = reactIteration.ensureCurrentIteration(
              streamingMessage,
              targetSessionId
            )
            contentIter.taskNumber = activePlan.currentStepIndex + 1
            contentIter.content = (contentIter.content || '') + event.content
          } else {
            streamingMessage.content = streamingMessage.content + event.content
          }
        }
        break

      case 'react_iteration_start':
        // 开始新的 ReAct 迭代分组
        if (streamingMessage && event.content !== undefined) {
          const iterationNum = parseInt(event.content, 10)
          const newIter = reactIteration.createIteration(
            streamingMessage,
            targetSessionId,
            iterationNum,
            event.status as 'thinking' | 'calling_tools' | 'processing' | undefined
          )
          const activePlan = planManager.planStates.value.get(targetSessionId)
          if (activePlan && activePlan.status === 'running' && activePlan.currentStepIndex >= 0) {
            newIter.taskNumber = activePlan.currentStepIndex + 1
            planManager.appendPlanStepIteration(targetSessionId, event.status as string | undefined)
          }
        }
        break

      case 'reasoning':
        // 追加推理内容到消息和当前迭代
        if (streamingMessage && event.content) {
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content

          const iterForReasoning = reactIteration.getCurrentIteration(
            streamingMessage,
            targetSessionId
          )
          if (iterForReasoning) {
            iterForReasoning.reasoning += event.content
          }
        }
        break

      case 'tool_call':
        // 处理工具调用事件，追加到工具步骤列表
        if (streamingMessage && event.toolCall) {
          if (!streamingMessage.tool_calls) {
            streamingMessage.tool_calls = []
          }
          streamingMessage.tool_calls.push({
            id: event.toolCall.id,
            type: 'function',
            function: {
              name: `${event.toolCall.serverName}__${event.toolCall.name}`,
              arguments: JSON.stringify(event.toolCall.arguments)
            }
          })

          const toolCallStep = {
            type: 'tool_call' as const,
            toolCall: event.toolCall,
            timestamp: new Date().toISOString()
          }
          reactIteration.appendToolStep(streamingMessage, targetSessionId, toolCallStep)

          const currentIter = reactIteration.getCurrentIteration(streamingMessage, targetSessionId)
          if (currentIter && currentIter.status === 'thinking') {
            currentIter.status = 'calling_tools'
          }

          planManager.updatePlanStepIterationToolCall(
            targetSessionId,
            `${event.toolCall.serverName}__${event.toolCall.name}`
          )
        }
        break

      case 'tool_result':
        // 处理工具结果事件，更新对应的 tool 消息
        if (event.toolResult) {
          const targetAssistantMessage =
            streamingMessage ||
            reactIteration.findToolOwnerMessage(targetMessages, event.toolResult.id)

          const hasExistingToolMessage = targetMessages.some(
            (message) => message.role === 'tool' && message.tool_call_id === event.toolResult?.id
          )
          if (targetAssistantMessage || hasExistingToolMessage) {
            reactIteration.upsertToolMessage(targetMessages, event.toolResult)
          }

          if (targetAssistantMessage) {
            if (streamingMessage && targetAssistantMessage.id === streamingMessage.id) {
              const updated = reactIteration.updateToolResultStep(
                targetAssistantMessage,
                event.toolResult
              )
              if (!updated) {
                reactIteration.appendToolStep(targetAssistantMessage, targetSessionId, {
                  type: 'tool_result',
                  toolResult: event.toolResult,
                  timestamp: new Date().toISOString()
                })
              }
            } else if (
              !reactIteration.updateToolResultStep(targetAssistantMessage, event.toolResult)
            ) {
              if (!targetAssistantMessage.reactSteps) {
                targetAssistantMessage.reactSteps = []
              }
              targetAssistantMessage.reactSteps.push({
                type: 'tool_result',
                toolResult: event.toolResult,
                timestamp: new Date().toISOString()
              })
            }
          }
        }
        break

      case 'knowledge_search':
        // 知识库搜索事件（向后兼容）
        if (streamingMessage && event.knowledgeSearch) {
          reactIteration.appendToolStep(streamingMessage, targetSessionId, {
            type: 'tool_call',
            toolCall: {
              id: `kb-${event.knowledgeSearch.knowledgeBaseId}`,
              name: 'knowledge_search',
              serverName: event.knowledgeSearch.knowledgeBaseName,
              arguments: { query: event.knowledgeSearch.query }
            },
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'knowledge_result':
        // 知识库搜索结果事件（向后兼容）
        if (streamingMessage && event.knowledgeResult) {
          reactIteration.appendToolStep(streamingMessage, targetSessionId, {
            type: 'tool_result',
            toolResult: {
              id: `kb-${event.knowledgeResult.knowledgeBaseId}`,
              name: 'knowledge_search',
              success: true,
              result: {
                knowledgeBaseId: event.knowledgeResult.knowledgeBaseId,
                knowledgeBaseName: event.knowledgeResult.knowledgeBaseName,
                query: event.knowledgeResult.query,
                resultCount: event.knowledgeResult.results.length,
                results: event.knowledgeResult.results.map((r) => ({
                  fileName: r.fileName,
                  content: r.content,
                  similarity: r.similarity
                }))
              }
            },
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'user_interaction':
        if (isCurrentSession && event.userInteraction) {
          set({ showUserInteraction: true, userInteractionInfo: event.userInteraction })
        }
        break

      case 'capability_suggestion':
        if (event.capabilitySuggestion) {
          set({ showCapabilitySuggestion: true, capabilitySuggestion: event.capabilitySuggestion })
        }
        break

      case 'done':
        handleStreamDone(event, targetSessionId, isCurrentSession, streamingMessage)
        break

      case 'error':
        handleStreamError(event, targetSessionId, isCurrentSession, targetMessages)
        break
    }
  },

  setupStreamListener: (handler) => {
    get().cleanupStreamListener()
    const cleanup = window.api.chat.onStream(handler)
    set({ cleanupStreamListenerFn: cleanup })
  },

  cleanupStreamListener: () => {
    const fn = get().cleanupStreamListenerFn
    if (fn) {
      fn()
      set({ cleanupStreamListenerFn: null })
    }
  },

  stopRequest: async (sessionId, currentMessages) => {
    // 停止请求：结束流式消息、清理 Plan 状态、通知主进程
    const state = get()
    const targetSessionId = sessionId || state.streamingSessionId
    if (!targetSessionId) return

    const targetMessages =
      currentMessages && currentMessages.length > 0
        ? currentMessages
        : paperChatMessageCache.getState().getCachedMessagesRef(targetSessionId)

    const streamingMessage = targetMessages?.find((msg) => msg.isStreaming)
    if (streamingMessage) {
      streamingMessage.isStreaming = false
      reactIteration.finalizeIterations(streamingMessage, targetSessionId)
    } else {
      reactIteration.deleteIterationIndex(targetSessionId)
    }

    set((s) => {
      const next = new Map(s.sessionSendingStates)
      next.set(targetSessionId, false)
      return {
        sessionSendingStates: next,
        isSending: s.streamingSessionId === targetSessionId ? false : s.isSending,
        streamingSessionId: null
      }
    })

    state.clearMessagesSnapshot(targetSessionId)

    const existingPlan = planManager.planStates.value.get(targetSessionId)
    if (existingPlan) {
      const nextPlan = {
        ...existingPlan,
        status: 'cancelled' as const,
        steps: planManager
          .clonePlanSteps(existingPlan.steps)
          .map((step) =>
            step.status === 'pending' || step.status === 'running'
              ? { ...step, status: 'cancelled' as const, error: '用户已取消' }
              : step
          ),
        error: '用户已取消',
        updatedAt: new Date().toISOString()
      }
      planManager.setPlanState(targetSessionId, nextPlan)
    }

    window.api.chat.stop(targetSessionId).catch(() => {
      // silent
    })
  },

  resetSessionState: (sessionId) =>
    set((s) => {
      const nextSending = new Map(s.sessionSendingStates)
      nextSending.delete(sessionId)
      const nextSnapshots = new Map(s.messagesSnapshots)
      nextSnapshots.delete(sessionId)

      reactIteration.deleteIterationIndex(sessionId)
      planManager.deletePlanState(sessionId)

      return {
        sessionSendingStates: nextSending,
        messagesSnapshots: nextSnapshots,
        streamingSessionId: s.streamingSessionId === sessionId ? null : s.streamingSessionId
      }
    }),

  resetAllState: () => {
    get().cleanupStreamListener()
    reactIteration.currentIterationIndex.value.clear()
    planManager.planStates.value = new Map()
    set({
      isSending: false,
      sessionSendingStates: new Map(),
      messagesSnapshots: new Map(),
      streamingSessionId: null
    })
  }
}))

// Module-level functions not dependent on state
function handleStreamDone(
  event: StreamEvent,
  sessionId: string,
  isCurrentSession: boolean,
  streamingMessage?: Message
): void {
  const store = usePaperChatStreamStore

  if (streamingMessage) {
    streamingMessage.isStreaming = false
    if (event.usage) {
      streamingMessage.usage = event.usage
    }
    reactIteration.finalizeIterations(streamingMessage, sessionId)
    if (streamingMessage.planExecution) {
      streamingMessage.planExecution.isActive = false
    }
  } else {
    reactIteration.deleteIterationIndex(sessionId)
  }

  planManager.finalizePlanState(sessionId, event)

  store.setState((s) => {
    const next = new Map(s.sessionSendingStates)
    next.set(sessionId, false)

    const patch: Partial<PaperChatStreamState> = { sessionSendingStates: next }

    if (isCurrentSession) {
      patch.isSending = false
      patch.streamingSessionId = null
      patch.messagesSnapshots = (() => {
        const snap = new Map(s.messagesSnapshots)
        snap.delete(sessionId)
        return snap
      })()
    } else {
      if (s.streamingSessionId === sessionId) {
        patch.streamingSessionId = null
      }
      paperChatMessageCache.getState().saveCachedSession(sessionId)
    }

    return patch
  })
}

/** 处理流错误事件：标记消息完成、设置错误消息、清理状态 */
function handleStreamError(
  event: StreamEvent,
  sessionId: string,
  isCurrentSession: boolean,
  targetMessages: Message[]
): void {
  const store = usePaperChatStreamStore

  const streamingMessage = targetMessages.find(
    (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
  )

  if (streamingMessage) {
    streamingMessage.isStreaming = false
    if (!streamingMessage.content.trim() && event.error) {
      streamingMessage.content = REQUEST_FAILED_MESSAGE
    }
    reactIteration.finalizeIterations(streamingMessage, sessionId)
  } else {
    reactIteration.deleteIterationIndex(sessionId)
  }

  planManager.finalizePlanState(sessionId, event)

  store.setState((s) => {
    const next = new Map(s.sessionSendingStates)
    next.set(sessionId, false)

    const patch: Partial<PaperChatStreamState> = { sessionSendingStates: next }

    if (isCurrentSession) {
      patch.isSending = false
      patch.streamingSessionId = null
      patch.showUserInteraction = false
      patch.userInteractionInfo = null
      patch.showCapabilitySuggestion = false
      patch.capabilitySuggestion = null
      const snap = new Map(s.messagesSnapshots)
      snap.delete(sessionId)
      patch.messagesSnapshots = snap
    } else {
      if (s.streamingSessionId === sessionId) {
        patch.streamingSessionId = null
      }
      paperChatMessageCache.getState().saveCachedSession(sessionId)
    }

    return patch
  })
}
