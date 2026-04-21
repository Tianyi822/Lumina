// 论文对话消息缓存 Store
// 管理论文对话的后台流式消息缓存

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Message } from '@renderer/types'
import type { SessionData } from '@shared/types/session'
import { deepCopyMessages, messageToSessionMessage } from '@renderer/utils/messageHelpers'

export const usePaperChatMessageCacheStore = defineStore('paperChatMessageCache', () => {
  // ==================== State ====================

  // 会话消息状态缓存（用于处理多会话并发流式响应）
  // Key: sessionId, Value: 消息列表
  const sessionMessagesCache = ref<Map<string, Message[]>>(new Map())

  // 会话标题缓存（用于保存内存中更新但尚未持久化的标题）
  // Key: sessionId, Value: 标题
  const sessionTitleCache = ref<Map<string, string>>(new Map())

  // ==================== Getters ====================

  // 获取所有缓存的会话 ID 列表
  const cachedSessionIds = computed(() => Array.from(sessionMessagesCache.value.keys()))

  // 获取缓存数量
  const cacheSize = computed(() => sessionMessagesCache.value.size)

  // ==================== Actions ====================

  // 缓存会话消息和标题
  function cacheSession(sessionId: string, messages: Message[], title?: string): Message[] {
    // 深拷贝消息，避免引用问题
    const messagesToCache = deepCopyMessages(messages)
    sessionMessagesCache.value.set(sessionId, messagesToCache)

    // 保存标题（如果提供）
    if (title) {
      sessionTitleCache.value.set(sessionId, title)
    }

    window.api.logger.debug('[PaperChatMessageCacheStore] 缓存会话状态', {
      sessionId,
      title,
      messageCount: messagesToCache.length
    })

    return messagesToCache
  }

  function retainSessionMessages(
    sessionId: string,
    messages: Message[],
    title?: string
  ): Message[] {
    sessionMessagesCache.value.set(sessionId, messages)

    if (title) {
      sessionTitleCache.value.set(sessionId, title)
    }

    window.api.logger.debug('[PaperChatMessageCacheStore] 保留会话消息引用', {
      sessionId,
      title,
      messageCount: messages.length
    })

    return messages
  }

  // 更新缓存中的会话消息（用于流式更新）
  function updateCachedMessages(sessionId: string, messages: Message[]): void {
    if (!sessionMessagesCache.value.has(sessionId)) {
      return
    }
    sessionMessagesCache.value.set(sessionId, deepCopyMessages(messages))
  }

  // 从缓存中获取会话消息
  function getCachedSession(
    sessionId: string,
    returnRef: boolean = false
  ): { messages: Message[]; title?: string } | null {
    const messages = sessionMessagesCache.value.get(sessionId)
    const title = sessionTitleCache.value.get(sessionId)

    if (messages && messages.length > 0) {
      return {
        messages: returnRef ? messages : deepCopyMessages(messages),
        title
      }
    }

    return null
  }

  // 获取指定会话的缓存消息引用（用于流式更新）
  function getCachedMessagesRef(sessionId: string): Message[] | undefined {
    return sessionMessagesCache.value.get(sessionId)
  }

  // 检查会话是否有缓存
  function hasCachedSession(sessionId: string): boolean {
    const cached = sessionMessagesCache.value.get(sessionId)
    return cached !== undefined && cached.length > 0
  }

  // 检查会话是否有正在流式传输的消息
  function hasStreamingMessages(sessionId: string): boolean {
    const messages = sessionMessagesCache.value.get(sessionId)
    if (!messages) return false
    return messages.some((msg) => msg.isStreaming)
  }

  // 清除指定会话的缓存
  function clearSessionCache(sessionId: string): void {
    const hadCache = sessionMessagesCache.value.has(sessionId)
    sessionMessagesCache.value.delete(sessionId)
    sessionTitleCache.value.delete(sessionId)

    if (hadCache) {
      window.api.logger.debug('[PaperChatMessageCacheStore] 清除会话缓存', { sessionId })
    }
  }

  // 清除所有缓存
  function clearAllCache(): void {
    const previousSize = sessionMessagesCache.value.size
    sessionMessagesCache.value.clear()
    sessionTitleCache.value.clear()

    window.api.logger.debug('[PaperChatMessageCacheStore] 清除所有缓存', { previousSize })
  }

  // 保存缓存中的会话到持久化存储
  async function saveCachedSession(sessionId: string): Promise<boolean> {
    const cachedMessages = sessionMessagesCache.value.get(sessionId)
    if (!cachedMessages || cachedMessages.length === 0) {
      return false
    }

    try {
      // 加载会话数据
      const session = await window.api.session.load(sessionId)
      if (!session) {
        window.api.logger.warn('[PaperChatMessageCacheStore] 会话不存在，无法保存', { sessionId })
        return false
      }

      // 使用缓存的标题（如果有的话），否则使用文件中的标题
      const cachedTitle = sessionTitleCache.value.get(sessionId)
      const titleToUse = cachedTitle || session.title

      // 更新会话消息和标题
      const sessionToSave: SessionData = {
        sessionId: session.sessionId,
        title: titleToUse,
        description: session.description,
        sessionType: session.sessionType,
        createdAt: session.createdAt,
        updatedAt: new Date().toISOString(),
        messages: cachedMessages.map(messageToSessionMessage),
        selectionState: session.selectionState
      }

      const result = await window.api.session.save(sessionToSave)
      if (!result.success) {
        window.api.logger.error('[PaperChatMessageCacheStore] 保存后台会话失败', {
          error: result.error,
          sessionId
        })
        return false
      }

      // 保存成功后清理缓存
      clearSessionCache(sessionId)
      window.api.logger.debug('[PaperChatMessageCacheStore] 保存后台会话成功', { sessionId })
      return true
    } catch (error) {
      window.api.logger.error('[PaperChatMessageCacheStore] 保存后台会话异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return false
    }
  }

  // 获取所有有流式消息的会话 ID
  function getAllStreamingSessionIds(): string[] {
    const result: string[] = []
    for (const [sessionId, messages] of sessionMessagesCache.value.entries()) {
      if (messages.some((msg) => msg.isStreaming)) {
        result.push(sessionId)
      }
    }
    return result
  }

  return {
    // State
    sessionMessagesCache,
    sessionTitleCache,
    // Getters
    cachedSessionIds,
    cacheSize,
    // Actions
    cacheSession,
    retainSessionMessages,
    updateCachedMessages,
    getCachedSession,
    getCachedMessagesRef,
    hasCachedSession,
    hasStreamingMessages,
    clearSessionCache,
    clearAllCache,
    saveCachedSession,
    getAllStreamingSessionIds
  }
})
