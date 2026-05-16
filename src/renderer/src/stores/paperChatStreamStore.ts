// 聊天流状态 Store
// 管理聊天流状态，包括多会话并发、流式事件处理

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Message,
  PlanExecutionStatus,
  PlanStepStatus,
  StreamEvent,
  UserInteractionRequest
} from '@renderer/types'
import { usePaperChatMessageCacheStore } from './paperChatMessageCacheStore'
import { useReactIterationManager } from './paperChatReactIteration'
import { usePlanStateManager } from './paperChatPlanState'

// 重新导出类型以保持兼容
export type { PlanStepIteration, PaperChatPlanState } from './paperChatPlanState'

export const usePaperChatStreamStore = defineStore('paperChatStream', () => {
  // ==================== Dependencies ====================

  const paperChatMessageCache = usePaperChatMessageCacheStore()

  // ==================== State ====================

  // 是否正在发送消息（全局状态，用于当前会话）
  const isSending = ref(false)

  // 会话级别的发送状态（用于多会话并发管理）
  const sessionSendingStates = ref<Map<string, boolean>>(new Map())

  // 发送前的消息快照（用于错误回滚）
  const messagesSnapshots = ref<Map<string, Message[]>>(new Map())

  // 当前正在流式响应的会话ID
  const streamingSessionId = ref<string | null>(null)

  // 流式监听器清理函数
  const cleanupStreamListenerFn = ref<(() => void) | null>(null)

  // 用户交互选项状态
  const showUserInteraction = ref(false)
  const userInteractionInfo = ref<UserInteractionRequest | null>(null)

  // ReAct 迭代管理
  const reactIteration = useReactIterationManager()

  // Plan 状态管理
  const planManager = usePlanStateManager()

  // ==================== Getters ====================

  // 获取当前正在流式响应的会话数量
  const streamingSessionCount = computed(() => {
    let count = 0
    for (const [, isSending] of sessionSendingStates.value.entries()) {
      if (isSending) count++
    }
    return count
  })

  // 获取所有正在发送的会话 ID 列表
  const activeSessionIds = computed(() => {
    const ids: string[] = []
    for (const [sessionId, sending] of sessionSendingStates.value.entries()) {
      if (sending) ids.push(sessionId)
    }
    return ids
  })

  // ==================== Actions ====================

  // 获取指定会话的发送状态
  function getSessionSendingState(sessionId: string): boolean {
    return sessionSendingStates.value.get(sessionId) || false
  }

  // 设置指定会话的发送状态
  function setSessionSendingState(
    sessionId: string,
    state: boolean,
    isCurrentSession: boolean = false
  ): void {
    sessionSendingStates.value.set(sessionId, state)

    // 如果是当前会话，同步更新全局 isSending
    if (isCurrentSession) {
      isSending.value = state
    }

    // 更新流式会话 ID
    if (state) {
      streamingSessionId.value = sessionId
      // 新的流开始时，清除之前的用户交互选项
      if (isCurrentSession) {
        hideUserInteraction()
      }
    } else if (streamingSessionId.value === sessionId) {
      streamingSessionId.value = null
    }

    window.api.logger.debug('[PaperChatStreamStore] 设置会话发送状态', {
      sessionId,
      state,
      isCurrentSession,
      streamingSessionId: streamingSessionId.value
    })
  }

  // 设置当前会话的发送状态（便捷方法）
  function setIsSending(state: boolean): void {
    isSending.value = state
  }

  // 保存消息快照
  function saveMessagesSnapshot(sessionId: string, messages: Message[]): void {
    messagesSnapshots.value.set(sessionId, JSON.parse(JSON.stringify(messages)))

    window.api.logger.debug('[PaperChatStreamStore] 保存消息快照', {
      sessionId,
      messageCount: messages.length
    })
  }

  // 获取消息快照
  function getMessagesSnapshot(sessionId: string): Message[] | null {
    return messagesSnapshots.value.get(sessionId) || null
  }

  // 清除消息快照
  function clearMessagesSnapshot(sessionId: string): void {
    messagesSnapshots.value.delete(sessionId)
  }

  // 隐藏用户交互选项
  function hideUserInteraction(): void {
    showUserInteraction.value = false
    userInteractionInfo.value = null
  }

  // 处理流式事件
  // 根据事件类型更新消息内容、推理内容、工具调用等
  function handleStreamEvent(
    event: StreamEvent,
    currentSessionId: string | null,
    currentMessages: Message[]
  ): void {
    const targetSessionId = event.sessionId || streamingSessionId.value

    if (!targetSessionId) {
      window.api.logger.warn('[PaperChatStreamStore] 无法确定目标会话', { event })
      return
    }

    const isCurrentSession = targetSessionId === currentSessionId

    // 获取目标消息列表
    let targetMessages: Message[]
    if (isCurrentSession) {
      targetMessages = currentMessages
    } else {
      // 非当前会话：从缓存获取或初始化
      const cached = paperChatMessageCache.getCachedMessagesRef(targetSessionId)
      if (cached) {
        targetMessages = cached
      } else {
        // 创建新缓存
        targetMessages = []
        targetMessages = paperChatMessageCache.cacheSession(targetSessionId, targetMessages)
      }
    }

    // 找到本轮正在流式输出的消息。带 turnId 的旧事件不能写入新一轮消息。
    const streamingMessage = targetMessages.find(
      (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
    )

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

    switch (event.type) {
      case 'content':
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
        if (streamingMessage && event.content !== undefined) {
          const iterationNum = parseInt(event.content, 10)
          const newIter = reactIteration.createIteration(
            streamingMessage,
            targetSessionId,
            iterationNum,
            event.status as 'thinking' | 'calling_tools' | 'processing' | undefined
          )
          // Plan 模式下：将迭代关联到当前执行的步骤
          const activePlan = planManager.planStates.value.get(targetSessionId)
          if (activePlan && activePlan.status === 'running' && activePlan.currentStepIndex >= 0) {
            newIter.taskNumber = activePlan.currentStepIndex + 1
            planManager.appendPlanStepIteration(targetSessionId, event.status as string | undefined)
          }
        }
        break

      case 'reasoning':
        if (streamingMessage && event.content) {
          // 保持现有逻辑：累加到 message.reasoning（向后兼容）
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content

          // 新增：同时累加到当前迭代的 reasoning
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
        if (streamingMessage && event.toolCall) {
          // 1. 更新 assistant 消息的 tool_calls（标准格式）
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

          // 更新当前迭代状态为 calling_tools
          const currentIter = reactIteration.getCurrentIteration(streamingMessage, targetSessionId)
          if (currentIter && currentIter.status === 'thinking') {
            currentIter.status = 'calling_tools'
          }

          // Plan 模式下：更新步骤迭代的工具调用摘要
          planManager.updatePlanStepIterationToolCall(
            targetSessionId,
            `${event.toolCall.serverName}__${event.toolCall.name}`
          )
        }
        break

      case 'tool_result':
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
                const toolResultStep = {
                  type: 'tool_result' as const,
                  toolResult: event.toolResult,
                  timestamp: new Date().toISOString()
                }
                reactIteration.appendToolStep(
                  targetAssistantMessage,
                  targetSessionId,
                  toolResultStep
                )
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
        if (streamingMessage && event.knowledgeSearch) {
          // 使用 knowledgeBaseId 作为 ID，确保与 knowledge_result 的 ID 一致
          const kbSearchStep = {
            type: 'tool_call' as const,
            toolCall: {
              id: `kb-${event.knowledgeSearch.knowledgeBaseId}`,
              name: 'knowledge_search',
              serverName: event.knowledgeSearch.knowledgeBaseName,
              arguments: { query: event.knowledgeSearch.query }
            },
            timestamp: new Date().toISOString()
          }
          reactIteration.appendToolStep(streamingMessage, targetSessionId, kbSearchStep)
        }
        break

      case 'knowledge_result':
        if (streamingMessage && event.knowledgeResult) {
          // 使用 knowledgeBaseId 作为 ID，与 knowledge_search 的 ID 保持一致
          const kbResultStep = {
            type: 'tool_result' as const,
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
          }
          reactIteration.appendToolStep(streamingMessage, targetSessionId, kbResultStep)
        }
        break

      case 'user_interaction':
        if (isCurrentSession && event.userInteraction) {
          showUserInteraction.value = true
          userInteractionInfo.value = event.userInteraction
        }
        break

      case 'done':
        handleStreamDone(event, targetSessionId, isCurrentSession, streamingMessage)
        break

      case 'error':
        handleStreamError(event, targetSessionId, isCurrentSession, targetMessages)
        break
    }
  }

  // 处理流式完成事件
  function handleStreamDone(
    event: StreamEvent,
    sessionId: string,
    isCurrentSession: boolean,
    streamingMessage?: Message
  ): void {
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
    // 更新会话发送状态
    sessionSendingStates.value.set(sessionId, false)

    if (isCurrentSession) {
      isSending.value = false
      streamingSessionId.value = null
      clearMessagesSnapshot(sessionId)
      // 注意：不清除 userInteraction，选项需要持续显示到用户做出选择
    } else {
      // 非当前会话：保存缓存
      if (streamingSessionId.value === sessionId) {
        streamingSessionId.value = null
      }
      paperChatMessageCache.saveCachedSession(sessionId)
    }

    window.api.logger.debug('[PaperChatStreamStore] 流式响应完成', {
      sessionId,
      isCurrentSession,
      hasUsage: !!event.usage
    })
  }

  // 处理流式错误事件
  function handleStreamError(
    event: StreamEvent,
    sessionId: string,
    isCurrentSession: boolean,
    targetMessages: Message[]
  ): void {
    const streamingMessage = targetMessages.find(
      (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
    )

    if (streamingMessage) {
      streamingMessage.isStreaming = false
      if (!streamingMessage.content.trim() && event.error) {
        streamingMessage.content = `请求失败：${event.error}`
      }
      reactIteration.finalizeIterations(streamingMessage, sessionId)
    } else {
      reactIteration.deleteIterationIndex(sessionId)
    }

    planManager.finalizePlanState(sessionId, event)
    // 重置发送状态
    sessionSendingStates.value.set(sessionId, false)

    if (isCurrentSession) {
      isSending.value = false
      streamingSessionId.value = null
      clearMessagesSnapshot(sessionId)
      hideUserInteraction()
    } else {
      // 非当前会话：保留失败消息到缓存，避免后台状态丢失
      if (streamingSessionId.value === sessionId) {
        streamingSessionId.value = null
      }
      paperChatMessageCache.saveCachedSession(sessionId)
    }

    window.api.logger.error('[PaperChatStreamStore] 流式响应错误', {
      error: event.error,
      sessionId,
      isCurrentSession
    })
  }

  // 设置流式响应监听器
  function setupStreamListener(handler: (event: StreamEvent) => void): void {
    // 清理旧监听器
    cleanupStreamListener()

    cleanupStreamListenerFn.value = window.api.chat.onStream(handler)

    window.api.logger.info('[PaperChatStreamStore] 流式监听器已设置')
  }

  // 清理流式监听器
  function cleanupStreamListener(): void {
    if (cleanupStreamListenerFn.value) {
      cleanupStreamListenerFn.value()
      cleanupStreamListenerFn.value = null
      window.api.logger.info('[PaperChatStreamStore] 流式监听器已清理')
    }
  }

  // 中止当前请求
  // 立即更新本地状态，异步通知后端停止
  async function stopRequest(sessionId?: string, currentMessages?: Message[]): Promise<void> {
    const targetSessionId = sessionId || streamingSessionId.value
    if (!targetSessionId) {
      window.api.logger.warn('[PaperChatStreamStore] 没有活动的流式会话可停止')
      return
    }

    const targetMessages =
      currentMessages && currentMessages.length > 0
        ? currentMessages
        : paperChatMessageCache.getCachedMessagesRef(targetSessionId)

    const streamingMessage = targetMessages?.find((msg) => msg.isStreaming)
    if (streamingMessage) {
      streamingMessage.isStreaming = false
      reactIteration.finalizeIterations(streamingMessage, targetSessionId)
    } else {
      reactIteration.deleteIterationIndex(targetSessionId)
    }

    // 立即更新本地状态，不等待后端响应
    sessionSendingStates.value.set(targetSessionId, false)
    if (streamingSessionId.value === targetSessionId) {
      isSending.value = false
    }
    streamingSessionId.value = null
    clearMessagesSnapshot(targetSessionId)
    const existingPlan = planManager.planStates.value.get(targetSessionId)
    if (existingPlan) {
      const nextPlan = {
        ...existingPlan,
        status: 'cancelled' as PlanExecutionStatus,
        steps: planManager
          .clonePlanSteps(existingPlan.steps)
          .map((step) =>
            step.status === 'pending' || step.status === 'running'
              ? { ...step, status: 'cancelled' as PlanStepStatus, error: '用户已取消' }
              : step
          ),
        error: '用户已取消',
        updatedAt: new Date().toISOString()
      }
      planManager.setPlanState(targetSessionId, nextPlan)
    }

    window.api.logger.info('[PaperChatStreamStore] 正在停止请求', { sessionId: targetSessionId })

    try {
      // 异步调用后端停止（不等待结果）
      window.api.chat.stop(targetSessionId).catch((error) => {
        window.api.logger.error('[PaperChatStreamStore] 停止请求失败', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: targetSessionId
        })
      })
    } catch (error) {
      window.api.logger.error('[PaperChatStreamStore] 停止请求异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: targetSessionId
      })
    }
  }

  // 重置指定会话的状态
  function resetSessionState(sessionId: string): void {
    sessionSendingStates.value.delete(sessionId)
    messagesSnapshots.value.delete(sessionId)
    reactIteration.deleteIterationIndex(sessionId)
    planManager.deletePlanState(sessionId)

    if (streamingSessionId.value === sessionId) {
      streamingSessionId.value = null
    }

    window.api.logger.debug('[PaperChatStreamStore] 重置会话状态', { sessionId })
  }

  // 重置所有状态
  function resetAllState(): void {
    isSending.value = false
    sessionSendingStates.value.clear()
    messagesSnapshots.value.clear()
    reactIteration.currentIterationIndex.value.clear()
    planManager.planStates.value = new Map()
    streamingSessionId.value = null
    cleanupStreamListener()

    window.api.logger.info('[PaperChatStreamStore] 重置所有状态')
  }

  return {
    // 状态
    isSending,
    sessionSendingStates,
    messagesSnapshots,
    streamingSessionId,
    showUserInteraction,
    userInteractionInfo,
    planStates: planManager.planStates,
    // 计算属性
    streamingSessionCount,
    activeSessionIds,
    // 操作
    getSessionSendingState,
    setSessionSendingState,
    setIsSending,
    saveMessagesSnapshot,
    getMessagesSnapshot,
    clearMessagesSnapshot,
    hideUserInteraction,
    beginPlanning: planManager.beginPlanning,
    failPlanState: planManager.failPlanState,
    getSessionPlanState: planManager.getSessionPlanState,
    resetPlanState: planManager.resetPlanState,
    handleStreamEvent,
    setupStreamListener,
    cleanupStreamListener,
    stopRequest,
    resetSessionState,
    resetAllState
  }
})
