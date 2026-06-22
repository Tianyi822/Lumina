import type { PaperAnnotation } from '@shared/types/paper'

interface AnnotationRenderSegment {
  annotations: PaperAnnotation[]
  htmlStatus: 'pending' | 'ready' | 'error'
}

export interface AnnotationRenderMergeResult<T extends AnnotationRenderSegment> {
  segment: T
  visualChanged: boolean
}

export function getSegmentAnnotationRenderKey(annotations: readonly PaperAnnotation[]): string {
  return annotations
    .map((annotation) =>
      [
        annotation.id,
        annotation.kind,
        annotation.noteType,
        annotation.createdInView,
        annotation.colorKey,
        annotation.status,
        annotation.semanticAnchor.segmentTextHash,
        annotation.originalAnchor?.startOffset ?? '',
        annotation.originalAnchor?.endOffset ?? '',
        annotation.translationAnchor?.startOffset ?? '',
        annotation.translationAnchor?.endOffset ?? ''
      ].join('\u0002')
    )
    .join('\u0001')
}

export function sortPaperAnnotationsForRender(
  annotations: readonly PaperAnnotation[]
): PaperAnnotation[] {
  return [...annotations].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function areAnnotationReferencesEqual(
  left: readonly PaperAnnotation[],
  right: readonly PaperAnnotation[]
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((annotation, index) => annotation === right[index])
}

export function mergeSegmentAnnotationsForRender<T extends AnnotationRenderSegment>(
  segment: T,
  nextAnnotations: readonly PaperAnnotation[]
): AnnotationRenderMergeResult<T> {
  const sortedAnnotations = sortPaperAnnotationsForRender(nextAnnotations)
  const prevKey = getSegmentAnnotationRenderKey(segment.annotations)
  const nextKey = getSegmentAnnotationRenderKey(sortedAnnotations)

  if (prevKey === nextKey) {
    if (areAnnotationReferencesEqual(segment.annotations, sortedAnnotations)) {
      return { segment, visualChanged: false }
    }

    return {
      segment: {
        ...segment,
        annotations: sortedAnnotations
      } as T,
      visualChanged: false
    }
  }

  return {
    segment: {
      ...segment,
      annotations: sortedAnnotations,
      htmlStatus: 'pending'
    } as T,
    visualChanged: true
  }
}
