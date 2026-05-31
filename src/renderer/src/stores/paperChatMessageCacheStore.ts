import { create } from 'zustand'
import { deepCopyMessages, messageToSessionMessage } from '@renderer/utils/messageHelpers'

interface PaperChatMessageCacheState {
  sessionMessagesCache: Map<string, Message[]>
  sessionTitleCache: Map<string, string>

  cachedSessionIds: () => string[]
  cacheSize: () => number

  cacheSession: (sessionId: string, messages: Message[], title?: string) => Message[]
  retainSessionMessages: (sessionId: string, messages: Message[], title?: string) => Message[]
  updateCachedMessages: (sessionId: string, messages: Message[]) => void
  getCachedSession: (
    sessionId: string,
    returnRef?: boolean
  ) => { messages: Message[]; title?: string } | null
  getCachedMessagesRef: (sessionId: string) => Message[] | undefined
  hasCachedSession: (sessionId: string) => boolean
  hasStreamingMessages: (sessionId: string) => boolean
  clearSessionCache: (sessionId: string) => void
  clearAllCache: () => void
  saveCachedSession: (sessionId: string) => Promise<boolean>
  getAllStreamingSessionIds: () => string[]
}

import type { Message } from '@renderer/types'
import type { SessionData } from '@shared/types/session'

export const usePaperChatMessageCacheStore = create<PaperChatMessageCacheState>()((set, get) => ({
  sessionMessagesCache: new Map(),
  sessionTitleCache: new Map(),

  cachedSessionIds: () => Array.from(get().sessionMessagesCache.keys()),
  cacheSize: () => get().sessionMessagesCache.size,

  cacheSession: (sessionId, messages, title) => {
    const messagesToCache = deepCopyMessages(messages)

    set((state) => {
      const nextMessages = new Map(state.sessionMessagesCache)
      const nextTitles = new Map(state.sessionTitleCache)
      nextMessages.set(sessionId, messagesToCache)
      if (title) nextTitles.set(sessionId, title)
      return { sessionMessagesCache: nextMessages, sessionTitleCache: nextTitles }
    })

    return messagesToCache
  },

  retainSessionMessages: (sessionId, messages, title) => {
    set((state) => {
      const nextMessages = new Map(state.sessionMessagesCache)
      const nextTitles = new Map(state.sessionTitleCache)
      nextMessages.set(sessionId, messages)
      if (title) nextTitles.set(sessionId, title)
      return { sessionMessagesCache: nextMessages, sessionTitleCache: nextTitles }
    })
    return messages
  },

  updateCachedMessages: (sessionId, messages) =>
    set((state) => {
      if (!state.sessionMessagesCache.has(sessionId)) return {}
      const next = new Map(state.sessionMessagesCache)
      next.set(sessionId, deepCopyMessages(messages))
      return { sessionMessagesCache: next }
    }),

  getCachedSession: (sessionId, returnRef) => {
    const state = get()
    const messages = state.sessionMessagesCache.get(sessionId)
    const title = state.sessionTitleCache.get(sessionId)

    if (messages && messages.length > 0) {
      return { messages: returnRef ? messages : deepCopyMessages(messages), title }
    }

    return null
  },

  getCachedMessagesRef: (sessionId) => get().sessionMessagesCache.get(sessionId),

  hasCachedSession: (sessionId) => {
    const cached = get().sessionMessagesCache.get(sessionId)
    return cached !== undefined && cached.length > 0
  },

  hasStreamingMessages: (sessionId) => {
    const messages = get().sessionMessagesCache.get(sessionId)
    if (!messages) return false
    return messages.some((msg) => msg.isStreaming)
  },

  clearSessionCache: (sessionId) =>
    set((state) => {
      const nextMessages = new Map(state.sessionMessagesCache)
      const nextTitles = new Map(state.sessionTitleCache)
      nextMessages.delete(sessionId)
      nextTitles.delete(sessionId)
      return { sessionMessagesCache: nextMessages, sessionTitleCache: nextTitles }
    }),

  clearAllCache: () => set({ sessionMessagesCache: new Map(), sessionTitleCache: new Map() }),

  saveCachedSession: async (sessionId) => {
    const state = get()
    const cachedMessages = state.sessionMessagesCache.get(sessionId)
    if (!cachedMessages || cachedMessages.length === 0) return false

    try {
      const sessionResult = await window.api.session.load(sessionId)
      if (!sessionResult.success || !sessionResult.data) return false

      const session = sessionResult.data
      const cachedTitle = state.sessionTitleCache.get(sessionId)
      const titleToUse = cachedTitle || session.title

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
      if (!result.success) return false

      get().clearSessionCache(sessionId)
      return true
    } catch {
      return false
    }
  },

  getAllStreamingSessionIds: () => {
    const result: string[] = []
    for (const [sessionId, messages] of get().sessionMessagesCache.entries()) {
      if (messages.some((msg) => msg.isStreaming)) result.push(sessionId)
    }
    return result
  }
}))
