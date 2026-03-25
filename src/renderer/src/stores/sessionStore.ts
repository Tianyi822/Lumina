// 会话核心 Store
// 整合所有会话相关状态，提供统一的会话管理接口

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Message, SessionListItem, SessionType } from '@renderer/types'
import type { SessionData } from '@shared/types/session'
import { sessionMessageToMessage, messageToSessionMessage } from '@renderer/utils/messageHelpers'
import { useMessageCacheStore } from './messageCacheStore'
import { useInputStateStore } from './inputStateStore'
import { useChatStreamStore } from './chatStreamStore'

// 默认新会话标题
const DEFAULT_NEW_CHAT_TITLE = '新对话'

export const useSessionStore = defineStore('session', () => {
  // ==================== Dependencies ====================

  const messageCache = useMessageCacheStore()
  const inputState = useInputStateStore()
  const chatStream = useChatStreamStore()

  // ==================== State ====================

  // 当前会话数据
  const currentSession = ref<SessionData | null>(null)

  // 当前对话 ID（兼容旧代码）
  const currentChatId = ref<string | undefined>(undefined)

  // 当前对话的消息列表
  const messages = ref<Message[]>([])

  // 会话列表
  const sessionList = ref<SessionListItem[]>([])

  // 会话列表更新计数器（用于触发 Sidebar 更新）
  const sessionUpdateKey = ref(0)

  // 是否正在加载会话
  const isLoading = ref(false)

  // ==================== Getters ====================

  // 当前会话是否正在发送消息
  const isCurrentSessionSending = computed(() => {
    if (!currentChatId.value) return false
    return chatStream.getSessionSendingState(currentChatId.value)
  })

  // 当前会话是否有正在流式传输的消息
  const hasStreamingMessage = computed(() => {
    return messages.value.some((msg) => msg.isStreaming)
  })

  // 获取会话数量
  const sessionCount = computed(() => sessionList.value.length)

  // 当前会话的输入状态
  const currentInputState = computed(() => inputState.currentInputState)

  // ==================== Actions ====================

  // 加载会话列表
  async function loadSessionList(): Promise<void> {
    try {
      isLoading.value = true
      sessionList.value = await window.api.session.list()

      window.api.logger.info('[SessionStore] 会话列表加载完成', {
        count: sessionList.value.length
      })
    } catch (error) {
      window.api.logger.error('[SessionStore] 加载会话列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      isLoading.value = false
    }
  }

  // 刷新会话列表
  async function refreshSessionList(): Promise<void> {
    await loadSessionList()
    sessionUpdateKey.value++
  }

  // 加载指定会话
  async function loadSession(sessionId: string, useCache: boolean = true): Promise<boolean> {
    // 如果选择的是当前会话，直接返回
    if (currentSession.value?.sessionId === sessionId) {
      window.api.logger.debug('[SessionStore] 会话已是当前会话', { sessionId })
      return true
    }

    try {
      isLoading.value = true

      // 尝试从缓存加载
      if (useCache) {
        const cached = messageCache.getCachedSession(sessionId, true)
        if (cached && cached.messages.length > 0) {
          const session = await window.api.session.load(sessionId)
          if (session) {
            inputState.applySessionSelectionState(sessionId, session.selectionState)
            inputState.switchToSession(sessionId)
            currentSession.value = session
            currentChatId.value = session.sessionId
            if (cached.title) {
              currentSession.value.title = cached.title
            }
            messages.value = cached.messages

            window.api.logger.info('[SessionStore] 从缓存加载会话', {
              sessionId,
              title: currentSession.value.title,
              messageCount: messages.value.length,
              isStreaming: messages.value.some((m) => m.isStreaming)
            })

            // 同步发送状态
            const isStreaming = messages.value.some((m) => m.isStreaming)
            chatStream.setSessionSendingState(sessionId, isStreaming, true)

            return true
          }
        }
      }

      // 从磁盘加载
      const session = await window.api.session.load(sessionId)
      if (session) {
        inputState.applySessionSelectionState(sessionId, session.selectionState)
        inputState.switchToSession(sessionId)
        currentSession.value = session
        currentChatId.value = session.sessionId
        messages.value = session.messages.map(sessionMessageToMessage)

        window.api.logger.info('[SessionStore] 从磁盘加载会话', {
          sessionId,
          title: session.title,
          messageCount: messages.value.length
        })

        return true
      } else {
        window.api.logger.warn('[SessionStore] 会话不存在', { sessionId })
        return false
      }
    } catch (error) {
      window.api.logger.error('[SessionStore] 加载会话失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 创建新会话
  async function createSession(
    title?: string,
    sessionType?: SessionType
  ): Promise<SessionData | null> {
    // 保存当前输入状态，用于新会话继承
    // 这确保了在没有当前会话时（如直接发送消息创建会话），输入状态不会丢失
    const currentInputStateSnapshot = inputState.getCurrentSelectionState()

    try {
      // 保存当前会话状态（如果有）
      if (currentChatId.value) {
        await saveCurrentStateBeforeLeave()
      }

      const session = await window.api.session.create(title || DEFAULT_NEW_CHAT_TITLE, sessionType)

      if (title) {
        session.title = title
      }

      currentSession.value = session
      currentChatId.value = session.sessionId
      messages.value = []

      // 将当前输入状态应用到新会话
      inputState.saveCurrentState(session.sessionId)
      // 使用保存的快照更新新会话的选择状态
      inputState.applySessionSelectionState(session.sessionId, currentInputStateSnapshot)
      // 切换到新会话的输入状态
      inputState.switchToSession(session.sessionId)

      await refreshSessionList()

      window.api.logger.info('[SessionStore] 创建新会话', {
        sessionId: session.sessionId,
        title: session.title,
        type: sessionType
      })

      return session
    } catch (error) {
      window.api.logger.error('[SessionStore] 创建会话失败', {
        error: error instanceof Error ? error.message : String(error)
      })

      // 降级处理：创建本地会话
      // 使用之前保存的快照，确保状态一致性
      const newSessionId = `chat-${Date.now()}`
      const fallbackSession: SessionData = {
        sessionId: newSessionId,
        title: title || DEFAULT_NEW_CHAT_TITLE,
        description: '',
        sessionType: (sessionType || 'chat') as SessionType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        selectionState: currentInputStateSnapshot
      }

      currentSession.value = fallbackSession
      currentChatId.value = newSessionId
      messages.value = []

      // 将快照状态应用到新会话并切换
      inputState.saveCurrentState(newSessionId)
      inputState.applySessionSelectionState(newSessionId, currentInputStateSnapshot)
      inputState.switchToSession(newSessionId)

      return fallbackSession
    }
  }

  // 保存当前会话
  async function saveCurrentSession(): Promise<boolean> {
    if (!currentSession.value) {
      window.api.logger.warn('[SessionStore] 没有当前会话可保存')
      return false
    }

    try {
      const sessionSnapshot = currentSession.value
      const sessionToSave: SessionData = {
        sessionId: sessionSnapshot.sessionId,
        title: sessionSnapshot.title,
        description: sessionSnapshot.description,
        sessionType: sessionSnapshot.sessionType,
        createdAt: sessionSnapshot.createdAt,
        updatedAt: new Date().toISOString(),
        messages: messages.value.map(messageToSessionMessage),
        selectionState: inputState.getCurrentSelectionState()
      }

      const result = await window.api.session.save(sessionToSave)

      if (!result.success) {
        window.api.logger.error('[SessionStore] 保存会话失败', { error: result.error })
        return false
      }

      if (currentSession.value?.sessionId === sessionToSave.sessionId) {
        currentSession.value.messages = sessionToSave.messages
        currentSession.value.updatedAt = sessionToSave.updatedAt
        currentSession.value.selectionState = sessionToSave.selectionState
      }

      await refreshSessionList()

      window.api.logger.debug('[SessionStore] 保存会话成功', {
        sessionId: sessionToSave.sessionId,
        messageCount: sessionToSave.messages.length
      })

      return true
    } catch (error) {
      window.api.logger.error('[SessionStore] 保存会话异常', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // 删除会话
  async function deleteSession(sessionId: string): Promise<boolean> {
    try {
      const result = await window.api.session.delete(sessionId)

      if (!result.success) {
        window.api.logger.error('[SessionStore] 删除会话失败', { error: result.error })
        return false
      }

      // 如果删除的是当前会话，清空当前状态
      if (currentSession.value?.sessionId === sessionId) {
        currentSession.value = null
        currentChatId.value = undefined
        messages.value = []
      }

      // 清理相关状态
      inputState.deleteSessionState(sessionId)
      messageCache.clearSessionCache(sessionId)
      chatStream.resetSessionState(sessionId)

      await refreshSessionList()

      window.api.logger.info('[SessionStore] 删除会话成功', { sessionId })
      return true
    } catch (error) {
      window.api.logger.error('[SessionStore] 删除会话异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return false
    }
  }

  // 更新会话标题
  function updateSessionTitle(title: string): void {
    if (!currentSession.value) return

    currentSession.value.title = title

    // 同时更新会话列表中的标题
    const listItem = sessionList.value.find(
      (item) => item.sessionId === currentSession.value?.sessionId
    )
    if (listItem) {
      listItem.title = title
    }

    // 更新标题缓存
    if (currentChatId.value) {
      messageCache.cacheSession(currentChatId.value, messages.value, title)
    }

    window.api.logger.debug('[SessionStore] 更新会话标题', {
      sessionId: currentSession.value.sessionId,
      title
    })
  }

  // 处理新建聊天
  async function handleNewChat(sessionType?: SessionType): Promise<void> {
    // 保存当前会话状态
    if (currentChatId.value) {
      await saveCurrentStateBeforeLeave()
    }

    // 创建新会话
    await createSession(DEFAULT_NEW_CHAT_TITLE, sessionType)

    // 重置新会话的发送状态
    if (currentChatId.value) {
      chatStream.setSessionSendingState(currentChatId.value, false)
    }
  }

  // 处理选择会话
  async function handleSelectChat(sessionId: string): Promise<boolean> {
    // 如果选择的是当前会话，直接返回
    if (currentSession.value?.sessionId === sessionId) {
      return chatStream.getSessionSendingState(sessionId)
    }

    // 保存当前会话状态
    if (currentChatId.value) {
      await saveCurrentStateBeforeLeave()
    }

    // 加载会话
    const success = await loadSession(sessionId, true)

    if (success) {
      // 返回该会话的发送状态
      return chatStream.getSessionSendingState(sessionId)
    }

    return false
  }

  // 处理删除会话
  async function handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSession(sessionId)
  }

  // 在离开页面前保存当前状态
  // 这是解决页面切换状态丢失的核心方法
  async function saveCurrentStateBeforeLeave(): Promise<void> {
    const sessionId = currentChatId.value
    if (!sessionId) return

    window.api.logger.info('[SessionStore] 保存当前状态（页面切换前）', {
      sessionId,
      messageCount: messages.value.length,
      hasStreaming: messages.value.some((m) => m.isStreaming),
      hasTools: inputState.selectedMCPTools.length > 0,
      hasKnowledgeBases: inputState.selectedKnowledgeBases.length > 0
    })

    // 保存输入状态
    inputState.saveCurrentState(sessionId)

    if (currentSession.value) {
      currentSession.value.selectionState = inputState.getCurrentSelectionState()
    }

    // 缓存消息（如果有）
    if (messages.value.length > 0) {
      messageCache.cacheSession(sessionId, messages.value, currentSession.value?.title)
    }

    // 持久化会话到文件（包括选择状态）
    await saveCurrentSession()
  }

  // 在返回页面时恢复状态
  async function restoreStateAfterReturn(sessionId: string): Promise<boolean> {
    window.api.logger.info('[SessionStore] 恢复状态（页面返回后）', { sessionId })

    // 恢复输入状态
    const inputRestored = inputState.restoreSessionState(sessionId)

    // 加载会话（会自动使用缓存）
    const sessionLoaded = await loadSession(sessionId, true)

    // 同步发送状态
    const cached = messageCache.getCachedSession(sessionId)
    if (cached && cached.messages.some((m) => m.isStreaming)) {
      chatStream.setSessionSendingState(sessionId, true, true)
    }

    return inputRestored || sessionLoaded
  }

  // 持久化当前会话的选择状态
  async function persistCurrentSelectionState(): Promise<boolean> {
    if (!currentChatId.value || !currentSession.value) {
      return false
    }

    inputState.saveCurrentState(currentChatId.value)
    currentSession.value.selectionState = inputState.getCurrentSelectionState()
    return await saveCurrentSession()
  }

  // 添加消息到当前会话
  function addMessage(message: Message): void {
    messages.value.push(message)
  }

  // 更新消息（用于流式更新）
  function updateMessage(messageId: string, updates: Partial<Message>): void {
    const message = messages.value.find((m) => m.id === messageId)
    if (message) {
      Object.assign(message, updates)
    }
  }

  // 获取正在流式传输的消息
  function getStreamingMessage(): Message | undefined {
    return messages.value.find((m) => m.isStreaming)
  }

  return {
    // State
    currentSession,
    currentChatId,
    messages,
    sessionList,
    sessionUpdateKey,
    isLoading,
    // Getters
    isCurrentSessionSending,
    hasStreamingMessage,
    sessionCount,
    currentInputState,
    // Actions
    loadSessionList,
    refreshSessionList,
    loadSession,
    createSession,
    saveCurrentSession,
    deleteSession,
    updateSessionTitle,
    handleNewChat,
    handleSelectChat,
    handleDeleteSession,
    saveCurrentStateBeforeLeave,
    restoreStateAfterReturn,
    persistCurrentSelectionState,
    addMessage,
    updateMessage,
    getStreamingMessage
  }
})
