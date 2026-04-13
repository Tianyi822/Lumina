import type {
  PaperAnnotation,
  PaperAnnotationTextAnchor,
  PaperReaderDocument,
  PaperReaderSegment
} from '@shared/types/paper'
import { findPaperTextAnchorOffset } from '@shared/utils/paperAnnotationAnchors'

interface PaperAnnotationRecoveryResult {
  annotation: PaperAnnotation
  changed: boolean
}

interface AnchorMatchResult {
  segment: PaperReaderSegment
  score: number
}

function scoreContextMatch(
  text: string,
  anchor: PaperAnnotationTextAnchor,
  startOffset: number
): number {
  const prefix = anchor.prefixText
  const suffix = anchor.suffixText
  const prefixStart = Math.max(0, startOffset - prefix.length)
  const actualPrefix = text.slice(prefixStart, startOffset)
  const actualSuffix = text.slice(startOffset + anchor.selectedText.length)
  let score = 0

  if (prefix && actualPrefix.endsWith(prefix)) {
    score += prefix.length * 2
  }

  if (suffix && actualSuffix.startsWith(suffix)) {
    score += suffix.length * 2
  }

  if (startOffset === anchor.startOffset) {
    score += 8
  }

  return score
}

function findBestSegmentForOriginalAnchor(
  readerDocument: PaperReaderDocument,
  annotation: PaperAnnotation
): AnchorMatchResult | null {
  const anchor = annotation.originalAnchor
  if (!anchor) {
    return null
  }

  const currentSegment = readerDocument.segments.find((segment) => {
    return segment.stableId === annotation.semanticAnchor.segmentStableId
  })

  if (currentSegment) {
    const exactOffset = findPaperTextAnchorOffset(currentSegment.originalText, anchor)
    if (exactOffset !== null) {
      return {
        segment: currentSegment,
        score: 10_000 + scoreContextMatch(currentSegment.originalText, anchor, exactOffset)
      }
    }
  }

  let bestMatch: AnchorMatchResult | null = null

  for (const segment of readerDocument.segments) {
    const offset = findPaperTextAnchorOffset(segment.originalText, anchor)
    if (offset === null) {
      continue
    }

    let score = scoreContextMatch(segment.originalText, anchor, offset)
    if (segment.textHash === annotation.semanticAnchor.segmentTextHash) {
      score += 64
    }
    if (
      segment.sourceRefs.start?.pageIndex === annotation.semanticAnchor.sourceRefs.start?.pageIndex
    ) {
      score += 16
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        segment,
        score
      }
    }
  }

  return bestMatch
}

function cloneAnnotation(annotation: PaperAnnotation): PaperAnnotation {
  return {
    ...annotation,
    semanticAnchor: {
      ...annotation.semanticAnchor,
      sourceRefs: {
        ...annotation.semanticAnchor.sourceRefs,
        pageIndexes: [...annotation.semanticAnchor.sourceRefs.pageIndexes],
        blockIndexes: [...annotation.semanticAnchor.sourceRefs.blockIndexes]
      }
    },
    originalAnchor: annotation.originalAnchor ? { ...annotation.originalAnchor } : undefined,
    translationAnchor: annotation.translationAnchor
      ? { ...annotation.translationAnchor }
      : undefined,
    recoveryMeta: { ...annotation.recoveryMeta }
  }
}

export function recoverPaperAnnotation(
  annotation: PaperAnnotation,
  readerDocument: PaperReaderDocument,
  translationAvailable: boolean,
  now: string
): PaperAnnotationRecoveryResult {
  const nextAnnotation = cloneAnnotation(annotation)
  let changed = false

  if (nextAnnotation.noteType === 'original_span' && !nextAnnotation.originalAnchor) {
    if (nextAnnotation.status !== 'invalid') {
      nextAnnotation.status = 'invalid'
      changed = true
    }
    return {
      annotation: nextAnnotation,
      changed
    }
  }

  if (nextAnnotation.noteType === 'translation_view' && !nextAnnotation.translationAnchor) {
    if (!nextAnnotation.originalAnchor) {
      if (nextAnnotation.status !== 'invalid') {
        nextAnnotation.status = 'invalid'
        changed = true
      }
      return {
        annotation: nextAnnotation,
        changed
      }
    }
  }

  const currentSegment = readerDocument.segments.find((segment) => {
    return segment.stableId === nextAnnotation.semanticAnchor.segmentStableId
  })

  const bestMatch = nextAnnotation.originalAnchor
    ? findBestSegmentForOriginalAnchor(readerDocument, nextAnnotation)
    : currentSegment
      ? { segment: currentSegment, score: 1 }
      : null

  nextAnnotation.recoveryMeta.lastRecoveryAttemptAt = now

  if (!bestMatch) {
    if (nextAnnotation.status !== 'needs_reanchor') {
      nextAnnotation.status = 'needs_reanchor'
      changed = true
    }
    nextAnnotation.recoveryMeta.recoveryFailureCount += 1
    nextAnnotation.updatedAt = now
    return {
      annotation: nextAnnotation,
      changed: true
    }
  }

  if (
    bestMatch.segment.stableId !== nextAnnotation.semanticAnchor.segmentStableId ||
    bestMatch.segment.textHash !== nextAnnotation.semanticAnchor.segmentTextHash ||
    bestMatch.segment.sourceRevisionId !== nextAnnotation.semanticAnchor.sourceRevisionId
  ) {
    nextAnnotation.semanticAnchor = {
      segmentStableId: bestMatch.segment.stableId,
      renderSegmentIdAtCreation: bestMatch.segment.renderId,
      sourceRevisionId: bestMatch.segment.sourceRevisionId,
      segmentTextHash: bestMatch.segment.textHash,
      sourceRefs: bestMatch.segment.sourceRefs
    }
    changed = true
  }

  const nextStatus =
    nextAnnotation.noteType === 'translation_view' && !translationAvailable
      ? 'translation_missing'
      : 'active'

  if (nextAnnotation.status !== nextStatus) {
    nextAnnotation.status = nextStatus
    changed = true
  }

  nextAnnotation.recoveryMeta.lastResolvedAt = now
  if (nextAnnotation.recoveryMeta.recoveryFailureCount !== 0) {
    nextAnnotation.recoveryMeta.recoveryFailureCount = 0
    changed = true
  }

  if (changed) {
    nextAnnotation.updatedAt = now
  }

  return {
    annotation: nextAnnotation,
    changed
  }
}
