import { create } from 'zustand'

/** 单篇写作文档对应的聊天会话运行时状态 */
export interface WriterChatSessionState {
  sessionId: string
  documentId: string
  streamingContent: string
  selectedPaperId?: string
  isSending: boolean
}

export interface WriterChatStore {
  sessions: Record<string, WriterChatSessionState>
  initializeSession: (sessionId: string, documentId: string) => void
  getSession: (sessionId: string) => WriterChatSessionState | undefined
  appendContent: (sessionId: string, content: string) => void
  setStreamingContent: (sessionId: string, content: string) => void
  setSelectedPaperId: (sessionId: string, selectedPaperId: string | undefined) => void
  setSending: (sessionId: string, isSending: boolean) => void
  clearSession: (sessionId: string) => void
  resetAll: () => void
}

/**
 * 写作聊天 Store：按 sessionId 隔离流式内容与论文选择，互不共享。
 */
export const useWriterChatStore = create<WriterChatStore>((set, get) => ({
  sessions: {},

  initializeSession: (sessionId, documentId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          sessionId,
          documentId,
          streamingContent: '',
          selectedPaperId: undefined,
          isSending: false
        }
      }
    })),

  getSession: (sessionId) => get().sessions[sessionId],

  appendContent: (sessionId, content) =>
    set((state) => {
      const current = state.sessions[sessionId]
      if (!current) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            streamingContent: `${current.streamingContent}${content}`
          }
        }
      }
    }),

  setStreamingContent: (sessionId, content) =>
    set((state) => {
      const current = state.sessions[sessionId]
      if (!current) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            streamingContent: content
          }
        }
      }
    }),

  setSelectedPaperId: (sessionId, selectedPaperId) =>
    set((state) => {
      const current = state.sessions[sessionId]
      if (!current) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            selectedPaperId
          }
        }
      }
    }),

  setSending: (sessionId, isSending) =>
    set((state) => {
      const current = state.sessions[sessionId]
      if (!current) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            isSending
          }
        }
      }
    }),

  clearSession: (sessionId) =>
    set((state) => {
      if (!state.sessions[sessionId]) return state
      const next = { ...state.sessions }
      delete next[sessionId]
      return { sessions: next }
    }),

  resetAll: () => set({ sessions: {} })
}))
