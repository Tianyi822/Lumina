import type { Ref } from 'vue'
import type { Message, SessionData, SessionListItem, MCPTool, SessionType } from '../../types'
import { useSession } from '../session/useSession'
import { useMessageCache } from '../session/useMessageCache'
import { useInputState, type SessionInputState } from '../input/useInputState'
import { DEFAULT_NEW_CHAT_TITLE } from '../../constants'

/**
 * 聊天流接口（简化版）
 */
interface ChatStream {
  isSending: Ref<boolean>
}

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
  createSession: (
    beforeCreate?: () => Promise<void>,
    newTitle?: string,
    sessionType?: SessionType
  ) => Promise<void>
  saveCurrentSession: () => Promise<void>
  handleNewChat: (sessionType?: SessionType) => Promise<void>
  handleSelectChat: (sessionId: string) => Promise<boolean>
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
export function useSessionActions(chatStream: ChatStream): SessionActionsReturn {
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
   * 创建新会话前的保存回调
   */
  async function beforeCreateNewChat(): Promise<void> {
    const currentSessionId = currentSession.value?.sessionId

    // 保存当前会话的输入状态
    if (currentSessionId) {
      saveCurrentState(currentSessionId)
    }

    // 缓存当前会话的消息（如果没有缓存）
    if (currentSessionId && messages.value.length > 0 && !getCachedSession(currentSessionId)) {
      cacheSession(currentSessionId, messages.value, currentSession.value?.title)
    }
  }

  /**
   * 创建新会话
   */
  async function handleNewChat(sessionType?: SessionType): Promise<void> {
    await createSession(beforeCreateNewChat, DEFAULT_NEW_CHAT_TITLE, sessionType)
  }

  /**
   * 选择会话
   * @returns 返回新会话的 isSending 状态
   */
  async function handleSelectChat(sessionId: string): Promise<boolean> {
    // 如果选择的是当前会话，直接返回当前发送状态
    if (currentSession.value?.sessionId === sessionId) {
      return isSending.value
    }

    const currentSessionId = currentSession.value?.sessionId

    // 保存当前会话的输入状态和消息
    if (currentSessionId) {
      saveCurrentState(currentSessionId)
      if (messages.value.length > 0) {
        cacheSession(currentSessionId, messages.value, currentSession.value?.title)
      }
    }

    // 切换到目标会话的输入状态
    switchToSession(sessionId)

    // 尝试从缓存加载
    const cached = getCachedSession(sessionId, true)

    if (cached && cached.messages.length > 0) {
      const session = await window.api.session.load(sessionId)
      if (session) {
        currentSession.value = session
        currentChatId.value = session.sessionId
        if (cached.title) {
          currentSession.value.title = cached.title
        }
        messages.value = cached.messages

        const streaming = messages.value.some((msg) => msg.isStreaming)
        window.api.logger.debug('切换会话：使用缓存消息', {
          sessionId,
          messageCount: messages.value.length,
          isStreaming: streaming
        })
        return streaming
      }
    }

    // 正常加载会话数据
    await loadSession(sessionId, getCachedSession)
    return messages.value.some((msg) => msg.isStreaming)
  }

  /**
   * 删除会话
   */
  async function handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSession(sessionId)
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
