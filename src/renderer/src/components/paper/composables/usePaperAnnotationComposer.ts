import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationTextAnchor,
  PaperReaderSegmentSourceRefs,
  PaperTranslationCache,
  ReanchorPaperAnnotationPayload
} from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  mapPaperTextAnchorBetweenTexts
} from '@shared/utils/paperAnnotationAnchors'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'
import type { RenderedSegment } from './usePaperMarkdownEngine'

export interface SelectionDraft {
  mode: 'create' | 'rebind'
  annotationId?: string
  viewKind: 'original' | 'translation'
  noteType: CreatePaperAnnotationPayload['noteType']
  segmentStableId: string
  renderSegmentId: string
  sourceRevisionId: string
  segmentTextHash: string
  sourceRefs: PaperReaderSegmentSourceRefs
  selectedText: string
  contextBefore: string
  contextAfter: string
  originalAnchor?: PaperAnnotationTextAnchor
  translationAnchor?: PaperAnnotationTextAnchor
  x: number
  y: number
}

const DEFAULT_ANNOTATION_COLOR = '#fde68a'
const EMPTY_SOURCE_REFS: PaperReaderSegmentSourceRefs = {
  pageIndexes: [],
  blockIndexes: []
}

export interface PaperAnnotationComposerOptions {
  paperId: () => string
  translationCache: () => PaperTranslationCache | null | undefined
  annotations: () => PaperAnnotation[] | undefined
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
}

export interface PaperAnnotationComposer {
  composerDraft: Ref<SelectionDraft | null>
  composerComment: Ref<string>
  composerColor: Ref<string>
  composerSaving: Ref<boolean>
  composerError: Ref<string | null>
  rebindAnnotationId: Ref<string | null>
  ignoredOutdatedAnnotationIds: Ref<Record<string, true>>
  currentAnnotations: ComputedRef<PaperAnnotation[]>
  orphanAnnotations: ComputedRef<PaperAnnotation[]>
  outdatedAnnotations: ComputedRef<PaperAnnotation[]>
  translationMissingAnnotations: ComputedRef<PaperAnnotation[]>
  currentTranslationRevisionId: ComputedRef<string | null>
  updateComposerFromSelection: () => void
  handleCreateAnnotation: () => Promise<void>
  handleDeleteAnnotation: (annotationId: string) => Promise<void>
  startRebind: (annotation: PaperAnnotation) => void
  updateAnnotationToCurrentTranslation: (annotation: PaperAnnotation) => Promise<void>
  cancelRebindMode: () => void
  clearComposer: () => void
  handleCancelComposer: () => void
  scrollToSegment: (stableId: string) => void
  dismissOutdatedAnnotation: (annotationId: string) => void
  getAnnotationTypeLabel: (annotation: PaperAnnotation) => string
  getAnnotationStatusLabel: (annotation: PaperAnnotation) => string | null
  isAnnotationOutdated: (annotation: PaperAnnotation) => boolean
  handleDocumentPointerDown: (event: MouseEvent) => void
  handleDocumentKeyDown: (event: KeyboardEvent) => void
}

export function usePaperAnnotationComposer(
  options: PaperAnnotationComposerOptions
): PaperAnnotationComposer {
  const composerDraft = ref<SelectionDraft | null>(null)
  const composerComment = ref('')
  const composerColor = ref(DEFAULT_ANNOTATION_COLOR)
  const composerSaving = ref(false)
  const composerError = ref<string | null>(null)
  const rebindAnnotationId = ref<string | null>(null)
  const ignoredOutdatedAnnotationIds = ref<Record<string, true>>({})

  const currentTranslationRevisionId = computed(() => {
    const cache = options.translationCache()
    if (!cache) {
      return null
    }

    return cache.translationRevisionId || `${cache.sourceHash}:${cache.updatedAt}`
  })

  const currentTranslationModelName = computed(() => {
    return options.translationCache()?.modelName
  })

  const currentAnnotations = computed(() => options.annotations() ?? [])

  const currentSegmentStableIds = computed(
    () => new Set(options.getSourceSegments().map((segment) => segment.stableId))
  )

  const orphanAnnotations = computed(() => {
    return currentAnnotations.value.filter((annotation) => {
      return (
        annotation.status === 'needs_reanchor' ||
        annotation.status === 'invalid' ||
        !currentSegmentStableIds.value.has(annotation.semanticAnchor.segmentStableId)
      )
    })
  })

  const outdatedAnnotations = computed(() => {
    return currentAnnotations.value.filter((annotation) => isAnnotationOutdated(annotation))
  })

  const translationMissingAnnotations = computed(() => {
    return currentAnnotations.value.filter(
      (annotation) => annotation.status === 'translation_missing'
    )
  })

  function isAnnotationOutdated(annotation: PaperAnnotation): boolean {
    if (ignoredOutdatedAnnotationIds.value[annotation.id]) {
      return false
    }

    return !!(
      annotation.translationAnchor?.translationRevisionId &&
      currentTranslationRevisionId.value &&
      annotation.translationAnchor.translationRevisionId !== currentTranslationRevisionId.value
    )
  }

  function clearComposer(): void {
    composerDraft.value = null
    composerComment.value = ''
    composerColor.value = DEFAULT_ANNOTATION_COLOR
    composerSaving.value = false
    composerError.value = null
  }

  function cancelRebindMode(): void {
    rebindAnnotationId.value = null
  }

  function handleCancelComposer(): void {
    clearComposer()
    if (rebindAnnotationId.value) {
      cancelRebindMode()
    }
  }

  function getAnnotationById(annotationId: string | null): PaperAnnotation | null {
    if (!annotationId) {
      return null
    }

    return currentAnnotations.value.find((annotation) => annotation.id === annotationId) || null
  }

  function createTranslationAnchorPayload(
    anchor: PaperAnnotationTextAnchor | undefined
  ): CreatePaperAnnotationPayload['translationAnchor'] {
    if (!anchor) {
      return undefined
    }

    return {
      ...anchor,
      translationRevisionId: currentTranslationRevisionId.value || 'missing-translation',
      modelName: currentTranslationModelName.value || undefined
    }
  }

  function scrollToSegment(stableId: string): void {
    if (typeof document === 'undefined') {
      return
    }

    const segmentElement = document.querySelector<HTMLElement>(
      `[data-paper-segment-stable-id="${stableId}"]`
    )
    segmentElement?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
  }

  function startRebind(annotation: PaperAnnotation): void {
    rebindAnnotationId.value = annotation.id
    composerComment.value = annotation.comment
    composerColor.value = annotation.color
    composerError.value = null
    composerDraft.value = null
    scrollToSegment(annotation.semanticAnchor.segmentStableId)
  }

  async function updateAnnotationToCurrentTranslation(annotation: PaperAnnotation): Promise<void> {
    const segment = options.renderedSegments.value.find(
      (item) => item.stableId === annotation.semanticAnchor.segmentStableId
    )
    if (!segment || !segment.translationText || !annotation.originalAnchor) {
      startRebind(annotation)
      return
    }

    const mapped = mapPaperTextAnchorBetweenTexts(
      segment.originalText,
      segment.translationText,
      annotation.originalAnchor
    )
    if (!mapped || mapped.confidence < 0.58) {
      startRebind(annotation)
      return
    }

    const payload: ReanchorPaperAnnotationPayload = {
      paperId: options.paperId(),
      annotationId: annotation.id,
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
      color: annotation.color
    }

    const result = await options.reanchorAnnotation(payload)
    if (result.success) {
      ignoredOutdatedAnnotationIds.value = {
        ...ignoredOutdatedAnnotationIds.value,
        [annotation.id]: true
      }
      return
    }

    composerError.value = result.error || '更新到当前译文失败'
    startRebind(annotation)
  }

  function getSelectionTextOffset(root: HTMLElement, container: Node, offset: number): number {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(container, offset)
    return range.toString().length
  }

  function updateComposerFromSelection(): void {
    if (typeof window === 'undefined') {
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }

    const range = selection.getRangeAt(0)
    const startSurface =
      range.startContainer instanceof Element
        ? range.startContainer.closest<HTMLElement>('[data-paper-selection-surface="true"]')
        : range.startContainer.parentElement?.closest<HTMLElement>(
            '[data-paper-selection-surface="true"]'
          )
    const endSurface =
      range.endContainer instanceof Element
        ? range.endContainer.closest<HTMLElement>('[data-paper-selection-surface="true"]')
        : range.endContainer.parentElement?.closest<HTMLElement>(
            '[data-paper-selection-surface="true"]'
          )

    if (!startSurface || !endSurface || startSurface !== endSurface) {
      return
    }

    if (
      !startSurface.contains(range.startContainer) ||
      !startSurface.contains(range.endContainer)
    ) {
      return
    }

    const selectedText = selection.toString().trim()
    if (!selectedText) {
      return
    }

    const segment = options.renderedSegments.value.find((item) => {
      return item.stableId === startSurface.dataset.segmentStableId
    })
    if (!segment) {
      return
    }

    const textContent = startSurface.textContent || ''
    const startOffset = getSelectionTextOffset(
      startSurface,
      range.startContainer,
      range.startOffset
    )
    const endOffset = getSelectionTextOffset(startSurface, range.endContainer, range.endOffset)
    if (startOffset >= endOffset) {
      return
    }

    const textAnchor = buildPaperTextAnchor(textContent, startOffset, endOffset)
    const rect = range.getBoundingClientRect()
    const viewKind = (startSurface.dataset.viewKind as 'original' | 'translation') || 'original'
    const renderSourceSegment = options
      .getSourceSegments()
      .find((item) => item.stableId === segment.stableId)
    if (!renderSourceSegment) {
      return
    }

    const targetAnnotation = getAnnotationById(rebindAnnotationId.value)
    const mappedOriginalAnchor =
      viewKind === 'translation' && segment.translationText
        ? mapPaperTextAnchorBetweenTexts(segment.translationText, segment.originalText, textAnchor)
        : null
    const mappedTranslationAnchor =
      viewKind === 'original' && segment.translationText
        ? mapPaperTextAnchorBetweenTexts(segment.originalText, segment.translationText, textAnchor)
        : null

    composerDraft.value = {
      mode: targetAnnotation ? 'rebind' : 'create',
      annotationId: targetAnnotation?.id,
      viewKind,
      noteType:
        targetAnnotation?.noteType ||
        (viewKind === 'original' ? 'original_span' : 'translation_view'),
      segmentStableId: segment.stableId,
      renderSegmentId: segment.renderId,
      sourceRevisionId: segment.sourceRevisionId,
      segmentTextHash: segment.textHash,
      sourceRefs: renderSourceSegment.sourceRefs,
      selectedText: textAnchor.selectedText,
      contextBefore: textContent.slice(Math.max(0, startOffset - 64), startOffset),
      contextAfter: textContent.slice(endOffset, Math.min(textContent.length, endOffset + 64)),
      originalAnchor:
        viewKind === 'original'
          ? textAnchor
          : mappedOriginalAnchor && mappedOriginalAnchor.confidence >= 0.58
            ? mappedOriginalAnchor.anchor
            : undefined,
      translationAnchor:
        viewKind === 'translation'
          ? textAnchor
          : mappedTranslationAnchor && mappedTranslationAnchor.confidence >= 0.58
            ? mappedTranslationAnchor.anchor
            : undefined,
      x: Math.min(window.innerWidth - 456, Math.max(16, rect.left - 16)),
      y: Math.min(window.innerHeight - 420, Math.max(16, rect.bottom + 12))
    }
    composerComment.value = targetAnnotation?.comment || ''
    composerColor.value = targetAnnotation?.color || DEFAULT_ANNOTATION_COLOR
    composerError.value = null
  }

  async function handleCreateAnnotation(): Promise<void> {
    if (!composerDraft.value) {
      return
    }

    const comment = composerComment.value.trim()
    if (!comment) {
      composerError.value = '请先填写笔记内容'
      return
    }

    composerSaving.value = true
    composerError.value = null
    const draft = composerDraft.value

    try {
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
              semanticAnchor,
              originalAnchor: draft.originalAnchor,
              translationAnchor,
              selectedTextSnapshot: draft.selectedText,
              contextBefore: draft.contextBefore,
              contextAfter: draft.contextAfter,
              comment,
              color: composerColor.value
            } satisfies ReanchorPaperAnnotationPayload)
          : await options.createAnnotation({
              paperId: options.paperId(),
              noteType: draft.noteType,
              createdInView: draft.viewKind,
              semanticAnchor,
              originalAnchor: draft.originalAnchor,
              translationAnchor,
              selectedTextSnapshot: draft.selectedText,
              contextBefore: draft.contextBefore,
              contextAfter: draft.contextAfter,
              comment,
              color: composerColor.value
            } satisfies CreatePaperAnnotationPayload)

      if (!result.success) {
        composerSaving.value = false
        composerError.value =
          result.error || (draft.mode === 'rebind' ? '重新绑定笔记失败' : '创建笔记失败')
        return
      }

      if (draft.mode === 'rebind') {
        cancelRebindMode()
      }
      window.getSelection()?.removeAllRanges()
      clearComposer()
    } catch (error) {
      composerSaving.value = false
      composerError.value =
        error instanceof Error ? error.message : String(error) || '操作失败，请重试'
    }
  }

  async function handleDeleteAnnotation(annotationId: string): Promise<void> {
    if (!options.paperId()) {
      return
    }

    await options.deleteAnnotation(options.paperId(), annotationId)
    if (rebindAnnotationId.value === annotationId) {
      cancelRebindMode()
    }
    if (composerDraft.value?.annotationId === annotationId) {
      clearComposer()
    }
  }

  function getAnnotationTypeLabel(annotation: PaperAnnotation): string {
    return annotation.noteType === 'original_span' ? '原文锚定' : '译文视图'
  }

  function getAnnotationStatusLabel(annotation: PaperAnnotation): string | null {
    if (annotation.status === 'translation_missing') {
      return '译文缺失'
    }
    if (annotation.status === 'needs_reanchor') {
      return '待重新定位'
    }
    if (annotation.status === 'invalid') {
      return '数据异常'
    }

    if (isAnnotationOutdated(annotation)) {
      return '旧译文'
    }

    return null
  }

  function dismissOutdatedAnnotation(annotationId: string): void {
    ignoredOutdatedAnnotationIds.value = {
      ...ignoredOutdatedAnnotationIds.value,
      [annotationId]: true
    }
  }

  function handleDocumentPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }

    if (target.closest('.paper-markdown-view__composer')) {
      return
    }

    clearComposer()
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      clearComposer()
      cancelRebindMode()
    }
  }

  return {
    composerDraft,
    composerComment,
    composerColor,
    composerSaving,
    composerError,
    rebindAnnotationId,
    ignoredOutdatedAnnotationIds,
    currentAnnotations,
    orphanAnnotations,
    outdatedAnnotations,
    translationMissingAnnotations,
    currentTranslationRevisionId,
    updateComposerFromSelection,
    handleCreateAnnotation,
    handleDeleteAnnotation,
    startRebind,
    updateAnnotationToCurrentTranslation,
    cancelRebindMode,
    clearComposer,
    handleCancelComposer,
    scrollToSegment,
    dismissOutdatedAnnotation,
    getAnnotationTypeLabel,
    getAnnotationStatusLabel,
    isAnnotationOutdated,
    handleDocumentPointerDown,
    handleDocumentKeyDown
  }
}
