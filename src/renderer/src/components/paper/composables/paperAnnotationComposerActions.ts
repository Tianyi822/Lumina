import type { ComputedRef, Ref } from 'vue'
import type { PaperQuote } from '@shared/types/chat'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor,
  PaperReaderSegmentSourceRefs,
  ReanchorPaperAnnotationPayload
} from '@shared/types/paper'
import { mapPaperTextAnchorBetweenTexts } from '@shared/utils/paperAnnotationAnchors'
import type {
  AnnotationHoverPopoverState,
  NoteEditorState,
  SelectionDraft
} from './paperAnnotationComposerTypes'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'
import type { RenderedSegment } from './usePaperMarkdownEngine'

const EMPTY_SOURCE_REFS: PaperReaderSegmentSourceRefs = {
  pageIndexes: [],
  blockIndexes: []
}

interface PaperAnnotationComposerActionsOptions {
  paperId: () => string
  renderedSegments: Ref<RenderedSegment[]>
  getSourceSegments: () => RenderSourceSegment[]
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  reanchorAnnotation: (
    params: ReanchorPaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
  onAddToChat?: (quote: PaperQuote) => void
  currentTranslationRevisionId: ComputedRef<string | null>
  currentTranslationModelName: ComputedRef<string | undefined>
  rebindAnnotationId: Ref<string | null>
  ignoredOutdatedAnnotationIds: Ref<Record<string, true>>
  noteEditorDraft: Ref<NoteEditorState | null>
  annotationHoverPopover: Ref<AnnotationHoverPopoverState | null>
  hoverPopoverError: Ref<string | null>
  cancelRebindMode: () => void
  clearSelectionUi: () => void
  clearHoverPopover: () => void
  startRebind: (annotation: PaperAnnotation) => void
}

export interface PaperAnnotationComposerActions {
  persistSelectionDraft: (
    draft: SelectionDraft,
    kind: PaperAnnotationKind,
    colorKey: PaperAnnotationColorKey,
    comment: string
  ) => Promise<{ success: boolean; error?: string }>
  addSelectionDraftToChat: (draft: SelectionDraft) => { success: boolean; error?: string }
  deleteAnnotationById: (annotationId: string) => Promise<{ success: boolean; error?: string }>
  updateAnnotationToCurrentTranslation: (annotation: PaperAnnotation) => Promise<void>
  dismissOutdatedAnnotation: (annotationId: string) => void
}

export function createPaperAnnotationComposerActions(
  options: PaperAnnotationComposerActionsOptions
): PaperAnnotationComposerActions {
  function createTranslationAnchorPayload(
    anchor: PaperAnnotationTextAnchor | undefined
  ): CreatePaperAnnotationPayload['translationAnchor'] {
    if (!anchor) {
      return undefined
    }

    return {
      ...anchor,
      translationRevisionId: options.currentTranslationRevisionId.value || 'missing-translation',
      modelName: options.currentTranslationModelName.value || undefined
    }
  }

  async function persistSelectionDraft(
    draft: SelectionDraft,
    kind: PaperAnnotationKind,
    colorKey: PaperAnnotationColorKey,
    comment: string
  ): Promise<{ success: boolean; error?: string }> {
    const semanticAnchor = {
      segmentStableId: draft.segmentStableId,
      renderSegmentIdAtCreation: draft.renderSegmentId,
      sourceRevisionId: draft.sourceRevisionId,
      segmentTextHash: draft.segmentTextHash,
      sourceRefs: draft.sourceRefs
    }
    const translationAnchor = createTranslationAnchorPayload(draft.translationAnchor)

    const result =
      draft.mode === 'rebind' && draft.annotationId
        ? await options.reanchorAnnotation({
            paperId: options.paperId(),
            annotationId: draft.annotationId,
            kind,
            semanticAnchor,
            originalAnchor: draft.originalAnchor,
            translationAnchor,
            selectedTextSnapshot: draft.selectedText,
            contextBefore: draft.contextBefore,
            contextAfter: draft.contextAfter,
            comment,
            colorKey
          } satisfies ReanchorPaperAnnotationPayload)
        : await options.createAnnotation({
            paperId: options.paperId(),
            kind,
            noteType: draft.noteType,
            createdInView: draft.viewKind,
            semanticAnchor,
            originalAnchor: draft.originalAnchor,
            translationAnchor,
            selectedTextSnapshot: draft.selectedText,
            contextBefore: draft.contextBefore,
            contextAfter: draft.contextAfter,
            comment,
            colorKey
          } satisfies CreatePaperAnnotationPayload)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    if (draft.mode === 'rebind') {
      options.cancelRebindMode()
    }

    return { success: true }
  }

  function addSelectionDraftToChat(draft: SelectionDraft): { success: boolean; error?: string } {
    const selectedAnchor =
      draft.viewKind === 'original'
        ? draft.originalAnchor
        : draft.viewKind === 'translation'
          ? draft.translationAnchor
          : draft.originalAnchor || draft.translationAnchor
    if (!selectedAnchor) {
      return { success: false, error: '当前选区无法添加到对话' }
    }

    const sourceSegments = options.getSourceSegments()
    const segment = sourceSegments.find((s) => s.stableId === draft.segmentStableId)
    if (!segment) {
      return { success: false }
    }

    const textAnchor: PaperAnnotationTextAnchor = {
      selectedText: selectedAnchor.selectedText,
      prefixText: selectedAnchor.prefixText,
      suffixText: selectedAnchor.suffixText,
      startOffset: selectedAnchor.startOffset,
      endOffset: selectedAnchor.endOffset,
      normalizedText: selectedAnchor.normalizedText
    }

    const quote: PaperQuote = {
      id: `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      paperId: options.paperId(),
      segmentStableId: draft.segmentStableId,
      segmentIndex: segment.index,
      viewKind: draft.viewKind,
      selectedText: textAnchor.selectedText,
      sourceType: draft.viewKind,
      surroundingContext: draft.quoteContext ? { ...draft.quoteContext } : undefined,
      sourceLocation: {
        segmentStableId: draft.segmentStableId,
        segmentIndex: segment.index,
        pageIndexes: [...draft.sourceRefs.pageIndexes],
        blockIndexes: [...draft.sourceRefs.blockIndexes],
        startOffset: textAnchor.startOffset,
        endOffset: textAnchor.endOffset
      },
      textAnchor,
      ...(draft.viewKind === 'original'
        ? {
            sourceRevisionId: draft.sourceRevisionId,
            segmentTextHash: draft.segmentTextHash
          }
        : {
            translationRevisionId: options.currentTranslationRevisionId.value || undefined,
            translationModelName: options.currentTranslationModelName.value || undefined
          })
    }

    options.onAddToChat?.(quote)

    return { success: true }
  }

  async function deleteAnnotationById(
    annotationId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!options.paperId()) {
      return { success: false, error: '论文不存在' }
    }

    const result = await options.deleteAnnotation(options.paperId(), annotationId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    if (options.rebindAnnotationId.value === annotationId) {
      options.cancelRebindMode()
    }

    if (options.noteEditorDraft.value?.draft.annotationId === annotationId) {
      options.clearSelectionUi()
    }

    if (options.annotationHoverPopover.value?.annotationId === annotationId) {
      options.clearHoverPopover()
    }

    return { success: true }
  }

  async function updateAnnotationToCurrentTranslation(annotation: PaperAnnotation): Promise<void> {
    const segment = options.renderedSegments.value.find(
      (item) => item.stableId === annotation.semanticAnchor.segmentStableId
    )
    if (!segment || !segment.translationText || !annotation.originalAnchor) {
      options.startRebind(annotation)
      return
    }

    const mapped = mapPaperTextAnchorBetweenTexts(
      segment.originalText,
      segment.translationText,
      annotation.originalAnchor
    )
    if (!mapped || mapped.confidence < 0.58) {
      options.startRebind(annotation)
      return
    }

    const payload: ReanchorPaperAnnotationPayload = {
      paperId: options.paperId(),
      annotationId: annotation.id,
      kind: annotation.kind,
      semanticAnchor: {
        segmentStableId: segment.stableId,
        renderSegmentIdAtCreation: segment.renderId,
        sourceRevisionId: segment.sourceRevisionId,
        segmentTextHash: segment.textHash,
        sourceRefs:
          options.getSourceSegments().find((item) => item.stableId === segment.stableId)
            ?.sourceRefs || EMPTY_SOURCE_REFS
      },
      originalAnchor: annotation.originalAnchor,
      translationAnchor: createTranslationAnchorPayload(mapped.anchor),
      selectedTextSnapshot: mapped.anchor.selectedText,
      contextBefore: mapped.anchor.prefixText,
      contextAfter: mapped.anchor.suffixText,
      comment: annotation.comment,
      colorKey: annotation.colorKey
    }

    const result = await options.reanchorAnnotation(payload)
    if (result.success) {
      options.ignoredOutdatedAnnotationIds.value = {
        ...options.ignoredOutdatedAnnotationIds.value,
        [annotation.id]: true
      }
      return
    }

    options.hoverPopoverError.value = result.error || '更新到当前译文失败'
    options.startRebind(annotation)
  }

  function dismissOutdatedAnnotation(annotationId: string): void {
    options.ignoredOutdatedAnnotationIds.value = {
      ...options.ignoredOutdatedAnnotationIds.value,
      [annotationId]: true
    }
  }

  return {
    persistSelectionDraft,
    addSelectionDraftToChat,
    deleteAnnotationById,
    updateAnnotationToCurrentTranslation,
    dismissOutdatedAnnotation
  }
}
