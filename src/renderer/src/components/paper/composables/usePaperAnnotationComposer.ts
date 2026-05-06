import { computed, ref } from 'vue'
import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import {
  PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
  PAPER_ANNOTATION_NOTE_COLOR_KEY
} from '@shared/types/paper'
import {
  PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE,
  findPaperAnnotationNoteConflict
} from '@shared/utils/paperAnnotationConflicts'
import { createPaperAnnotationComposerActions } from './paperAnnotationComposerActions'
import { createPaperAnnotationSelectionResolver } from './paperAnnotationComposerSelection'
import type {
  AnnotationHoverPopoverState,
  NoteEditorState,
  PaperAnnotationComposer,
  PaperAnnotationComposerOptions,
  SelectionActionMenuState,
  SelectionDraft
} from './paperAnnotationComposerTypes'
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
import type { CanonicalTextClientRect } from './paperCanonicalTextIndex'

export type {
  AnnotationHoverPopoverState,
  NoteEditorState,
  PaperAnnotationComposer,
  PaperAnnotationComposerOptions,
  SelectionActionMenuState,
  SelectionDraft
} from './paperAnnotationComposerTypes'

export function usePaperAnnotationComposer(
  options: PaperAnnotationComposerOptions
): PaperAnnotationComposer {
  const selectionActionMenu = ref<SelectionActionMenuState | null>(null)
  const selectionActionMenuError = ref<string | null>(null)
  const noteEditorDraft = ref<NoteEditorState | null>(null)
  const noteEditorComment = ref('')
  const noteEditorOriginalComment = ref('')
  const noteEditorSaving = ref(false)
  const noteEditorError = ref<string | null>(null)
  const annotationHoverPopover = ref<AnnotationHoverPopoverState | null>(null)
  const hoverPopoverComment = ref('')
  const hoverPopoverSaving = ref(false)
  const hoverPopoverError = ref<string | null>(null)

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

  const hoverPopoverAnnotation = computed(() => {
    if (!annotationHoverPopover.value) {
      return null
    }

    return getAnnotationById(annotationHoverPopover.value.annotationId)
  })

  const noteEditorIsExistingNote = computed(() => noteEditorDraft.value?.intent === 'edit')

  const noteEditorCanUpdate = computed(() => {
    return (
      noteEditorIsExistingNote.value &&
      !noteEditorSaving.value &&
      noteEditorComment.value !== noteEditorOriginalComment.value
    )
  })

  function clearSelectionUi(): void {
    selectionActionMenu.value = null
    selectionActionMenuError.value = null
    noteEditorDraft.value = null
    noteEditorComment.value = ''
    noteEditorOriginalComment.value = ''
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

  function handleCancelComposer(): void {
    clearComposer()
    clearNativeSelection()
  }

  function getAnnotationById(annotationId: string | null): PaperAnnotation | null {
    if (!annotationId) {
      return null
    }

    return currentAnnotations.value.find((annotation) => annotation.id === annotationId) || null
  }

  function findNoteConflict(draft: SelectionDraft): PaperAnnotation | null {
    return (
      findPaperAnnotationNoteConflict(currentAnnotations.value, {
        kind: 'note',
        segmentStableId: draft.segmentStableId,
        originalAnchor: draft.originalAnchor,
        translationAnchor: draft.translationAnchor,
        ignoreAnnotationId: draft.annotationId
      })?.annotation || null
    )
  }

  const selectionResolver = createPaperAnnotationSelectionResolver({
    renderedSegments: options.renderedSegments,
    getSourceSegments: options.getSourceSegments
  })

  const actions = createPaperAnnotationComposerActions({
    paperId: options.paperId,
    getSourceSegments: options.getSourceSegments,
    createAnnotation: options.createAnnotation,
    deleteAnnotation: options.deleteAnnotation,
    onAddToChat: options.onAddToChat,
    currentTranslationRevisionId,
    currentTranslationModelName,
    noteEditorDraft,
    annotationHoverPopover,
    clearSelectionUi,
    clearHoverPopover
  })

  function openSelectionActionMenu(draft: SelectionDraft, rect: CanonicalTextClientRect): void {
    const position = computeFloatingPosition(rect, SELECTION_MENU_WIDTH, SELECTION_MENU_HEIGHT)
    selectionActionMenu.value = {
      draft,
      x: position.x,
      y: position.y
    }
    selectionActionMenuError.value = null
  }

  function openNoteEditorAtPosition(
    draft: SelectionDraft,
    x: number,
    y: number,
    comment: string,
    intent: NoteEditorState['intent']
  ): void {
    const position = clampFloatingPosition(x, y, NOTE_EDITOR_WIDTH, NOTE_EDITOR_HEIGHT)
    noteEditorDraft.value = {
      draft,
      intent,
      x: position.x,
      y: position.y
    }
    noteEditorComment.value = comment
    noteEditorOriginalComment.value = comment
    noteEditorSaving.value = false
    noteEditorError.value = null
    selectionActionMenu.value = null
  }

  function handleOpenNoteEditorFromHover(): void {
    const annotation = hoverPopoverAnnotation.value
    if (!annotation || !annotationHoverPopover.value) {
      return
    }

    const x = annotationHoverPopover.value.x
    const y = annotationHoverPopover.value.y
    clearHoverPopover()

    openNoteEditorAtPosition(
      selectionResolver.buildSelectionDraftFromAnnotation(annotation),
      x,
      y,
      annotation.comment,
      'edit'
    )
  }

  function openExistingNoteEditor(annotation: PaperAnnotation, x: number, y: number): void {
    const offset = 12
    clearHoverPopover()
    openNoteEditorAtPosition(
      selectionResolver.buildSelectionDraftFromAnnotation(annotation),
      x,
      y + offset,
      annotation.comment,
      'edit'
    )
  }

  function openHoverPopover(annotation: PaperAnnotation, x: number, y: number): void {
    const offset = 12
    const preferredX = x
    const preferredY = y + offset

    const position = clampFloatingPosition(
      preferredX,
      preferredY,
      HOVER_POPOVER_WIDTH,
      HOVER_POPOVER_HEIGHT
    )
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

  function updateComposerFromSelection(event?: MouseEvent): void {
    const selectionResult = selectionResolver.buildSelectionDraftFromCurrentSelection(event)
    if (!selectionResult) {
      return
    }

    clearComposer()

    openSelectionActionMenu(selectionResult.draft, selectionResult.rect)
  }

  async function handleCreateHighlight(colorKey: PaperAnnotationColorKey): Promise<void> {
    if (!selectionActionMenu.value) {
      return
    }

    const result = await actions.persistSelectionDraft(
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

    if (findNoteConflict(selectionActionMenu.value.draft)) {
      selectionActionMenuError.value = PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE
      return
    }

    const targetAnnotation = getAnnotationById(selectionActionMenu.value.draft.annotationId || null)
    openNoteEditorAtPosition(
      selectionActionMenu.value.draft,
      selectionActionMenu.value.x,
      selectionActionMenu.value.y,
      targetAnnotation?.comment || '',
      'create'
    )
  }

  function handleAddToChat(): void {
    if (!selectionActionMenu.value) {
      return
    }

    const result = actions.addSelectionDraftToChat(selectionActionMenu.value.draft)
    if (!result.success) {
      if (result.error) {
        selectionActionMenuError.value = result.error
      }
      return
    }

    clearSelectionUi()
    clearNativeSelection()
  }

  async function handleSaveNote(): Promise<void> {
    if (!noteEditorDraft.value) {
      return
    }

    if (findNoteConflict(noteEditorDraft.value.draft)) {
      noteEditorSaving.value = false
      noteEditorError.value = PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE
      return
    }

    noteEditorSaving.value = true
    noteEditorError.value = null
    const result = await actions.persistSelectionDraft(
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

  async function handleUpdateNote(): Promise<void> {
    const annotationId = noteEditorDraft.value?.draft.annotationId
    if (!annotationId || !noteEditorCanUpdate.value) {
      return
    }

    noteEditorSaving.value = true
    noteEditorError.value = null
    const result = await options.updateAnnotation({
      paperId: options.paperId(),
      annotationId,
      comment: noteEditorComment.value
    })
    noteEditorSaving.value = false

    if (!result.success) {
      noteEditorError.value = result.error || '更新笔记失败'
      return
    }

    noteEditorOriginalComment.value = noteEditorComment.value
  }

  async function handleDeleteNoteFromEditor(): Promise<void> {
    const annotationId = noteEditorDraft.value?.draft.annotationId
    if (!annotationId) {
      return
    }

    noteEditorSaving.value = true
    noteEditorError.value = null
    const result = await actions.deleteAnnotationById(annotationId)
    noteEditorSaving.value = false

    if (!result.success) {
      noteEditorError.value = result.error || '删除笔记失败'
    }
  }

  function handleCancelNoteEditor(): void {
    clearSelectionUi()
    clearNativeSelection()
  }

  function handleCloseNoteEditor(): void {
    clearSelectionUi()
    clearNativeSelection()
  }

  function handleMoveNoteEditor(delta: { x: number; y: number }): void {
    if (!noteEditorDraft.value) {
      return
    }

    const position = clampFloatingPosition(
      noteEditorDraft.value.x + delta.x,
      noteEditorDraft.value.y + delta.y,
      NOTE_EDITOR_WIDTH,
      NOTE_EDITOR_HEIGHT
    )
    noteEditorDraft.value = {
      ...noteEditorDraft.value,
      x: position.x,
      y: position.y
    }
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
    const result = await actions.deleteAnnotationById(annotationId)
    if (!result.success && annotationHoverPopover.value?.annotationId === annotationId) {
      hoverPopoverError.value = result.error || '删除标注失败'
    }
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

    if (noteEditorDraft.value) {
      selectionActionMenu.value = null
      selectionActionMenuError.value = null
      clearNativeSelection()
    } else {
      clearSelectionUi()
      clearNativeSelection()
    }

    if (!target.closest('mark.paper-annotation-highlight')) {
      clearHoverPopover()
    }
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      clearComposer()
      clearNativeSelection()
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

    if (annotation.kind === 'note') {
      openExistingNoteEditor(annotation, event.clientX, event.clientY)
      return
    }

    openHoverPopover(annotation, event.clientX, event.clientY)
  }

  return {
    selectionActionMenu,
    selectionActionMenuError,
    noteEditorDraft,
    noteEditorComment,
    noteEditorIsExistingNote,
    noteEditorCanUpdate,
    noteEditorSaving,
    noteEditorError,
    annotationHoverPopover,
    hoverPopoverAnnotation,
    hoverPopoverComment,
    hoverPopoverSaving,
    hoverPopoverError,
    highlightColorOptions: PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
    currentAnnotations,
    currentTranslationRevisionId,
    updateComposerFromSelection,
    handleCreateHighlight,
    handleOpenNoteEditorFromSelection,
    handleAddToChat,
    handleOpenNoteEditorFromHover,
    handleSaveNote,
    handleUpdateNote,
    handleDeleteNoteFromEditor,
    handleCancelNoteEditor,
    handleCloseNoteEditor,
    handleMoveNoteEditor,
    handleUpdateHoverColor,
    handleSaveHoverNote,
    handleDeleteAnnotation,
    clearComposer,
    handleCancelComposer,
    handleDocumentPointerDown,
    handleDocumentKeyDown,
    handleSurfaceAnnotationClick
  }
}
