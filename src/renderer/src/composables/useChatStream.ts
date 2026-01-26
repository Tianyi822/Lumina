import { ref, type Ref } from 'vue'
import type { Message, StreamEvent, SessionData } from '../types'

/**
 * 聊天流式处理 Composable
 * 负责流式事件监听、消息更新、ReAct 步骤跟踪
 */
export function useChatStream(
  currentSession: () => SessionData | null,
  messages: () => Message[],
  onSaveSession?: () => Promise<void>,
  onSaveCachedSession?: (sessionId: string) => Promise<void>,
  onChatError?: (error: string) => void
): {
  isSending: Ref<boolean>
  setupStreamListener: (sessionMessagesCache: Map<string, Message[]>) => void
  cleanupStreamListener: () => void
  handleStreamEvent: (event: StreamEvent, sessionMessagesCache: Map<string, Message[]>) => void
  stopRequest: (sessionId?: string) => Promise<void>
  getMessagesSnapshot: () => Message[] | null
  setMessagesSnapshot: (snapshot: Message[] | null) => void
  getStreamingSessionId: () => string | null
  setStreamingSessionId: (sessionId: string | null) => void
} {
  // 是否正在发送消息
  const isSending = ref(false)

  // 发送前的消息快照（用于错误回滚）
  let messagesSnapshot: Message[] | null = null

  // 当前正在流式响应的会话ID
  let streamingSessionId: string | null = null

  // 流式监听器清理函数
  let cleanupStreamListener: (() => void) | null = null

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
   * 处理流式事件
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
      // 无法确定目标会话，使用当前消息
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
        if (isCurrentSession) {
          // 当前会话发生错误：回滚到发送前状态
          if (messagesSnapshot) {
            // 直接修改 messages.value
            const msgs = messages()
            msgs.length = 0
            msgs.push(...messagesSnapshot)
            messagesSnapshot = null
          }
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
  function setupStreamListener(sessionMessagesCache: Map<string, Message[]>): void {
    cleanupStreamListener = window.api.chat.onStream((event: StreamEvent) => {
      handleStreamEvent(event, sessionMessagesCache)
    })
  }

  /**
   * 清理流式监听器
   */
  function cleanupStreamListenerFn(): void {
    if (cleanupStreamListener) {
      cleanupStreamListener()
      cleanupStreamListener = null
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
    cleanupStreamListener: cleanupStreamListenerFn,
    handleStreamEvent,
    stopRequest,
    getMessagesSnapshot,
    setMessagesSnapshot,
    getStreamingSessionId,
    setStreamingSessionId
  }
}
