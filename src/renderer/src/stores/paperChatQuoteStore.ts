import { create } from 'zustand'
import type { PaperQuote } from '@shared/types/chat'

export type PendingQuote = PaperQuote

interface PaperChatQuoteState {
  pendingQuotes: Map<string, PendingQuote[]>

  getSessionQuotes: (sessionId: string) => PendingQuote[]
  hasPendingQuotes: (sessionId: string) => boolean

  initSession: (sessionId: string) => void
  addQuote: (sessionId: string, quote: PaperQuote) => void
  removeQuote: (sessionId: string, quoteId: string) => void
  clearQuotes: (sessionId: string) => void
  getPendingQuotesForSending: (sessionId: string) => PaperQuote[]
}

export const usePaperChatQuoteStore = create<PaperChatQuoteState>()((set, get) => ({
  pendingQuotes: new Map(),

  getSessionQuotes: (sessionId) => get().pendingQuotes.get(sessionId) || [],

  hasPendingQuotes: (sessionId) => {
    const quotes = get().pendingQuotes.get(sessionId)
    return quotes !== undefined && quotes.length > 0
  },

  initSession: (sessionId) =>
    set((state) => {
      const next = new Map(state.pendingQuotes)
      if (!next.has(sessionId)) next.set(sessionId, [])
      return { pendingQuotes: next }
    }),

  addQuote: (sessionId, quote) => {
    get().initSession(sessionId)
    set((state) => {
      const next = new Map(state.pendingQuotes)
      const list = [...(next.get(sessionId) || [])]
      list.push(quote)
      next.set(sessionId, list)
      return { pendingQuotes: next }
    })
  },

  removeQuote: (sessionId, quoteId) =>
    set((state) => {
      const list = state.pendingQuotes.get(sessionId)
      if (!list) return {}
      const next = new Map(state.pendingQuotes)
      next.set(
        sessionId,
        list.filter((q) => q.id !== quoteId)
      )
      return { pendingQuotes: next }
    }),

  clearQuotes: (sessionId) =>
    set((state) => {
      const next = new Map(state.pendingQuotes)
      next.set(sessionId, [])
      return { pendingQuotes: next }
    }),

  getPendingQuotesForSending: (sessionId) =>
    (get().pendingQuotes.get(sessionId) || []).map((q) => ({
      id: q.id,
      paperId: q.paperId,
      segmentStableId: q.segmentStableId,
      segmentIndex: q.segmentIndex,
      viewKind: q.viewKind,
      sourceType: q.sourceType,
      selectedText: q.selectedText,
      surroundingContext: q.surroundingContext ? { ...q.surroundingContext } : undefined,
      sourceLocation: q.sourceLocation
        ? {
            ...q.sourceLocation,
            pageIndexes: q.sourceLocation.pageIndexes
              ? [...q.sourceLocation.pageIndexes]
              : undefined,
            blockIndexes: q.sourceLocation.blockIndexes
              ? [...q.sourceLocation.blockIndexes]
              : undefined
          }
        : undefined,
      textAnchor: { ...q.textAnchor },
      sourceRevisionId: q.sourceRevisionId,
      segmentTextHash: q.segmentTextHash,
      translationRevisionId: q.translationRevisionId,
      translationModelName: q.translationModelName
    }))
}))
