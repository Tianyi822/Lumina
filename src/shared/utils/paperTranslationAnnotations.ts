import type { PaperAnnotation, PaperAnnotationStore } from '@shared/types/paper'

export interface TranslationAnnotationSummary {
  totalCount: number
  highlightCount: number
  noteCount: number
}

export function isTranslationViewAnnotation(annotation: PaperAnnotation): boolean {
  return annotation.noteType === 'translation_view'
}

export function summarizeTranslationAnnotations(
  annotations: PaperAnnotation[]
): TranslationAnnotationSummary {
  return annotations.reduce<TranslationAnnotationSummary>(
    (summary, annotation) => {
      if (!isTranslationViewAnnotation(annotation)) {
        return summary
      }

      summary.totalCount += 1
      if (annotation.kind === 'note') {
        summary.noteCount += 1
      } else {
        summary.highlightCount += 1
      }

      return summary
    },
    {
      totalCount: 0,
      highlightCount: 0,
      noteCount: 0
    }
  )
}

export function removeTranslationAnnotationsFromStore(
  store: PaperAnnotationStore,
  now: string
): { nextStore: PaperAnnotationStore; removedAnnotations: PaperAnnotation[] } {
  const removedAnnotations = store.annotations.filter((annotation) => {
    return isTranslationViewAnnotation(annotation)
  })

  if (removedAnnotations.length === 0) {
    return {
      nextStore: store,
      removedAnnotations: []
    }
  }

  return {
    nextStore: {
      ...store,
      annotations: store.annotations.filter((annotation) => {
        return !isTranslationViewAnnotation(annotation)
      }),
      updatedAt: now
    },
    removedAnnotations
  }
}
