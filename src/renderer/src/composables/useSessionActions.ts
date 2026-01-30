import type { Ref } from 'vue'
import type { Message, SessionData, SessionListItem, MCPTool } from '../types'
import { useSession } from './useSession'
import { useMessageCache } from './useMessageCache'
import { useInputState, type SessionInputState } from './useInputState'

// 新会话的默认标题
const DEFAULT_NEW_CHAT_TITLE = '新对话'

/**
 * useSessionActions 返回类型
 */
export interface SessionActionsReturn {
  currentSession: Ref<SessionData | null>
  currentChatId: Ref<string | undefined>
  messages: Ref<Message[]>
  sessionList: Ref<SessionListItem[]>
  sessionUpdateKey: Ref<number>
  sessionMessagesCache: Ref<Map<string, Message[]>>
  cacheSession: (sessionId: string, messages: Message[], title?: string) => void
  saveCachedSession: (sessionId: string) => Promise<void>
  loadSessionList: () => Promise<void>
  createSession: (beforeCreate?: () => Promise<void>, newTitle?: string) => Promise<void>
  saveCurrentSession: () => Promise<void>
  handleNewChat: () => Promise<void>
  handleSelectChat: (sessionId: string) => Promise<boolean> // 返回新会话的 isSending 状态
  handleDeleteSession: (sessionId: string) => Promise<void>
  updateSessionTitle: (title: string) => void
  // 输入状态管理
  currentInputState: Ref<SessionInputState>
  updateInputMessage: (message: string) => void
  updateSelectedModel: (model: string) => void
  updateSelectedTools: (tools: MCPTool[]) => void
  clearInputMessage: () => void
}

/**
 * 会话操作 Composable
 * 封装会话切换、新建、删除等操作逻辑
 */
export function useSessionActions(chatStream: {
  isSending: Ref<boolean>
  setStreamingSessionId: (sessionId: string | null) => void
}): SessionActionsReturn {
  const { isSending } = chatStream

  // 输入状态管理
  const {
    currentInputState,
    saveCurrentState,
    switchToSession,
    deleteSessionState,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    clearInputMessage
  } = useInputState()

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
   * 在创建新会话前，会先保存当前会话的状态（包括正在进行的消息）
   */
  async function handleNewChat(): Promise<void> {
    // 获取当前会话ID
    const currentSessionId = currentSession.value?.sessionId

    // 定义创建前的保存回调
    const beforeCreate = async (): Promise<void> => {
      // 如果有当前会话，先保存其输入状态
      if (currentSessionId) {
        saveCurrentState(currentSessionId)
      }

      // 如果当前会话有消息（无论是正在流式响应还是已完成），都缓存起来
      if (currentSessionId && messages.value.length > 0) {
        // 检查是否已有缓存，避免覆盖
        const existingCache = getCachedSession(currentSessionId)
        if (!existingCache) {
          // 只有当没有缓存时才缓存，保留最新的状态
          cacheSession(currentSessionId, messages.value, currentSession.value?.title)
        }
      }
    }

    // 创建新会话，传入保存回调和默认标题
    await createSession(beforeCreate, DEFAULT_NEW_CHAT_TITLE)
  }

  /**
   * 选择会话
   * @returns 返回新会话的 isSending 状态，供调用者同步更新
   */
  async function handleSelectChat(sessionId: string): Promise<boolean> {
    // 如果选择的是当前会话，直接返回当前发送状态
    if (currentSession.value?.sessionId === sessionId) {
      return isSending.value
    }

    // 用于跟踪新会话的发送状态
    let newSessionIsSending = false

    // 保存当前会话的输入状态
    const currentSessionId = currentSession.value?.sessionId
    if (currentSessionId) {
      saveCurrentState(currentSessionId)
    }

    // 在切换会话前，缓存当前会话的消息（无论是否正在流式响应）
    if (currentSessionId && messages.value.length > 0) {
      // 始终更新缓存，保留最新的消息状态
      cacheSession(currentSessionId, messages.value, currentSession.value?.title)
    }

    // 切换到目标会话的输入状态
    switchToSession(sessionId)

    // 检查目标会话是否有缓存的消息（优先使用缓存，确保显示正在进行的流式响应）
    const cached = getCachedSession(sessionId, true) // 使用引用而非深拷贝

    if (cached && cached.messages.length > 0) {
      // 使用缓存的消息（直接引用，以便流式事件能更新）
      const session = await window.api.session.load(sessionId)
      if (session) {
        currentSession.value = session
        currentChatId.value = session.sessionId
        // 恢复缓存的标题（优先使用缓存中的标题，因为它可能是最新的）
        if (cached.title) {
          currentSession.value.title = cached.title
        }
        // 直接使用缓存的消息引用（不深拷贝），这样流式事件能直接更新
        messages.value = cached.messages
        // 检查是否有正在流式输出的消息
        newSessionIsSending = messages.value.some((msg) => msg.isStreaming)

        window.api.logger.debug('切换会话：使用缓存消息', {
          sessionId,
          messageCount: messages.value.length,
          isStreaming: newSessionIsSending
        })
      }
    } else {
      // 正常加载会话数据
      await loadSession(sessionId, getCachedSession)
      newSessionIsSending = messages.value.some((msg) => msg.isStreaming)
    }

    // 返回新会话的发送状态，供调用者同步更新实际的 isSending ref
    return newSessionIsSending
  }

  /**
   * 删除会话
   */
  async function handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSession(sessionId)
    // 清理该会话的输入状态
    deleteSessionState(sessionId)
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
    updateSessionTitle,
    // 输入状态管理
    currentInputState,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    clearInputMessage
  }
}
