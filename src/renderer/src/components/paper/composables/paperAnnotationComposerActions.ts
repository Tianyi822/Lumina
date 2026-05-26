import type { PaperQuote } from '@shared/types/chat'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '@shared/types/paper'
import { PAPER_ANNOTATION_NOTE_COLOR_KEY } from '@shared/types/paper'
import type {
  AnnotationHoverPopoverState,
  ComputedRef,
  NoteEditorState,
  Ref,
  SelectionDraft
} from './paperAnnotationComposerTypes'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'

interface PaperAnnotationComposerActionsOptions {
  paperId: () => string
  getSourceSegments: () => RenderSourceSegment[]
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
  onAddToChat?: (quote: PaperQuote) => void
  currentTranslationRevisionId: ComputedRef<string | null>
  currentTranslationModelName: ComputedRef<string | undefined>
  noteEditorDraft: Ref<NoteEditorState | null>
  annotationHoverPopover: Ref<AnnotationHoverPopoverState | null>
  clearSelectionUi: () => void
  clearHoverPopover: () => void
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
  upgradeHighlightToNote: (
    annotation: PaperAnnotation,
    comment: string
  ) => Promise<{ success: boolean; error?: string }>
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
    const result = await options.createAnnotation({
      paperId: options.paperId(),
      kind,
      noteType: draft.noteType,
      createdInView: draft.viewKind,
      semanticAnchor,
      originalAnchor: draft.originalAnchor,
      translationAnchor: createTranslationAnchorPayload(draft.translationAnchor),
      selectedTextSnapshot: draft.selectedText,
      contextBefore: draft.contextBefore,
      contextAfter: draft.contextAfter,
      comment,
      colorKey
    } satisfies CreatePaperAnnotationPayload)

    if (!result.success) {
      return { success: false, error: result.error }
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

    if (options.noteEditorDraft.value?.draft.annotationId === annotationId) {
      options.clearSelectionUi()
    }

    if (options.annotationHoverPopover.value?.annotationId === annotationId) {
      options.clearHoverPopover()
    }

    return { success: true }
  }

  async function upgradeHighlightToNote(
    annotation: PaperAnnotation,
    comment: string
  ): Promise<{ success: boolean; error?: string }> {
    const createResult = await options.createAnnotation({
      paperId: options.paperId(),
      kind: 'note',
      noteType: annotation.noteType,
      createdInView: annotation.createdInView,
      semanticAnchor: annotation.semanticAnchor,
      originalAnchor: annotation.originalAnchor,
      translationAnchor: annotation.translationAnchor,
      selectedTextSnapshot: annotation.selectedTextSnapshot,
      contextBefore: annotation.contextBefore,
      contextAfter: annotation.contextAfter,
      comment,
      colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY
    } satisfies CreatePaperAnnotationPayload)

    if (!createResult.success) {
      return { success: false, error: createResult.error || '创建笔记失败' }
    }

    // 先创建成功后再删除原 highlight，保证数据不丢失
    const deleteResult = await options.deleteAnnotation(options.paperId(), annotation.id)
    if (!deleteResult.success) {
      return { success: false, error: deleteResult.error || '删除原标记失败' }
    }

    return { success: true }
  }

  return {
    persistSelectionDraft,
    addSelectionDraftToChat,
    deleteAnnotationById,
    upgradeHighlightToNote
  }
}
