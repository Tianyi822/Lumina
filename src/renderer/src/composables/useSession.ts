import { ref, type Ref } from 'vue'
import type { Message, SessionData, SessionListItem } from '../types'
import { sessionMessageToMessage } from '../utils/messageHelpers'

/**
 * 会话管理 Composable
 * 负责会话的创建、加载、保存、切换、删除
 */
export function useSession(): {
  currentSession: Ref<SessionData | null>
  currentChatId: Ref<string | undefined>
  messages: Ref<Message[]>
  sessionList: Ref<SessionListItem[]>
  sessionUpdateKey: Ref<number>
  loadSessionList: () => Promise<void>
  refreshSessionList: () => Promise<void>
  saveCurrentSession: () => Promise<void>
  createSession: () => Promise<void>
  loadSession: (
    sessionId: string,
    getCachedSession?: (sessionId: string) => { messages: Message[]; title?: string } | null
  ) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  updateSessionTitle: (title: string) => void
} {
  // 当前会话数据
  const currentSession = ref<SessionData | null>(null)

  // 当前对话ID（兼容旧代码）
  const currentChatId = ref<string | undefined>(undefined)

  // 当前对话的消息列表
  const messages = ref<Message[]>([])

  // 会话列表
  const sessionList = ref<SessionListItem[]>([])

  // 会话列表更新计数器（用于触发 Sidebar 更新）
  const sessionUpdateKey = ref(0)

  /**
   * 加载会话列表
   */
  async function loadSessionList(): Promise<void> {
    try {
      sessionList.value = await window.api.session.list()
    } catch (error) {
      window.api.logger.error('加载会话列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 刷新会话列表
   */
  async function refreshSessionList(): Promise<void> {
    await loadSessionList()
    sessionUpdateKey.value++
  }

  /**
   * 保存当前会话
   */
  async function saveCurrentSession(): Promise<void> {
    if (!currentSession.value) {
      return
    }

    try {
      // 创建一个纯净的数据对象（不包含 Vue 响应式代理）
      const sessionToSave: SessionData = {
        sessionId: currentSession.value.sessionId,
        title: currentSession.value.title,
        createdAt: currentSession.value.createdAt,
        updatedAt: new Date().toISOString(),
        messages: messages.value.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          timestamp: msg.timestamp || new Date().toISOString(),
          modelName: msg.modelName,
          usage: msg.usage
            ? {
                prompt_tokens: msg.usage.prompt_tokens,
                completion_tokens: msg.usage.completion_tokens,
                total_tokens: msg.usage.total_tokens,
                reasoning_tokens: msg.usage.reasoning_tokens
              }
            : undefined
        }))
      }

      const result = await window.api.session.save(sessionToSave)
      if (!result.success) {
        window.api.logger.error('保存会话失败', { error: result.error })
      } else {
        // 更新本地会话数据
        currentSession.value.messages = sessionToSave.messages
        currentSession.value.updatedAt = sessionToSave.updatedAt
        // 刷新会话列表
        await refreshSessionList()
      }
    } catch (error) {
      window.api.logger.error('保存会话异常', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 创建新会话
   */
  async function createSession(): Promise<void> {
    try {
      // 创建新会话
      const session = await window.api.session.create()
      currentSession.value = session
      currentChatId.value = session.sessionId
      messages.value = []

      // 刷新会话列表
      await refreshSessionList()
    } catch (error) {
      window.api.logger.error('创建会话失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      // 降级处理：仅在本地创建
      const newChatId = `chat-${Date.now()}`
      currentChatId.value = newChatId
      messages.value = []
    }
  }

  /**
   * 加载会话
   */
  async function loadSession(
    sessionId: string,
    getCachedSession?: (sessionId: string) => { messages: Message[]; title?: string } | null
  ): Promise<void> {
    // 如果选择的是当前会话，直接返回
    if (currentSession.value?.sessionId === sessionId) {
      return
    }

    try {
      // 检查目标会话是否有缓存的消息
      const cached = getCachedSession ? getCachedSession(sessionId) : null

      if (cached && cached.messages.length > 0) {
        // 使用缓存的消息（可能包含流式响应状态）
        const session = await window.api.session.load(sessionId)
        if (session) {
          currentSession.value = session
          currentChatId.value = session.sessionId
          // 恢复缓存的标题（如果有的话）
          if (cached.title) {
            currentSession.value.title = cached.title
          }
          // 深拷贝缓存的消息，避免引用问题
          messages.value = cached.messages.map((msg) => ({ ...msg }))
          window.api.logger.debug('加载会话：使用缓存', {
            sessionId,
            title: currentSession.value.title
          })
        }
      } else {
        // 正常加载会话数据
        const session = await window.api.session.load(sessionId)
        if (session) {
          currentSession.value = session
          currentChatId.value = session.sessionId
          // 转换消息格式（从文件加载的消息不会有 isStreaming）
          messages.value = session.messages.map(sessionMessageToMessage)
        } else {
          window.api.logger.warn('会话不存在', { sessionId })
        }
      }
    } catch (error) {
      window.api.logger.error('加载会话失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<void> {
    try {
      const result = await window.api.session.delete(sessionId)
      if (result.success) {
        // 如果删除的是当前会话，清空当前状态
        if (currentSession.value?.sessionId === sessionId) {
          currentSession.value = null
          currentChatId.value = undefined
          messages.value = []
        }
        // 刷新会话列表
        await refreshSessionList()
      } else {
        window.api.logger.error('删除会话失败', { error: result.error })
      }
    } catch (error) {
      window.api.logger.error('删除会话异常', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 更新会话标题
   */
  function updateSessionTitle(title: string): void {
    if (currentSession.value) {
      currentSession.value.title = title
    }
  }

  return {
    currentSession,
    currentChatId,
    messages,
    sessionList,
    sessionUpdateKey,
    loadSessionList,
    refreshSessionList,
    saveCurrentSession,
    createSession,
    loadSession,
    deleteSession,
    updateSessionTitle
  }
}
