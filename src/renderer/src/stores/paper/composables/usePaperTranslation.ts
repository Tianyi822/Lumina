import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationProgress,
  PaperTranslationStatus
} from '@shared/types/paper'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'
import { createIdleTranslationTaskState, type PaperTranslationTaskState } from '../shared'

const STATUS_PRIORITY: Record<PaperTranslationStatus, number> = {
  queued: 0,
  translating: 1,
  failed: 2,
  completed: 3,
  skipped: 4
}

export interface PaperTranslationComposable {
  translationVisible: Ref<boolean>
  translationByPaperId: Ref<Record<string, PaperTranslationCache>>
  translationTaskByPaperId: Ref<Record<string, PaperTranslationTaskState>>
  hasTranslationByPaperId: Ref<Record<string, boolean>>
  currentTranslationCache: ComputedRef<PaperTranslationCache | null>
  figureCaptionTranslationMap: ComputedRef<Record<string, string>>
  currentTranslationTask: ComputedRef<PaperTranslationTaskState>
  isCurrentPaperTranslating: ComputedRef<boolean>
  hideTranslation: () => void
  ensureTranslationProgressListener: () => void
  loadTranslationState: (paperId: string) => Promise<void>
  ensureTranslation: (paperId: string) => Promise<{ success: boolean; error?: string }>
  toggleTranslationVisible: () => Promise<{ success: boolean; error?: string }>
  loadTranslationStatus: (paperIds: string[]) => Promise<void>
  deleteTranslation: (paperId: string) => Promise<{ success: boolean; error?: string }>
  setTranslationCache: (paperId: string, cache: PaperTranslationCache | null) => void
  setTranslationTaskState: (paperId: string, taskState: PaperTranslationTaskState | null) => void
  setHasTranslationState: (paperId: string, hasTranslation: boolean) => void
  clearTranslationState: (paperId: string) => void
}

export function usePaperTranslation(
  currentPaperId: Ref<string | null>
): PaperTranslationComposable {
  const translationVisible = ref(false)
  const translationByPaperId = ref<Record<string, PaperTranslationCache>>({})
  const translationTaskByPaperId = ref<Record<string, PaperTranslationTaskState>>({})
  const hasTranslationByPaperId = ref<Record<string, boolean>>({})

  let translationProgressCleanup: (() => void) | null = null

  const currentTranslationCache = computed<PaperTranslationCache | null>(() => {
    if (!currentPaperId.value) {
      return null
    }

    return translationByPaperId.value[currentPaperId.value] || null
  })

  const figureCaptionTranslationMap = computed<Record<string, string>>(() => {
    const cache = currentTranslationCache.value
    if (!cache) {
      return {}
    }

    const map: Record<string, string> = {}
    for (const entry of cache.entries) {
      if (
        entry.id.startsWith('fig-caption-') &&
        entry.status === 'completed' &&
        entry.translatedText
      ) {
        const figureId = entry.id.replace('fig-caption-', '')
        map[figureId] = entry.translatedText
      }
    }
    return map
  })

  const currentTranslationTask = computed<PaperTranslationTaskState>(() => {
    if (!currentPaperId.value) {
      return createIdleTranslationTaskState()
    }

    return translationTaskByPaperId.value[currentPaperId.value] || createIdleTranslationTaskState()
  })

  const isCurrentPaperTranslating = computed(() => currentTranslationTask.value.isRunning)

  function hideTranslation(): void {
    translationVisible.value = false
  }

  function setTranslationCache(paperId: string, cache: PaperTranslationCache | null): void {
    const nextCacheMap = { ...translationByPaperId.value }
    if (cache) {
      nextCacheMap[paperId] = cache
    } else {
      delete nextCacheMap[paperId]
    }
    translationByPaperId.value = nextCacheMap
  }

  function setTranslationTaskState(
    paperId: string,
    taskState: PaperTranslationTaskState | null
  ): void {
    const nextTaskMap = { ...translationTaskByPaperId.value }
    if (taskState) {
      nextTaskMap[paperId] = taskState
    } else {
      delete nextTaskMap[paperId]
    }
    translationTaskByPaperId.value = nextTaskMap
  }

  function setHasTranslationState(paperId: string, hasTranslation: boolean): void {
    hasTranslationByPaperId.value = {
      ...hasTranslationByPaperId.value,
      [paperId]: hasTranslation
    }
  }

  function clearTranslationState(paperId: string): void {
    setTranslationCache(paperId, null)
    setTranslationTaskState(paperId, null)

    const nextTranslationState = { ...hasTranslationByPaperId.value }
    delete nextTranslationState[paperId]
    hasTranslationByPaperId.value = nextTranslationState
  }

  function upsertTranslationEntry(
    cache: PaperTranslationCache,
    nextEntry: PaperTranslationEntry
  ): PaperTranslationCache {
    const entries = [...cache.entries]
    const existingIndex = entries.findIndex((entry) => entry.id === nextEntry.id)
    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry
    } else {
      entries.push(nextEntry)
    }

    entries.sort((left, right) => left.index - right.index)

    return {
      ...cache,
      completedSegments: cache.completedSegments,
      totalSegments: Math.max(cache.totalSegments, entries.length),
      entries
    }
  }

  function mergeTranslationEntries(
    snapshot: PaperTranslationCache,
    live: PaperTranslationCache
  ): PaperTranslationCache {
    const liveEntryMap = new Map(live.entries.map((entry) => [entry.id, entry]))
    const mergedEntries = snapshot.entries.map((snapshotEntry) => {
      const liveEntry = liveEntryMap.get(snapshotEntry.id)
      if (!liveEntry) {
        return snapshotEntry
      }

      const livePriority = STATUS_PRIORITY[liveEntry.status] ?? 0
      const snapshotPriority = STATUS_PRIORITY[snapshotEntry.status] ?? 0

      if (liveEntry.updatedAt && snapshotEntry.updatedAt) {
        const liveTime = Date.parse(liveEntry.updatedAt)
        const snapshotTime = Date.parse(snapshotEntry.updatedAt)
        if (liveTime > snapshotTime) {
          return liveEntry
        }
        if (liveTime < snapshotTime) {
          return snapshotEntry
        }
      }

      return livePriority >= snapshotPriority ? liveEntry : snapshotEntry
    })

    for (const [id, liveEntry] of liveEntryMap) {
      if (!mergedEntries.find((entry) => entry.id === id)) {
        mergedEntries.push(liveEntry)
      }
    }

    mergedEntries.sort((left, right) => left.index - right.index)

    return {
      ...snapshot,
      entries: mergedEntries,
      completedSegments: mergedEntries.filter(
        (entry) => entry.status === 'completed' || entry.status === 'skipped'
      ).length,
      totalSegments: Math.max(snapshot.totalSegments, mergedEntries.length),
      updatedAt: live.updatedAt > snapshot.updatedAt ? live.updatedAt : snapshot.updatedAt
    }
  }

  function ensureTranslationProgressListener(): void {
    if (translationProgressCleanup) {
      return
    }

    translationProgressCleanup = window.api.paper.onTranslationProgress(
      (progress: PaperTranslationProgress) => {
        const now = new Date().toISOString()
        const existingCache = translationByPaperId.value[progress.paperId]
        const baseCache: PaperTranslationCache =
          existingCache && existingCache.sourceHash === progress.sourceHash
            ? existingCache
            : {
                paperId: progress.paperId,
                sourceHash: progress.sourceHash,
                totalSegments: progress.totalSegments,
                completedSegments: progress.completedSegments,
                entries: [],
                updatedAt: now
              }

        const nextCache = upsertTranslationEntry(
          {
            ...baseCache,
            sourceHash: progress.sourceHash,
            totalSegments: progress.totalSegments,
            completedSegments: progress.completedSegments,
            updatedAt: now
          },
          {
            ...progress.entry
          }
        )

        nextCache.completedSegments = progress.completedSegments
        nextCache.updatedAt = now

        setTranslationCache(progress.paperId, nextCache)
        setHasTranslationState(progress.paperId, hasPaperTranslationResult(nextCache))
        setTranslationTaskState(progress.paperId, {
          isRunning: progress.isRunning,
          completedSegments: progress.completedSegments,
          totalSegments: progress.totalSegments,
          lastError: progress.status === 'failed' ? progress.errorMessage : undefined
        })
      }
    )
  }

  async function loadTranslationState(paperId: string): Promise<void> {
    ensureTranslationProgressListener()

    const result = await window.api.paper.getTranslationState(paperId)
    if (!result.success || !result.data) {
      setTranslationCache(paperId, null)
      setTranslationTaskState(paperId, createIdleTranslationTaskState())
      return
    }

    const snapshot = result.data.cache
    const existingCache = translationByPaperId.value[paperId]

    if (
      existingCache &&
      snapshot &&
      existingCache.sourceHash === snapshot.sourceHash &&
      existingCache.entries.length > 0
    ) {
      const merged = mergeTranslationEntries(snapshot, existingCache)
      setTranslationCache(paperId, merged)
      setHasTranslationState(paperId, hasPaperTranslationResult(merged))
    } else {
      setTranslationCache(paperId, snapshot)
      setHasTranslationState(paperId, hasPaperTranslationResult(snapshot))
    }

    setTranslationTaskState(paperId, {
      isRunning: result.data.isRunning,
      completedSegments: (snapshot ?? existingCache)?.completedSegments ?? 0,
      totalSegments: (snapshot ?? existingCache)?.totalSegments ?? 0
    })

    if (result.data.isRunning) {
      await window.api.paper.startTranslation(paperId)
    }
  }

  async function ensureTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    ensureTranslationProgressListener()

    const cachedTranslation = translationByPaperId.value[paperId]
    const taskState = translationTaskByPaperId.value[paperId] || createIdleTranslationTaskState()

    if (
      cachedTranslation &&
      cachedTranslation.totalSegments > 0 &&
      cachedTranslation.completedSegments >= cachedTranslation.totalSegments &&
      !taskState.isRunning
    ) {
      return { success: true }
    }

    const result = await window.api.paper.startTranslation(paperId)
    if (!result.success) {
      setTranslationTaskState(paperId, {
        ...taskState,
        lastError: result.error
      })
      return { success: false, error: result.error }
    }

    if (result.alreadyRunning) {
      return { success: true }
    }

    await loadTranslationState(paperId)
    return { success: true }
  }

  async function toggleTranslationVisible(): Promise<{ success: boolean; error?: string }> {
    if (!currentPaperId.value) {
      return { success: false, error: '当前没有打开论文' }
    }

    if (translationVisible.value) {
      hideTranslation()
      return { success: true }
    }

    translationVisible.value = true
    const result = await ensureTranslation(currentPaperId.value)
    if (!result.success) {
      hideTranslation()
      return result
    }

    return { success: true }
  }

  async function loadTranslationStatus(paperIds: string[]): Promise<void> {
    if (paperIds.length === 0) {
      hasTranslationByPaperId.value = {}
      return
    }

    const result = await window.api.paper.listTranslationStatus(paperIds)
    if (!result.success || !result.data) {
      return
    }

    hasTranslationByPaperId.value = result.data
  }

  async function deleteTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    const result = await window.api.paper.deleteTranslation(paperId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    setTranslationCache(paperId, null)
    setTranslationTaskState(paperId, createIdleTranslationTaskState())
    setHasTranslationState(paperId, false)

    if (currentPaperId.value === paperId) {
      hideTranslation()
    }

    return { success: true }
  }

  return {
    translationVisible,
    translationByPaperId,
    translationTaskByPaperId,
    hasTranslationByPaperId,
    currentTranslationCache,
    figureCaptionTranslationMap,
    currentTranslationTask,
    isCurrentPaperTranslating,
    hideTranslation,
    ensureTranslationProgressListener,
    loadTranslationState,
    ensureTranslation,
    toggleTranslationVisible,
    loadTranslationStatus,
    deleteTranslation,
    setTranslationCache,
    setTranslationTaskState,
    setHasTranslationState,
    clearTranslationState
  }
}
