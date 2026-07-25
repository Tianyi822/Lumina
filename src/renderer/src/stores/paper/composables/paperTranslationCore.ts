import type {
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationStatus
} from '@shared/types/paper'

const STATUS_PRIORITY: Record<PaperTranslationStatus, number> = {
  queued: 0,
  translating: 1,
  failed: 2,
  completed: 3,
  skipped: 4
}

export function upsertTranslationEntry(
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

export function mergeTranslationEntries(
  snapshot: PaperTranslationCache,
  live: PaperTranslationCache
): PaperTranslationCache {
  const liveEntryMap = new Map(live.entries.map((entry) => [entry.id, entry]))
  const mergedEntries = snapshot.entries.map((snapshotEntry) => {
    const liveEntry = liveEntryMap.get(snapshotEntry.id)
    if (!liveEntry) return snapshotEntry

    const livePriority = STATUS_PRIORITY[liveEntry.status] ?? 0
    const snapshotPriority = STATUS_PRIORITY[snapshotEntry.status] ?? 0

    if (liveEntry.updatedAt && snapshotEntry.updatedAt) {
      const liveTime = Date.parse(liveEntry.updatedAt)
      const snapshotTime = Date.parse(snapshotEntry.updatedAt)
      if (liveTime > snapshotTime) return liveEntry
      if (liveTime < snapshotTime) return snapshotEntry
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
