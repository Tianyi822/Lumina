import type {
  PaperAnnotation,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '../types/paper'

type PaperAnnotationNoteConflictReason = 'range_overlap'

export interface PaperAnnotationNoteConflictTarget {
  kind: PaperAnnotationKind
  segmentStableId: string
  originalAnchor?: PaperAnnotationTextAnchor
  translationAnchor?: PaperAnnotationTextAnchor
  ignoreAnnotationId?: string
}

export interface PaperAnnotationNoteConflict {
  annotation: PaperAnnotation
  reason: PaperAnnotationNoteConflictReason
}

function isValidTextRange(anchor: PaperAnnotationTextAnchor | undefined): boolean {
  return !!anchor && anchor.endOffset > anchor.startOffset
}

function rangesOverlap(
  left: PaperAnnotationTextAnchor | undefined,
  right: PaperAnnotationTextAnchor | undefined
): boolean {
  if (!left || !right || !isValidTextRange(left) || !isValidTextRange(right)) {
    return false
  }

  return left.startOffset < right.endOffset && right.startOffset < left.endOffset
}

function hasOverlappingAnchor(
  annotation: PaperAnnotation,
  target: PaperAnnotationNoteConflictTarget
): boolean {
  return (
    rangesOverlap(annotation.originalAnchor, target.originalAnchor) ||
    rangesOverlap(annotation.translationAnchor, target.translationAnchor)
  )
}

export function findPaperAnnotationNoteConflict(
  annotations: PaperAnnotation[],
  target: PaperAnnotationNoteConflictTarget
): PaperAnnotationNoteConflict | null {
  if (target.kind !== 'note') {
    return null
  }

  for (const annotation of annotations) {
    if (
      annotation.kind !== 'note' ||
      annotation.id === target.ignoreAnnotationId ||
      annotation.semanticAnchor.segmentStableId !== target.segmentStableId ||
      !hasOverlappingAnchor(annotation, target)
    ) {
      continue
    }

    return {
      annotation,
      reason: 'range_overlap'
    }
  }

  return null
}
