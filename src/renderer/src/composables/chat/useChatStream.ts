import { ref } from 'vue'
import type { Message, StreamEvent, SessionData } from '../../types'

/**
 * 聊天流式处理 Composable
 * 负责流式事件监听、消息更新、ReAct 步骤跟踪
 */
export function useChatStream() {
  // 是否正在发送消息（全局状态，用于当前会话）
  const isSending = ref(false)

  // 会话级别的发送状态（用于多会话并发管理）
  const sessionSendingStates = ref<Map<string, boolean>>(new Map())

  // 发送前的消息快照（用于错误回滚）
  let messagesSnapshot: Message[] | null = null

  // 当前正在流式响应的会话ID
  let streamingSessionId: string | null = null

  // 流式监听器清理函数
  let cleanupStreamListenerFn: (() => void) | null = null

  // 延迟初始化的依赖项
  let currentSession: () => SessionData | null
  let messages: () => Message[]
  let onSaveSession: (() => Promise<void>) | undefined
  let onSaveCachedSession: ((sessionId: string) => Promise<void>) | undefined
  let onChatError: ((error: string) => void) | undefined

  /**
   * 初始化依赖项（延迟绑定）
   */
  function init(
    getCurrentSession: () => SessionData | null,
    getMessages: () => Message[],
    saveSession?: () => Promise<void>,
    saveCachedSession?: (sessionId: string) => Promise<void>,
    chatError?: (error: string) => void
  ) {
    currentSession = getCurrentSession
    messages = getMessages
    onSaveSession = saveSession
    onSaveCachedSession = saveCachedSession
    onChatError = chatError
  }

  /**
   * 获取消息快照
   */
  function getMessagesSnapshot(): Message[] | null {
    return messagesSnapshot
  }

  /**
   * 设置消息快照
   */
  function setMessagesSnapshot(snapshot: Message[] | null): void {
    messagesSnapshot = snapshot
  }

  /**
   * 获取当前流式响应的会话ID
   */
  function getStreamingSessionId(): string | null {
    return streamingSessionId
  }

  /**
   * 设置流式响应的会话ID
   */
  function setStreamingSessionId(sessionId: string | null): void {
    streamingSessionId = sessionId
  }

  /**
   * 获取指定会话的发送状态
   */
  function getSessionSendingState(sessionId: string): boolean {
    return sessionSendingStates.value.get(sessionId) || false
  }

  /**
   * 设置指定会话的发送状态
   */
  function setSessionSendingState(sessionId: string, state: boolean): void {
    sessionSendingStates.value.set(sessionId, state)
    // 如果是当前会话，同步更新全局 isSending
    if (sessionId === currentSession()?.sessionId) {
      isSending.value = state
    }
  }

  /**
   * 处理流式事件
   * 确保每个会话的消息状态完全独立
   */
  function handleStreamEvent(
    event: StreamEvent,
    sessionMessagesCache: Map<string, Message[]>
  ): void {
    const targetSessionId = event.sessionId
    const currentSessionId = currentSession()?.sessionId

    // 如果事件没有 sessionId，尝试使用当前正在流式响应的会话ID
    const effectiveSessionId = targetSessionId || streamingSessionId

    // 判断是否是当前会话的事件
    const isCurrentSession = effectiveSessionId === currentSessionId

    // 获取目标消息列表（当前会话或缓存）
    let targetMessages: Message[]
    if (isCurrentSession) {
      targetMessages = messages()
    } else if (effectiveSessionId) {
      // 非当前会话：从缓存获取或初始化
      if (!sessionMessagesCache.has(effectiveSessionId)) {
        sessionMessagesCache.set(effectiveSessionId, [])
      }
      targetMessages = sessionMessagesCache.get(effectiveSessionId)!
    } else {
      // 无法确定目标会话，使用当前消息（这种情况不应该发生）
      window.api.logger.warn('流式事件无法确定目标会话', { event })
      targetMessages = messages()
    }

    // 找到正在流式输出的消息
    const streamingMessage = targetMessages.find((msg) => msg.isStreaming)

    switch (event.type) {
      case 'content':
        if (streamingMessage && event.content) {
          streamingMessage.content += event.content
        }
        break

      case 'reasoning':
        if (streamingMessage && event.content) {
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content
        }
        break

      case 'tool_call':
        if (streamingMessage && event.toolCall) {
          // 初始化 reactSteps 数组
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          // 添加工具调用步骤
          streamingMessage.reactSteps.push({
            type: 'tool_call',
            toolCall: event.toolCall,
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'tool_result':
        if (streamingMessage && event.toolResult) {
          // 初始化 reactSteps 数组
          if (!streamingMessage.reactSteps) {
            streamingMessage.reactSteps = []
          }
          // 添加工具结果步骤
          streamingMessage.reactSteps.push({
            type: 'tool_result',
            toolResult: event.toolResult,
            timestamp: new Date().toISOString()
          })
        }
        break

      case 'done':
        if (streamingMessage) {
          streamingMessage.isStreaming = false
          if (event.usage) {
            streamingMessage.usage = event.usage
          }
        }
        // 使用会话级别的状态管理
        if (effectiveSessionId) {
          // 更新该会话的发送状态
          sessionSendingStates.value.set(effectiveSessionId, false)
        }
        // 只有当前会话才更新 isSending 状态和保存
        if (isCurrentSession) {
          isSending.value = false
          // 清空快照，成功完成后保存会话
          messagesSnapshot = null
          streamingSessionId = null
          if (onSaveSession) {
            onSaveSession()
          }
        } else if (effectiveSessionId) {
          // 非当前会话：清除 streamingSessionId（如果匹配）
          if (streamingSessionId === effectiveSessionId) {
            streamingSessionId = null
          }
          // 同步更新缓存中的消息状态（确保 isStreaming 被正确设置为 false）
          const cachedMsgs = sessionMessagesCache.get(effectiveSessionId)
          if (cachedMsgs) {
            const cachedStreamingMsg = cachedMsgs.find((msg) => msg.isStreaming)
            if (cachedStreamingMsg) {
              cachedStreamingMsg.isStreaming = false
              if (event.usage) {
                cachedStreamingMsg.usage = event.usage
              }
            }
          }
          // 更新缓存并保存该会话
          if (onSaveCachedSession) {
            onSaveCachedSession(effectiveSessionId)
          }
        }
        break

      case 'error':
        // 使用会话级别的状态管理
        if (effectiveSessionId) {
          // 重置该会话的发送状态
          sessionSendingStates.value.set(effectiveSessionId, false)
        }

        if (isCurrentSession) {
          // 当前会话发生错误：回滚到发送前状态
          if (messagesSnapshot) {
            // 直接修改 messages.value
            const msgs = messages()
            msgs.length = 0
            msgs.push(...messagesSnapshot)
            messagesSnapshot = null
          }
          // 同步更新全局 isSending
          isSending.value = false
          streamingSessionId = null
          window.api.logger.error('聊天错误', { error: event.error, sessionId: currentSessionId })
          // 显示临时错误提示（不保存会话）
          if (onChatError) {
            onChatError(event.error || '未知错误')
          }
        } else if (effectiveSessionId) {
          // 非当前会话发生错误：清除 streamingSessionId（如果匹配）
          if (streamingSessionId === effectiveSessionId) {
            streamingSessionId = null
          }
          // 从缓存中移除（不保存错误状态）
          sessionMessagesCache.delete(effectiveSessionId)
          window.api.logger.error('聊天错误（后台会话）', {
            error: event.error,
            sessionId: effectiveSessionId
          })
        }
        break
    }
  }

  /**
   * 设置流式响应监听器
   */
  function setupStreamListener(
    getCurrentSession: () => SessionData | null,
    getMessages: () => Message[],
    saveSession?: () => Promise<void>,
    saveCachedSession?: (sessionId: string) => Promise<void>,
    chatError?: (error: string) => void,
    sessionMessagesCache?: Map<string, Message[]>
  ): void {
    // 初始化依赖项
    init(getCurrentSession, getMessages, saveSession, saveCachedSession, chatError)

    // 如果传入了缓存，使用缓存的引用
    const cache = sessionMessagesCache || new Map()

    cleanupStreamListenerFn = window.api.chat.onStream((event: StreamEvent) => {
      handleStreamEvent(event, cache)
    })
  }

  /**
   * 清理流式监听器
   */
  function cleanupStreamListener(): void {
    if (cleanupStreamListenerFn) {
      cleanupStreamListenerFn()
      cleanupStreamListenerFn = null
    }
  }

  /**
   * 中止当前请求
   */
  async function stopRequest(sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || currentSession()?.sessionId
    try {
      await window.api.chat.stop(targetSessionId)
    } catch (error) {
      window.api.logger.error('中止请求失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: targetSessionId
      })
    }
  }

  return {
    isSending,
    setupStreamListener,
    cleanupStreamListener,
    handleStreamEvent,
    stopRequest,
    getMessagesSnapshot,
    setMessagesSnapshot,
    getStreamingSessionId,
    setStreamingSessionId,
    getSessionSendingState,
    setSessionSendingState
  }
}
