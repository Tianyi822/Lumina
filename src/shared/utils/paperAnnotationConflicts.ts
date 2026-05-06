import type {
  PaperAnnotation,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '../types/paper'

export const PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE = '该段内容已存在笔记，不能重复添加'

export type PaperAnnotationNoteConflictReason = 'range_overlap' | 'same_segment'

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
      annotation.semanticAnchor.segmentStableId !== target.segmentStableId
    ) {
      continue
    }

    return {
      annotation,
      reason: hasOverlappingAnchor(annotation, target) ? 'range_overlap' : 'same_segment'
    }
  }

  return null
}
