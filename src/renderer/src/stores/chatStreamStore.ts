// 聊天流状态 Store
// 管理聊天流状态，包括多会话并发、流式事件处理

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Message,
  ReActIteration,
  ReActStep,
  StreamEvent,
  UserInteractionRequest
} from '@renderer/types'
import { useMessageCacheStore } from './messageCacheStore'

export const useChatStreamStore = defineStore('chatStream', () => {
  // ==================== Dependencies ====================

  const messageCache = useMessageCacheStore()

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

  // 每个会话当前活跃的迭代索引（用于 ReAct 迭代分组）
  const currentIterationIndex = ref<Map<string, number>>(new Map())

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

  // ==================== Helpers ====================

  /**
   * 获取当前迭代对象
   * 从 currentIterationIndex Map 获取索引，返回消息的当前活跃迭代
   */
  function getCurrentIteration(message: Message, sessionId: string): ReActIteration | null {
    const index = currentIterationIndex.value.get(sessionId)
    if (index === undefined || !message.reactIterations) return null
    return message.reactIterations[index] || null
  }

  /**
   * 检查迭代是否包含可展示内容
   */
  function hasIterationContent(iteration: ReActIteration): boolean {
    return iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
  }

  /**
   * 创建新的迭代分组，并将上一轮标记为完成
   */
  function createIteration(
    message: Message,
    sessionId: string,
    iterationNum?: number,
    status?: 'thinking' | 'calling_tools' | 'processing'
  ): ReActIteration {
    if (!message.reactIterations) {
      message.reactIterations = []
    }

    const prevIndex = currentIterationIndex.value.get(sessionId)
    if (prevIndex !== undefined && message.reactIterations[prevIndex]) {
      message.reactIterations[prevIndex].isActive = false
    }

    const nextIterationNum = iterationNum ?? message.reactIterations.length
    const newIteration: ReActIteration = {
      iteration: nextIterationNum,
      reasoning: '',
      steps: [],
      isActive: true,
      status: status || 'thinking'
    }

    message.reactIterations.push(newIteration)
    currentIterationIndex.value.set(sessionId, message.reactIterations.length - 1)

    return newIteration
  }

  /**
   * 确保当前会话存在活跃迭代
   * 兼容未显式发送 react_iteration_start 的旧事件流
   */
  function ensureCurrentIteration(message: Message, sessionId: string): ReActIteration {
    const currentIteration = getCurrentIteration(message, sessionId)
    if (currentIteration) {
      return currentIteration
    }

    return createIteration(message, sessionId)
  }

  /**
   * 将工具步骤同时追加到兼容字段和阶段分组
   */
  function appendToolStep(message: Message, sessionId: string, step: ReActStep): void {
    if (!message.reactSteps) {
      message.reactSteps = []
    }
    message.reactSteps.push(step)

    const currentIteration = ensureCurrentIteration(message, sessionId)
    currentIteration.steps.push(step)
  }

  /**
   * 结束当前会话的 ReAct 分组并清理空阶段
   */
  function finalizeIterations(message: Message, sessionId: string): void {
    const currentIteration = getCurrentIteration(message, sessionId)
    if (currentIteration) {
      currentIteration.isActive = false
    }

    if (message.reactIterations) {
      message.reactIterations = message.reactIterations.filter(hasIterationContent)
    }

    currentIterationIndex.value.delete(sessionId)
  }

  /**
   * 查找某个工具调用所属的 assistant 消息
   */
  function findToolOwnerMessage(messages: Message[], toolCallId: string): Message | undefined {
    return [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          (message.tool_calls?.some((toolCall) => toolCall.id === toolCallId) ||
            message.reactSteps?.some(
              (step) =>
                (step.type === 'tool_call' && step.toolCall?.id === toolCallId) ||
                (step.type === 'tool_result' && step.toolResult?.id === toolCallId)
            ))
      )
  }

  /**
   * 更新或创建对应的 tool 消息
   */
  function upsertToolMessage(
    messages: Message[],
    toolResult: NonNullable<StreamEvent['toolResult']>
  ): void {
    let toolContent: string
    try {
      if (toolResult.success) {
        toolContent =
          typeof toolResult.result === 'string'
            ? toolResult.result
            : JSON.stringify(toolResult.result)
      } else if (toolResult.result !== undefined) {
        toolContent = JSON.stringify({
          error: toolResult.error,
          result: toolResult.result
        })
      } else {
        toolContent = JSON.stringify({ error: toolResult.error })
      }
    } catch {
      toolContent = JSON.stringify({ raw: String(toolResult.result) })
    }

    const existingMessage = messages.find(
      (message) => message.role === 'tool' && message.tool_call_id === toolResult.id
    )

    if (existingMessage) {
      existingMessage.content = toolContent
      existingMessage.timestamp = new Date().toISOString()
      return
    }

    messages.push({
      id: `msg-${Date.now()}`,
      role: 'tool',
      content: toolContent,
      tool_call_id: toolResult.id,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 更新已存在的 tool_result 步骤
   */
  function updateToolResultStep(
    message: Message,
    toolResult: NonNullable<StreamEvent['toolResult']>
  ): boolean {
    const timestamp = new Date().toISOString()

    const existingLegacyStep = message.reactSteps?.find(
      (step) => step.type === 'tool_result' && step.toolResult?.id === toolResult.id
    )
    if (existingLegacyStep) {
      existingLegacyStep.toolResult = toolResult
      existingLegacyStep.timestamp = timestamp
    }

    let updatedIteration = false
    for (const iteration of message.reactIterations || []) {
      const existingIterationStep = iteration.steps.find(
        (step) => step.type === 'tool_result' && step.toolResult?.id === toolResult.id
      )
      if (existingIterationStep) {
        existingIterationStep.toolResult = toolResult
        existingIterationStep.timestamp = timestamp
        updatedIteration = true
      }
    }

    return Boolean(existingLegacyStep || updatedIteration)
  }

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

    window.api.logger.debug('[ChatStreamStore] 设置会话发送状态', {
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

    window.api.logger.debug('[ChatStreamStore] 保存消息快照', {
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
      window.api.logger.warn('[ChatStreamStore] 无法确定目标会话', { event })
      return
    }

    const isCurrentSession = targetSessionId === currentSessionId

    // 获取目标消息列表
    let targetMessages: Message[]
    if (isCurrentSession) {
      targetMessages = currentMessages
    } else {
      // 非当前会话：从缓存获取或初始化
      const cached = messageCache.getCachedMessagesRef(targetSessionId)
      if (cached) {
        targetMessages = cached
      } else {
        // 创建新缓存
        targetMessages = []
        targetMessages = messageCache.cacheSession(targetSessionId, targetMessages)
      }
    }

    // 找到正在流式输出的消息
    const streamingMessage = targetMessages.find((msg) => msg.isStreaming)

    switch (event.type) {
      case 'content':
        if (streamingMessage && event.content) {
          streamingMessage.content = streamingMessage.content + event.content
        }
        break

      case 'react_iteration_start':
        if (streamingMessage && event.content !== undefined) {
          const iterationNum = parseInt(event.content, 10)
          createIteration(
            streamingMessage,
            targetSessionId,
            iterationNum,
            event.status as 'thinking' | 'calling_tools' | 'processing' | undefined
          )
        }
        break

      case 'reasoning':
        if (streamingMessage && event.content) {
          // 保持现有逻辑：累加到 message.reasoning（向后兼容）
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content

          // 新增：同时累加到当前迭代的 reasoning
          const iterForReasoning = getCurrentIteration(streamingMessage, targetSessionId)
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
          appendToolStep(streamingMessage, targetSessionId, toolCallStep)

          // 更新当前迭代状态为 calling_tools
          const currentIter = getCurrentIteration(streamingMessage, targetSessionId)
          if (currentIter && currentIter.status === 'thinking') {
            currentIter.status = 'calling_tools'
          }
        }
        break

      case 'tool_result':
        if (event.toolResult) {
          const targetAssistantMessage =
            streamingMessage || findToolOwnerMessage(targetMessages, event.toolResult.id)

          const hasExistingToolMessage = targetMessages.some(
            (message) => message.role === 'tool' && message.tool_call_id === event.toolResult?.id
          )
          if (targetAssistantMessage || hasExistingToolMessage) {
            upsertToolMessage(targetMessages, event.toolResult)
          }

          if (targetAssistantMessage) {
            if (streamingMessage && targetAssistantMessage.id === streamingMessage.id) {
              const updated = updateToolResultStep(targetAssistantMessage, event.toolResult)
              if (!updated) {
                const toolResultStep = {
                  type: 'tool_result' as const,
                  toolResult: event.toolResult,
                  timestamp: new Date().toISOString()
                }
                appendToolStep(targetAssistantMessage, targetSessionId, toolResultStep)
              }
            } else if (!updateToolResultStep(targetAssistantMessage, event.toolResult)) {
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
          appendToolStep(streamingMessage, targetSessionId, kbSearchStep)
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
          appendToolStep(streamingMessage, targetSessionId, kbResultStep)
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
      finalizeIterations(streamingMessage, sessionId)
    } else {
      currentIterationIndex.value.delete(sessionId)
    }

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
      messageCache.saveCachedSession(sessionId)
    }

    window.api.logger.debug('[ChatStreamStore] 流式响应完成', {
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
    // 重置发送状态
    sessionSendingStates.value.set(sessionId, false)

    // 清除迭代索引跟踪
    currentIterationIndex.value.delete(sessionId)

    if (isCurrentSession) {
      // 当前会话：回滚到发送前状态
      const snapshot = getMessagesSnapshot(sessionId)
      if (snapshot) {
        targetMessages.length = 0
        targetMessages.push(...snapshot)
      }
      isSending.value = false
      streamingSessionId.value = null
      clearMessagesSnapshot(sessionId)
      hideUserInteraction()
    } else {
      // 非当前会话：清除缓存
      if (streamingSessionId.value === sessionId) {
        streamingSessionId.value = null
      }
      messageCache.clearSessionCache(sessionId)
    }

    window.api.logger.error('[ChatStreamStore] 流式响应错误', {
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

    window.api.logger.info('[ChatStreamStore] 流式监听器已设置')
  }

  // 清理流式监听器
  function cleanupStreamListener(): void {
    if (cleanupStreamListenerFn.value) {
      cleanupStreamListenerFn.value()
      cleanupStreamListenerFn.value = null
      window.api.logger.info('[ChatStreamStore] 流式监听器已清理')
    }
  }

  // 中止当前请求
  // 立即更新本地状态，异步通知后端停止
  async function stopRequest(sessionId?: string, currentMessages?: Message[]): Promise<void> {
    const targetSessionId = sessionId || streamingSessionId.value
    if (!targetSessionId) {
      window.api.logger.warn('[ChatStreamStore] 没有活动的流式会话可停止')
      return
    }

    const targetMessages =
      currentMessages && currentMessages.length > 0
        ? currentMessages
        : messageCache.getCachedMessagesRef(targetSessionId)

    const streamingMessage = targetMessages?.find((msg) => msg.isStreaming)
    if (streamingMessage) {
      streamingMessage.isStreaming = false
      finalizeIterations(streamingMessage, targetSessionId)
    } else {
      currentIterationIndex.value.delete(targetSessionId)
    }

    // 立即更新本地状态，不等待后端响应
    sessionSendingStates.value.set(targetSessionId, false)
    if (streamingSessionId.value === targetSessionId) {
      isSending.value = false
    }
    streamingSessionId.value = null
    clearMessagesSnapshot(targetSessionId)

    window.api.logger.info('[ChatStreamStore] 正在停止请求', { sessionId: targetSessionId })

    try {
      // 异步调用后端停止（不等待结果）
      window.api.chat.stop(targetSessionId).catch((error) => {
        window.api.logger.error('[ChatStreamStore] 停止请求失败', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: targetSessionId
        })
      })
    } catch (error) {
      window.api.logger.error('[ChatStreamStore] 停止请求异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: targetSessionId
      })
    }
  }

  // 重置指定会话的状态
  function resetSessionState(sessionId: string): void {
    sessionSendingStates.value.delete(sessionId)
    messagesSnapshots.value.delete(sessionId)
    currentIterationIndex.value.delete(sessionId)

    if (streamingSessionId.value === sessionId) {
      streamingSessionId.value = null
    }

    window.api.logger.debug('[ChatStreamStore] 重置会话状态', { sessionId })
  }

  // 重置所有状态
  function resetAllState(): void {
    isSending.value = false
    sessionSendingStates.value.clear()
    messagesSnapshots.value.clear()
    currentIterationIndex.value.clear()
    streamingSessionId.value = null
    cleanupStreamListener()

    window.api.logger.info('[ChatStreamStore] 重置所有状态')
  }

  return {
    // State
    isSending,
    sessionSendingStates,
    messagesSnapshots,
    streamingSessionId,
    showUserInteraction,
    userInteractionInfo,
    // Getters
    streamingSessionCount,
    activeSessionIds,
    // Actions
    getSessionSendingState,
    setSessionSendingState,
    setIsSending,
    saveMessagesSnapshot,
    getMessagesSnapshot,
    clearMessagesSnapshot,
    hideUserInteraction,
    handleStreamEvent,
    setupStreamListener,
    cleanupStreamListener,
    stopRequest,
    resetSessionState,
    resetAllState
  }
})
