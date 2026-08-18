import { create } from 'zustand'
import type { AppLanguage } from '@shared/types/config'
import type {
  PaperTranslationCache,
  PaperTranslationProgressBatch,
  PaperTranslationSummary
} from '@shared/types/paper'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'
import { buildFigureCaptionTranslationMap } from '@shared/utils/paperTranslation'
import { upsertTranslationEntry, mergeTranslationEntries } from './composables/paperTranslationCore'
import { createIdleTranslationTaskState, type PaperTranslationTaskState } from './shared'
import { usePaperListStore } from './usePaperListStore'

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

interface PaperTranslationState {
  translationVisible: boolean
  translationByPaperId: Record<string, PaperTranslationCache>
  translationTaskByPaperId: Record<string, PaperTranslationTaskState>
  hasTranslationByPaperId: Record<string, boolean>
  translationSummaryByPaperId: Record<string, PaperTranslationSummary>

  // Getters
  currentTranslationCache: () => PaperTranslationCache | null
  figureCaptionTranslationMap: () => Record<string, string>
  currentTranslationTask: () => PaperTranslationTaskState
  isCurrentPaperTranslating: () => boolean

  // Actions
  loadTranslationState: (paperId: string) => Promise<void>
  ensureTranslation: (
    paperId: string,
    targetLanguage?: AppLanguage
  ) => Promise<{ success: boolean; skippedReason?: 'sameLanguage'; error?: string }>
  loadTranslationStatus: (paperIds: string[]) => Promise<void>
  deleteTranslation: (paperId: string) => Promise<{ success: boolean; error?: string }>
  retranslateSegment: (
    paperId: string,
    segmentId: string
  ) => Promise<{ success: boolean; error?: string }>
  hideTranslation: () => void
  ensureTranslationProgressListener: () => void
  clearTranslationState: (paperId: string) => void

  // 公开内部方法（供协调函数使用）
  setTranslationCache: (paperId: string, cache: PaperTranslationCache | null) => void
  setTranslationTaskState: (paperId: string, taskState: PaperTranslationTaskState | null) => void
  setHasTranslationState: (paperId: string, hasTranslation: boolean) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaperTranslationStore = create<PaperTranslationState>()((set, get) => {
  // Translation 进度监听
  let translationProgressCleanup: (() => void) | null = null

  // -----------------------------------------------------------------------
  // 内部辅助
  // -----------------------------------------------------------------------

  function applyTranslationProgressBatch(batch: PaperTranslationProgressBatch): void {
    const now = new Date().toISOString()
    const s = get()
    const existingCache = s.translationByPaperId[batch.paperId]
    let nextCache: PaperTranslationCache =
      existingCache && existingCache.sourceHash === batch.sourceHash
        ? existingCache
        : {
            paperId: batch.paperId,
            sourceHash: batch.sourceHash,
            totalSegments: batch.totalSegments,
            completedSegments: batch.completedSegments,
            entries: [],
            updatedAt: now
          }

    for (const progress of batch.entries) {
      nextCache = upsertTranslationEntry(
        {
          ...nextCache,
          sourceHash: batch.sourceHash,
          totalSegments: batch.totalSegments,
          completedSegments: batch.completedSegments,
          updatedAt: now
        },
        { ...progress.entry }
      )
    }

    nextCache = {
      ...nextCache,
      completedSegments: batch.completedSegments,
      totalSegments: batch.totalSegments,
      translationRevisionId: batch.translationRevisionId || nextCache.translationRevisionId,
      updatedAt: now
    }

    const hasTranslation = hasPaperTranslationResult(nextCache)
    const failedProgress = [...batch.entries]
      .reverse()
      .find((progress) => progress.status === 'failed')

    set({
      translationByPaperId: {
        ...s.translationByPaperId,
        [batch.paperId]: nextCache
      },
      hasTranslationByPaperId: {
        ...s.hasTranslationByPaperId,
        [batch.paperId]: hasTranslation
      },
      translationSummaryByPaperId: {
        ...s.translationSummaryByPaperId,
        [batch.paperId]: {
          paperId: batch.paperId,
          hasTranslation
        }
      },
      translationTaskByPaperId: {
        ...s.translationTaskByPaperId,
        [batch.paperId]: {
          isRunning: batch.isRunning,
          completedSegments: batch.completedSegments,
          totalSegments: batch.totalSegments,
          lastError: failedProgress?.errorMessage
        }
      }
    })
  }

  return {
    translationVisible: false,
    translationByPaperId: {} as Record<string, PaperTranslationCache>,
    translationTaskByPaperId: {} as Record<string, PaperTranslationTaskState>,
    hasTranslationByPaperId: {} as Record<string, boolean>,
    translationSummaryByPaperId: {} as Record<string, PaperTranslationSummary>,

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    currentTranslationCache: () => {
      const currentPaperId = usePaperListStore.getState().currentPaperId
      if (!currentPaperId) return null
      return get().translationByPaperId[currentPaperId] || null
    },

    figureCaptionTranslationMap: () => {
      const currentPaperId = usePaperListStore.getState().currentPaperId
      const cache = currentPaperId ? get().translationByPaperId[currentPaperId] || null : null
      return buildFigureCaptionTranslationMap(cache)
    },

    currentTranslationTask: () => {
      const currentPaperId = usePaperListStore.getState().currentPaperId
      if (!currentPaperId) return createIdleTranslationTaskState()
      return get().translationTaskByPaperId[currentPaperId] || createIdleTranslationTaskState()
    },

    isCurrentPaperTranslating: () => {
      const currentPaperId = usePaperListStore.getState().currentPaperId
      if (!currentPaperId) return false
      const task = get().translationTaskByPaperId[currentPaperId]
      return task?.isRunning ?? false
    },

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    loadTranslationState: async (paperId: string) => {
      get().ensureTranslationProgressListener()

      const result = await window.api.paper.getTranslationState(paperId)
      if (!result.success || !result.data) {
        get().setTranslationCache(paperId, null)
        get().setTranslationTaskState(paperId, createIdleTranslationTaskState())
        return
      }

      const snapshot = result.data.cache
      const existingCache = get().translationByPaperId[paperId]

      if (
        existingCache &&
        snapshot &&
        existingCache.sourceHash === snapshot.sourceHash &&
        existingCache.entries.length > 0
      ) {
        const merged = mergeTranslationEntries(snapshot, existingCache)
        get().setTranslationCache(paperId, merged)
        get().setHasTranslationState(paperId, hasPaperTranslationResult(merged))
      } else {
        get().setTranslationCache(paperId, snapshot)
        get().setHasTranslationState(paperId, hasPaperTranslationResult(snapshot))
      }

      get().setTranslationTaskState(paperId, {
        isRunning: result.data.isRunning,
        completedSegments: (snapshot ?? existingCache)?.completedSegments ?? 0,
        totalSegments: (snapshot ?? existingCache)?.totalSegments ?? 0
      })

      if (result.data.isRunning) {
        await window.api.paper.startTranslation(paperId)
      }
    },

    ensureTranslation: async (
      paperId: string,
      targetLanguage?: AppLanguage
    ): Promise<{ success: boolean; skippedReason?: 'sameLanguage'; error?: string }> => {
      get().ensureTranslationProgressListener()

      const taskState = get().translationTaskByPaperId[paperId] || createIdleTranslationTaskState()

      const result = await window.api.paper.startTranslation(paperId, targetLanguage)
      // 原文语言与目标语言一致时短路：无进度事件，由调用方按返回值提示并保持译文隐藏
      if (result.skippedReason === 'sameLanguage') {
        return { success: true, skippedReason: 'sameLanguage' }
      }

      if (!result.success) {
        get().setTranslationTaskState(paperId, {
          ...taskState,
          lastError: result.error
        })
        return { success: false, error: result.error }
      }

      await get().loadTranslationState(paperId)
      return { success: true }
    },

    loadTranslationStatus: async (paperIds: string[]) => {
      if (paperIds.length === 0) {
        set({ hasTranslationByPaperId: {}, translationSummaryByPaperId: {} })
        return
      }

      const result = await window.api.paper.listTranslationSummaries(paperIds)
      if (!result.success || !result.data) return

      set({
        hasTranslationByPaperId: Object.fromEntries(
          Object.entries(result.data).map(([paperId, summary]) => [paperId, summary.hasTranslation])
        ),
        translationSummaryByPaperId: result.data
      })
    },

    deleteTranslation: async (paperId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await window.api.paper.deleteTranslation(paperId)
      if (!result.success) {
        return { success: false, error: result.error }
      }

      get().setTranslationCache(paperId, null)
      get().setTranslationTaskState(paperId, createIdleTranslationTaskState())
      get().setHasTranslationState(paperId, false)

      const currentPaperId = usePaperListStore.getState().currentPaperId
      if (currentPaperId === paperId) {
        set({ translationVisible: false })
      }

      return { success: true }
    },

    /** @internal 使用 actions.ts 中的 retranslateSegment 协调函数以同时清理关联批注 */
    retranslateSegment: async (
      paperId: string,
      segmentId: string
    ): Promise<{ success: boolean; error?: string }> => {
      get().ensureTranslationProgressListener()

      const result = await window.api.paper.retranslateSegment({ paperId, segmentId })
      if (!result.success) {
        return { success: false, error: result.error }
      }

      return { success: true }
    },

    hideTranslation: () => set({ translationVisible: false }),

    ensureTranslationProgressListener: () => {
      if (translationProgressCleanup) return

      translationProgressCleanup = window.api.paper.onTranslationProgressBatch(
        applyTranslationProgressBatch
      )
    },

    clearTranslationState: (paperId: string) => {
      get().setTranslationCache(paperId, null)
      get().setTranslationTaskState(paperId, null)

      const s = get()
      const nextTranslationState = { ...s.hasTranslationByPaperId }
      delete nextTranslationState[paperId]
      const nextTranslationSummary = { ...s.translationSummaryByPaperId }
      delete nextTranslationSummary[paperId]
      set({
        hasTranslationByPaperId: nextTranslationState,
        translationSummaryByPaperId: nextTranslationSummary
      })
    },

    // -----------------------------------------------------------------------
    // 公开内部方法
    // -----------------------------------------------------------------------

    setTranslationCache: (paperId: string, cache: PaperTranslationCache | null) => {
      const s = get()
      const nextCacheMap = { ...s.translationByPaperId }
      if (cache) {
        nextCacheMap[paperId] = cache
      } else {
        delete nextCacheMap[paperId]
      }
      set({ translationByPaperId: nextCacheMap })
    },

    setTranslationTaskState: (paperId: string, taskState: PaperTranslationTaskState | null) => {
      const s = get()
      const nextTaskMap = { ...s.translationTaskByPaperId }
      if (taskState) {
        nextTaskMap[paperId] = taskState
      } else {
        delete nextTaskMap[paperId]
      }
      set({ translationTaskByPaperId: nextTaskMap })
    },

    setHasTranslationState: (paperId: string, hasTranslation: boolean) => {
      const s = get()
      set({
        hasTranslationByPaperId: {
          ...s.hasTranslationByPaperId,
          [paperId]: hasTranslation
        },
        translationSummaryByPaperId: {
          ...s.translationSummaryByPaperId,
          [paperId]: {
            paperId,
            hasTranslation
          }
        }
      })
    }
  }
})
