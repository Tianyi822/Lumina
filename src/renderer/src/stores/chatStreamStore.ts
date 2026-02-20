// 聊天流状态 Store
// 管理聊天流状态，包括多会话并发、流式事件处理

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Message, StreamEvent, UserInteractionRequest } from '@renderer/types'
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
        messageCache.cacheSession(targetSessionId, targetMessages)
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

      case 'reasoning':
        if (streamingMessage && event.content) {
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content
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

          // 2. 同时更新 reactSteps（UI 展示）
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          streamingMessage.reactSteps.push({
            type: 'tool_call',
            toolCall: event.toolCall,
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'tool_result':
        if (streamingMessage && event.toolResult) {
          // 1. 创建独立的 tool 消息（标准格式）
          // 安全序列化 result，处理可能包含复杂对象的情况
          let toolContent: string
          try {
            if (event.toolResult.success) {
              const result = event.toolResult.result
              // 如果 result 是字符串，直接使用；否则尝试序列化
              if (typeof result === 'string') {
                toolContent = result
              } else {
                toolContent = JSON.stringify(result)
              }
            } else {
              toolContent = JSON.stringify({ error: event.toolResult.error })
            }
          } catch {
            toolContent = JSON.stringify({ raw: String(event.toolResult.result) })
          }

          const toolMessage: Message = {
            id: `msg-${Date.now()}`,
            role: 'tool',
            content: toolContent,
            tool_call_id: event.toolResult.id,
            timestamp: new Date().toISOString()
          }
          targetMessages.push(toolMessage)

          // 2. 同时更新 reactSteps（UI 展示）
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          streamingMessage.reactSteps.push({
            type: 'tool_result',
            toolResult: event.toolResult,
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'knowledge_search':
        if (streamingMessage && event.knowledgeSearch) {
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          // 使用 knowledgeBaseId 作为 ID，确保与 knowledge_result 的 ID 一致
          streamingMessage.reactSteps.push({
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
        if (streamingMessage && event.knowledgeResult) {
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          // 使用 knowledgeBaseId 作为 ID，与 knowledge_search 的 ID 保持一致
          streamingMessage.reactSteps.push({
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
  async function stopRequest(sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || streamingSessionId.value
    if (!targetSessionId) {
      window.api.logger.warn('[ChatStreamStore] 没有活动的流式会话可停止')
      return
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
