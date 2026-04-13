import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor,
  PaperReaderSegmentSourceRefs,
  PaperTranslationCache,
  ReanchorPaperAnnotationPayload,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import {
  PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
  PAPER_ANNOTATION_NOTE_COLOR_KEY
} from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  mapPaperTextAnchorBetweenTexts
} from '@shared/utils/paperAnnotationAnchors'
import {
  clampFloatingPosition,
  computeFloatingPosition,
  HOVER_POPOVER_HEIGHT,
  HOVER_POPOVER_WIDTH,
  NOTE_EDITOR_HEIGHT,
  NOTE_EDITOR_WIDTH,
  SELECTION_MENU_HEIGHT,
  SELECTION_MENU_WIDTH
} from './paperAnnotationFloating'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'
import type { RenderedSegment } from './usePaperMarkdownEngine'

const EMPTY_SOURCE_REFS: PaperReaderSegmentSourceRefs = {
  pageIndexes: [],
  blockIndexes: []
}

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
}

export interface SelectionActionMenuState {
  draft: SelectionDraft
  x: number
  y: number
  showHighlightPalette: boolean
}

export interface NoteEditorState {
  draft: SelectionDraft
  x: number
  y: number
}

export interface AnnotationHoverPopoverState {
  annotationId: string
  x: number
  y: number
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
  updateAnnotation: (
    params: UpdatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
}

export interface PaperAnnotationComposer {
  selectionActionMenu: Ref<SelectionActionMenuState | null>
  selectionActionMenuError: Ref<string | null>
  noteEditorDraft: Ref<NoteEditorState | null>
  noteEditorComment: Ref<string>
  noteEditorSaving: Ref<boolean>
  noteEditorError: Ref<string | null>
  annotationHoverPopover: Ref<AnnotationHoverPopoverState | null>
  hoverPopoverAnnotation: ComputedRef<PaperAnnotation | null>
  hoverPopoverComment: Ref<string>
  hoverPopoverSaving: Ref<boolean>
  hoverPopoverError: Ref<string | null>
  rebindAnnotationId: Ref<string | null>
  ignoredOutdatedAnnotationIds: Ref<Record<string, true>>
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  currentAnnotations: ComputedRef<PaperAnnotation[]>
  orphanAnnotations: ComputedRef<PaperAnnotation[]>
  outdatedAnnotations: ComputedRef<PaperAnnotation[]>
  translationMissingAnnotations: ComputedRef<PaperAnnotation[]>
  currentTranslationRevisionId: ComputedRef<string | null>
  updateComposerFromSelection: () => void
  handleOpenHighlightPalette: () => void
  handleCreateHighlight: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleOpenNoteEditorFromSelection: () => void
  handleSaveNote: () => Promise<void>
  handleCancelNoteEditor: () => void
  handleUpdateHoverColor: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleSaveHoverNote: () => Promise<void>
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
  handleSurfaceAnnotationClick: (event: MouseEvent) => void
}

export function usePaperAnnotationComposer(
  options: PaperAnnotationComposerOptions
): PaperAnnotationComposer {
  const selectionActionMenu = ref<SelectionActionMenuState | null>(null)
  const selectionActionMenuError = ref<string | null>(null)
  const noteEditorDraft = ref<NoteEditorState | null>(null)
  const noteEditorComment = ref('')
  const noteEditorSaving = ref(false)
  const noteEditorError = ref<string | null>(null)
  const annotationHoverPopover = ref<AnnotationHoverPopoverState | null>(null)
  const hoverPopoverComment = ref('')
  const hoverPopoverSaving = ref(false)
  const hoverPopoverError = ref<string | null>(null)
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

  const hoverPopoverAnnotation = computed(() => {
    if (!annotationHoverPopover.value) {
      return null
    }

    return getAnnotationById(annotationHoverPopover.value.annotationId)
  })

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

  function clearSelectionUi(): void {
    selectionActionMenu.value = null
    selectionActionMenuError.value = null
    noteEditorDraft.value = null
    noteEditorComment.value = ''
    noteEditorSaving.value = false
    noteEditorError.value = null
  }

  function clearHoverPopover(): void {
    annotationHoverPopover.value = null
    hoverPopoverComment.value = ''
    hoverPopoverSaving.value = false
    hoverPopoverError.value = null
  }

  function clearComposer(): void {
    clearSelectionUi()
    clearHoverPopover()
  }

  function clearNativeSelection(): void {
    if (typeof window === 'undefined') {
      return
    }

    window.getSelection()?.removeAllRanges()
  }

  function cancelRebindMode(): void {
    rebindAnnotationId.value = null
  }

  function handleCancelComposer(): void {
    clearComposer()
    clearNativeSelection()
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

  function isAnnotationOutdated(annotation: PaperAnnotation): boolean {
    if (annotation.noteType !== 'translation_view') {
      return false
    }

    if (ignoredOutdatedAnnotationIds.value[annotation.id]) {
      return false
    }

    return !!(
      annotation.translationAnchor?.translationRevisionId &&
      currentTranslationRevisionId.value &&
      annotation.translationAnchor.translationRevisionId !== currentTranslationRevisionId.value
    )
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
    clearComposer()
    scrollToSegment(annotation.semanticAnchor.segmentStableId)
  }

  function getSelectionTextOffset(root: HTMLElement, container: Node, offset: number): number {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(container, offset)
    return range.toString().length
  }

  function buildSelectionDraftFromCurrentSelection(): {
    draft: SelectionDraft
    rect: DOMRect
    targetAnnotation: PaperAnnotation | null
  } | null {
    if (typeof window === 'undefined') {
      return null
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
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
      return null
    }

    if (
      !startSurface.contains(range.startContainer) ||
      !startSurface.contains(range.endContainer)
    ) {
      return null
    }

    const selectedText = selection.toString().trim()
    if (!selectedText) {
      return null
    }

    const segment = options.renderedSegments.value.find((item) => {
      return item.stableId === startSurface.dataset.segmentStableId
    })
    if (!segment) {
      return null
    }

    const textContent = startSurface.textContent || ''
    const startOffset = getSelectionTextOffset(
      startSurface,
      range.startContainer,
      range.startOffset
    )
    const endOffset = getSelectionTextOffset(startSurface, range.endContainer, range.endOffset)
    if (startOffset >= endOffset) {
      return null
    }

    const textAnchor = buildPaperTextAnchor(textContent, startOffset, endOffset)
    const viewKind = (startSurface.dataset.viewKind as 'original' | 'translation') || 'original'
    const renderSourceSegment = options
      .getSourceSegments()
      .find((item) => item.stableId === segment.stableId)
    if (!renderSourceSegment) {
      return null
    }

    const targetAnnotation = getAnnotationById(rebindAnnotationId.value)
    const mappedOriginalAnchor =
      viewKind === 'translation' && segment.translationText
        ? mapPaperTextAnchorBetweenTexts(segment.translationText, segment.originalText, textAnchor)
        : null

    return {
      rect: range.getBoundingClientRect(),
      targetAnnotation,
      draft: {
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
        translationAnchor: viewKind === 'translation' ? textAnchor : undefined
      }
    }
  }

  function openSelectionActionMenu(
    draft: SelectionDraft,
    rect: DOMRect,
    showHighlightPalette = false
  ): void {
    const position = computeFloatingPosition(rect, SELECTION_MENU_WIDTH, SELECTION_MENU_HEIGHT)
    selectionActionMenu.value = {
      draft,
      x: position.x,
      y: position.y,
      showHighlightPalette
    }
    selectionActionMenuError.value = null
  }

  function openNoteEditor(draft: SelectionDraft, rect: DOMRect, comment: string): void {
    const position = computeFloatingPosition(rect, NOTE_EDITOR_WIDTH, NOTE_EDITOR_HEIGHT)
    openNoteEditorAtPosition(draft, position.x, position.y, comment)
  }

  function openNoteEditorAtPosition(
    draft: SelectionDraft,
    x: number,
    y: number,
    comment: string
  ): void {
    const position = clampFloatingPosition(x, y, NOTE_EDITOR_WIDTH, NOTE_EDITOR_HEIGHT)
    noteEditorDraft.value = {
      draft,
      x: position.x,
      y: position.y
    }
    noteEditorComment.value = comment
    noteEditorSaving.value = false
    noteEditorError.value = null
    selectionActionMenu.value = null
  }

  function openHoverPopover(annotation: PaperAnnotation, markElement: HTMLElement): void {
    const rect = markElement.getBoundingClientRect()
    const position = computeFloatingPosition(rect, HOVER_POPOVER_WIDTH, HOVER_POPOVER_HEIGHT)
    annotationHoverPopover.value = {
      annotationId: annotation.id,
      x: position.x,
      y: position.y
    }
    if (annotation.kind === 'note') {
      hoverPopoverComment.value = annotation.comment
    } else {
      hoverPopoverComment.value = ''
    }
    hoverPopoverSaving.value = false
    hoverPopoverError.value = null
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
      cancelRebindMode()
    }

    return { success: true }
  }

  function updateComposerFromSelection(): void {
    const selectionResult = buildSelectionDraftFromCurrentSelection()
    if (!selectionResult) {
      return
    }

    clearComposer()

    if (selectionResult.targetAnnotation) {
      if (selectionResult.targetAnnotation.kind === 'note') {
        openNoteEditor(
          selectionResult.draft,
          selectionResult.rect,
          selectionResult.targetAnnotation.comment
        )
        return
      }

      openSelectionActionMenu(selectionResult.draft, selectionResult.rect, true)
      return
    }

    openSelectionActionMenu(selectionResult.draft, selectionResult.rect, false)
  }

  function handleOpenHighlightPalette(): void {
    if (!selectionActionMenu.value) {
      return
    }

    selectionActionMenu.value = {
      ...selectionActionMenu.value,
      showHighlightPalette: true
    }
  }

  async function handleCreateHighlight(colorKey: PaperAnnotationColorKey): Promise<void> {
    if (!selectionActionMenu.value) {
      return
    }

    const result = await persistSelectionDraft(
      selectionActionMenu.value.draft,
      'highlight',
      colorKey,
      ''
    )
    if (!result.success) {
      selectionActionMenuError.value = result.error || '创建标记失败'
      return
    }

    clearSelectionUi()
    clearNativeSelection()
  }

  function handleOpenNoteEditorFromSelection(): void {
    if (!selectionActionMenu.value) {
      return
    }

    const targetAnnotation = getAnnotationById(selectionActionMenu.value.draft.annotationId || null)
    openNoteEditorAtPosition(
      selectionActionMenu.value.draft,
      selectionActionMenu.value.x,
      selectionActionMenu.value.y,
      targetAnnotation?.comment || ''
    )
  }

  async function handleSaveNote(): Promise<void> {
    if (!noteEditorDraft.value) {
      return
    }

    noteEditorSaving.value = true
    noteEditorError.value = null
    const result = await persistSelectionDraft(
      noteEditorDraft.value.draft,
      'note',
      PAPER_ANNOTATION_NOTE_COLOR_KEY,
      noteEditorComment.value
    )

    if (!result.success) {
      noteEditorSaving.value = false
      noteEditorError.value = result.error || '保存笔记失败'
      return
    }

    noteEditorSaving.value = false
    clearSelectionUi()
    clearNativeSelection()
  }

  function handleCancelNoteEditor(): void {
    clearSelectionUi()
    clearNativeSelection()
  }

  async function handleUpdateHoverColor(colorKey: PaperAnnotationColorKey): Promise<void> {
    const annotation = hoverPopoverAnnotation.value
    if (!annotation) {
      return
    }

    hoverPopoverSaving.value = true
    hoverPopoverError.value = null
    const result = await options.updateAnnotation({
      paperId: options.paperId(),
      annotationId: annotation.id,
      colorKey
    })
    hoverPopoverSaving.value = false

    if (!result.success) {
      hoverPopoverError.value = result.error || '更新标记颜色失败'
      return
    }
  }

  async function handleSaveHoverNote(): Promise<void> {
    const annotation = hoverPopoverAnnotation.value
    if (!annotation) {
      return
    }

    hoverPopoverSaving.value = true
    hoverPopoverError.value = null
    const result = await options.updateAnnotation({
      paperId: options.paperId(),
      annotationId: annotation.id,
      comment: hoverPopoverComment.value
    })
    hoverPopoverSaving.value = false

    if (!result.success) {
      hoverPopoverError.value = result.error || '更新笔记失败'
      return
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

    if (noteEditorDraft.value?.draft.annotationId === annotationId) {
      clearSelectionUi()
    }

    if (annotationHoverPopover.value?.annotationId === annotationId) {
      clearHoverPopover()
    }
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
      ignoredOutdatedAnnotationIds.value = {
        ...ignoredOutdatedAnnotationIds.value,
        [annotation.id]: true
      }
      return
    }

    hoverPopoverError.value = result.error || '更新到当前译文失败'
    startRebind(annotation)
  }

  function dismissOutdatedAnnotation(annotationId: string): void {
    ignoredOutdatedAnnotationIds.value = {
      ...ignoredOutdatedAnnotationIds.value,
      [annotationId]: true
    }
  }

  function getAnnotationTypeLabel(annotation: PaperAnnotation): string {
    if (annotation.kind === 'highlight') {
      return '标记'
    }

    return annotation.noteType === 'original_span' ? '原文笔记' : '译文笔记'
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

  function handleDocumentPointerDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }

    if (
      target.closest('.paper-annotation-selection-menu') ||
      target.closest('.paper-annotation-note-editor') ||
      target.closest('.paper-annotation-hover-popover')
    ) {
      return
    }

    clearSelectionUi()
    clearNativeSelection()

    if (!target.closest('mark.paper-annotation-highlight')) {
      clearHoverPopover()
    }
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      clearComposer()
      clearNativeSelection()
      cancelRebindMode()
    }
  }

  function handleSurfaceAnnotationClick(event: MouseEvent): void {
    if (selectionActionMenu.value || noteEditorDraft.value) {
      return
    }

    const target = event.target as HTMLElement | null
    const markElement = target?.closest<HTMLElement>('mark.paper-annotation-highlight')
    if (!markElement) {
      return
    }

    const annotation = getAnnotationById(markElement.dataset.annotationId || null)
    if (!annotation) {
      return
    }

    if (annotationHoverPopover.value?.annotationId === annotation.id) {
      clearHoverPopover()
      return
    }

    openHoverPopover(annotation, markElement)
  }

  return {
    selectionActionMenu,
    selectionActionMenuError,
    noteEditorDraft,
    noteEditorComment,
    noteEditorSaving,
    noteEditorError,
    annotationHoverPopover,
    hoverPopoverAnnotation,
    hoverPopoverComment,
    hoverPopoverSaving,
    hoverPopoverError,
    rebindAnnotationId,
    ignoredOutdatedAnnotationIds,
    highlightColorOptions: PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
    currentAnnotations,
    orphanAnnotations,
    outdatedAnnotations,
    translationMissingAnnotations,
    currentTranslationRevisionId,
    updateComposerFromSelection,
    handleOpenHighlightPalette,
    handleCreateHighlight,
    handleOpenNoteEditorFromSelection,
    handleSaveNote,
    handleCancelNoteEditor,
    handleUpdateHoverColor,
    handleSaveHoverNote,
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
    handleDocumentKeyDown,
    handleSurfaceAnnotationClick
  }
}
