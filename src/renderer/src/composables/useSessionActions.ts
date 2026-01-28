import type { Ref } from 'vue'
import { useSession } from './useSession'
import { useMessageCache } from './useMessageCache'

/**
 * 会话操作 Composable
 * 封装会话切换、新建、删除等操作逻辑
 */
export function useSessionActions(chatStream: {
  isSending: Ref<boolean>
  setStreamingSessionId: (sessionId: string | null) => void
}) {
  const { isSending } = chatStream

  // 会话管理
  const {
    currentSession,
    currentChatId,
    messages,
    sessionList,
    sessionUpdateKey,
    loadSessionList,
    createSession,
    loadSession,
    deleteSession,
    updateSessionTitle,
    saveCurrentSession
  } = useSession()

  // 消息缓存管理
  const { sessionMessagesCache, cacheSession, getCachedSession, saveCachedSession } =
    useMessageCache()

  /**
   * 创建新会话
   */
  async function handleNewChat(): Promise<void> {
    await createSession()
  }

  /**
   * 选择会话
   */
  async function handleSelectChat(sessionId: string): Promise<void> {
    // 如果选择的是当前会话，直接返回
    if (currentSession.value?.sessionId === sessionId) {
      return
    }

    // 用于跟踪新会话的发送状态
    let newSessionIsSending = false

    // 如果当前会话有流式响应正在进行，将消息状态和标题保存到缓存
    const currentSessionId = currentSession.value?.sessionId
    if (currentSessionId && isSending.value) {
      cacheSession(currentSessionId, messages.value, currentSession.value?.title)
    }

    // 检查目标会话是否有缓存的消息
    const cached = getCachedSession(sessionId)

    if (cached && cached.messages.length > 0) {
      // 使用缓存的消息
      const session = await window.api.session.load(sessionId)
      if (session) {
        currentSession.value = session
        currentChatId.value = session.sessionId
        // 恢复缓存的标题
        if (cached.title) {
          currentSession.value.title = cached.title
        }
        // 深拷贝缓存的消息
        messages.value = cached.messages.map((msg) => ({ ...msg }))
        // 检查是否有正在流式输出的消息
        newSessionIsSending = messages.value.some((msg) => msg.isStreaming)
      }
    } else {
      // 正常加载会话数据
      await loadSession(sessionId)
      newSessionIsSending = false
    }

    // 更新 isSending 状态为新会话的状态
    isSending.value = newSessionIsSending
  }

  /**
   * 删除会话
   */
  async function handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSession(sessionId)
  }

  return {
    currentSession,
    currentChatId,
    messages,
    sessionList,
    sessionUpdateKey,
    sessionMessagesCache,
    cacheSession,
    saveCachedSession,
    loadSessionList,
    createSession,
    saveCurrentSession,
    handleNewChat,
    handleSelectChat,
    handleDeleteSession,
    updateSessionTitle
  }
}
