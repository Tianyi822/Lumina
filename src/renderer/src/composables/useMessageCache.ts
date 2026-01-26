import { ref, type Ref } from 'vue'
import type { Message, SessionData } from '../types'
import { deepCopyMessages } from '../utils/messageHelpers'

/**
 * 消息缓存管理 Composable
 * 用于处理多会话并发时的消息缓存和恢复
 */
export function useMessageCache(): {
  sessionMessagesCache: Ref<Map<string, Message[]>>
  sessionTitleCache: Ref<Map<string, string>>
  cacheSession: (sessionId: string, messages: Message[], title?: string) => void
  getCachedSession: (sessionId: string) => { messages: Message[]; title?: string } | null
  hasCachedSession: (sessionId: string) => boolean
  clearSessionCache: (sessionId: string) => void
  clearAllCache: () => void
  saveCachedSession: (sessionId: string) => Promise<void>
} {
  // 会话消息状态缓存（用于处理多会话并发流式响应）
  const sessionMessagesCache = ref<Map<string, Message[]>>(new Map())

  // 会话标题缓存（用于保存内存中更新但尚未持久化的标题）
  const sessionTitleCache = ref<Map<string, string>>(new Map())

  /**
   * 缓存会话消息和标题
   */
  function cacheSession(sessionId: string, messages: Message[], title?: string): void {
    // 深拷贝消息，避免引用问题
    const messagesToCache = deepCopyMessages(messages)
    sessionMessagesCache.value.set(sessionId, messagesToCache)

    // 保存标题（如果提供）
    if (title) {
      sessionTitleCache.value.set(sessionId, title)
    }

    window.api.logger.debug('缓存会话状态', {
      sessionId,
      title,
      messageCount: messagesToCache.length
    })
  }

  /**
   * 从缓存中获取会话消息
   */
  function getCachedSession(sessionId: string): { messages: Message[]; title?: string } | null {
    const messages = sessionMessagesCache.value.get(sessionId)
    const title = sessionTitleCache.value.get(sessionId)

    if (messages && messages.length > 0) {
      return {
        messages: deepCopyMessages(messages),
        title
      }
    }

    return null
  }

  /**
   * 检查会话是否有缓存
   */
  function hasCachedSession(sessionId: string): boolean {
    return sessionMessagesCache.value.has(sessionId)
  }

  /**
   * 清除指定会话的缓存
   */
  function clearSessionCache(sessionId: string): void {
    sessionMessagesCache.value.delete(sessionId)
    sessionTitleCache.value.delete(sessionId)

    window.api.logger.debug('清除会话缓存', { sessionId })
  }

  /**
   * 清除所有缓存
   */
  function clearAllCache(): void {
    const cacheSize = sessionMessagesCache.value.size
    sessionMessagesCache.value.clear()
    sessionTitleCache.value.clear()

    window.api.logger.debug('清除所有缓存', { previousSize: cacheSize })
  }

  /**
   * 保存缓存中的会话到持久化存储
   */
  async function saveCachedSession(sessionId: string): Promise<void> {
    const cachedMessages = sessionMessagesCache.value.get(sessionId)
    if (!cachedMessages || cachedMessages.length === 0) {
      return
    }

    try {
      // 加载会话数据
      const session = await window.api.session.load(sessionId)
      if (session) {
        // 使用缓存的标题（如果有的话），否则使用文件中的标题
        const cachedTitle = sessionTitleCache.value.get(sessionId)
        const titleToUse = cachedTitle || session.title

        // 更新会话消息和标题
        const sessionToSave: SessionData = {
          sessionId: session.sessionId,
          title: titleToUse,
          createdAt: session.createdAt,
          updatedAt: new Date().toISOString(),
          messages: cachedMessages.map((msg) => ({
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
          window.api.logger.error('保存后台会话失败', { error: result.error, sessionId })
        }
      }
    } catch (error) {
      window.api.logger.error('保存后台会话异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
    } finally {
      // 清理缓存
      clearSessionCache(sessionId)
    }
  }

  return {
    sessionMessagesCache,
    sessionTitleCache,
    cacheSession,
    getCachedSession,
    hasCachedSession,
    clearSessionCache,
    clearAllCache,
    saveCachedSession
  }
}
