import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PaperQuote } from '@shared/types/chat'

export type PendingQuote = PaperQuote

/**
 * 论文引用 Store
 * 管理每个 Session 的论文引用附加状态
 */
export const usePaperChatQuoteStore = defineStore('paperChatQuote', () => {
  // ==================== State ====================

  // 每个 session 的待发送引用列表
  const pendingQuotes = ref<Map<string, PendingQuote[]>>(new Map())

  // ==================== Getters ====================

  /**
   * 获取指定 session 的待发送引用列表
   */
  const getSessionQuotes = computed(() => {
    return (sessionId: string): PendingQuote[] => {
      return pendingQuotes.value.get(sessionId) || []
    }
  })

  /**
   * 检查指定 session 是否有待发送的引用
   */
  const hasPendingQuotes = computed(() => {
    return (sessionId: string): boolean => {
      const quotes = pendingQuotes.value.get(sessionId)
      return quotes !== undefined && quotes.length > 0
    }
  })

  // ==================== Actions ====================

  /**
   * 初始化 session 的引用状态
   */
  function initSession(sessionId: string): void {
    if (!pendingQuotes.value.has(sessionId)) {
      pendingQuotes.value.set(sessionId, [])
    }
  }

  /**
   * 添加论文引用到指定 session
   * @param sessionId 会话 ID
   * @param quote 论文引用
   */
  function addQuote(sessionId: string, quote: PaperQuote): void {
    initSession(sessionId)

    const pendingList = pendingQuotes.value.get(sessionId)!
    pendingList.push(quote)
  }

  /**
   * 移除指定 session 的某个待发送引用
   * @param sessionId 会话 ID
   * @param quoteId 引用 ID
   */
  function removeQuote(sessionId: string, quoteId: string): void {
    const pendingList = pendingQuotes.value.get(sessionId)
    if (!pendingList) {
      return
    }

    const index = pendingList.findIndex((q) => q.id === quoteId)
    if (index >= 0 && index < pendingList.length) {
      pendingList.splice(index, 1)
    }
  }

  /**
   * 清空指定 session 的所有待发送引用
   * @param sessionId 会话 ID
   */
  function clearQuotes(sessionId: string): void {
    pendingQuotes.value.set(sessionId, [])
  }

  /**
   * 获取指定 session 的所有待发送引用（用于发送消息）
   * @param sessionId 会话 ID
   * @returns 引用列表
   */
  function getPendingQuotesForSending(sessionId: string): PaperQuote[] {
    return (pendingQuotes.value.get(sessionId) || []).map((q) => ({
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
  }

  return {
    // State
    pendingQuotes,

    // Getters
    getSessionQuotes,
    hasPendingQuotes,

    // Actions
    initSession,
    addQuote,
    removeQuote,
    clearQuotes,
    getPendingQuotesForSending
  }
})
