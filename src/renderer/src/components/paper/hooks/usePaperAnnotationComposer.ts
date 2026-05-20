import { useCallback, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import {
  PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
  PAPER_ANNOTATION_NOTE_COLOR_KEY
} from '@shared/types/paper'
import {
  PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE,
  findPaperAnnotationNoteConflict
} from '@shared/utils/paperAnnotationConflicts'
import { createPaperAnnotationComposerActions } from '../composables/paperAnnotationComposerActions'
import { createPaperAnnotationSelectionResolver } from '../composables/paperAnnotationComposerSelection'
import type {
  AnnotationHoverPopoverState,
  ComputedRef,
  NoteEditorState,
  PaperAnnotationComposerOptions,
  Ref,
  SelectionActionMenuState,
  SelectionDraft
} from '../composables/paperAnnotationComposerTypes'
import {
  clampFloatingPosition,
  computeFloatingPosition,
  HOVER_POPOVER_HEIGHT,
  HOVER_POPOVER_WIDTH,
  NOTE_EDITOR_HEIGHT,
  NOTE_EDITOR_WIDTH,
  SELECTION_MENU_HEIGHT,
  SELECTION_MENU_WIDTH
} from '../composables/paperAnnotationFloating'
import type { CanonicalTextClientRect } from '../composables/paperCanonicalTextIndex'

export interface PaperAnnotationComposerState {
  selectionActionMenu: SelectionActionMenuState | null
  selectionActionMenuError: string | null
  noteEditorDraft: NoteEditorState | null
  noteEditorComment: string
  noteEditorIsExistingNote: boolean
  noteEditorCanUpdate: boolean
  noteEditorSaving: boolean
  noteEditorError: string | null
  annotationHoverPopover: AnnotationHoverPopoverState | null
  hoverPopoverAnnotation: PaperAnnotation | null
  hoverPopoverError: string | null
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  updateComposerFromSelection: (event?: MouseEvent) => void
  handleCreateHighlight: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleOpenNoteEditorFromSelection: () => void
  handleAddToChat: () => void
  handleOpenNoteEditorFromHover: () => void
  handleSaveNote: () => Promise<void>
  handleUpdateNote: () => Promise<void>
  handleDeleteNoteFromEditor: () => Promise<void>
  handleCloseNoteEditor: () => void
  handleMoveNoteEditor: (delta: { x: number; y: number }) => void
  handleUpdateHoverColor: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleDeleteAnnotation: (annotationId: string) => Promise<void>
  clearComposer: () => void
  handleCancelComposer: () => void
  handleDocumentPointerDown: (event: MouseEvent) => void
  handleDocumentKeyDown: (event: KeyboardEvent) => void
  handleSurfaceAnnotationClick: (event: MouseEvent) => void
  setNoteEditorComment: (value: string) => void
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}

function createReadonlyRef<T>(getValue: () => T): ComputedRef<T> {
  return {
    get value() {
      return getValue()
    }
  } as ComputedRef<T>
}

function createWritableRef<T>(getValue: () => T, setValue: (value: T) => void): Ref<T> {
  return {
    get value() {
      return getValue()
    },
    set value(nextValue: T) {
      setValue(nextValue)
    }
  } as Ref<T>
}

export function usePaperAnnotationComposer(
  options: PaperAnnotationComposerOptions
): PaperAnnotationComposerState {
  const optionsRef = useLatestRef(options)

  const [selectionActionMenu, setSelectionActionMenu] = useState<SelectionActionMenuState | null>(
    null
  )
  const [selectionActionMenuError, setSelectionActionMenuError] = useState<string | null>(null)
  const [noteEditorDraft, setNoteEditorDraft] = useState<NoteEditorState | null>(null)
  const [noteEditorComment, setNoteEditorComment] = useState('')
  const [noteEditorOriginalComment, setNoteEditorOriginalComment] = useState('')
  const [noteEditorSaving, setNoteEditorSaving] = useState(false)
  const [noteEditorError, setNoteEditorError] = useState<string | null>(null)
  const [annotationHoverPopover, setAnnotationHoverPopover] =
    useState<AnnotationHoverPopoverState | null>(null)
  const [hoverPopoverError, setHoverPopoverError] = useState<string | null>(null)

  const selectionActionMenuRef = useLatestRef(selectionActionMenu)
  const noteEditorDraftRef = useLatestRef(noteEditorDraft)
  const noteEditorCommentRef = useLatestRef(noteEditorComment)
  const noteEditorOriginalCommentRef = useLatestRef(noteEditorOriginalComment)
  const annotationHoverPopoverRef = useLatestRef(annotationHoverPopover)

  const currentAnnotations = options.annotations() ?? []

  const hoverPopoverAnnotation = useMemo(() => {
    if (!annotationHoverPopover) {
      return null
    }

    return (
      currentAnnotations.find(
        (annotation) => annotation.id === annotationHoverPopover.annotationId
      ) || null
    )
  }, [annotationHoverPopover, currentAnnotations])

  const noteEditorIsExistingNote = noteEditorDraft?.intent === 'edit'
  const noteEditorCanUpdate =
    noteEditorIsExistingNote && !noteEditorSaving && noteEditorComment !== noteEditorOriginalComment

  const currentTranslationRevisionId = useMemo(
    () =>
      createReadonlyRef(() => {
        const cache = optionsRef.current.translationCache()
        if (!cache) {
          return null
        }

        return cache.translationRevisionId || `${cache.sourceHash}:${cache.updatedAt}`
      }),
    [optionsRef]
  )

  const currentTranslationModelName = useMemo(
    () => createReadonlyRef(() => optionsRef.current.translationCache()?.modelName),
    [optionsRef]
  )

  const renderedSegmentsRef = useMemo(
    () =>
      createReadonlyRef(
        () => optionsRef.current.renderedSegments.value
      ) as PaperAnnotationComposerOptions['renderedSegments'],
    [optionsRef]
  )

  const noteEditorDraftBridge = useMemo(
    () => createWritableRef(() => noteEditorDraftRef.current, setNoteEditorDraft),
    [noteEditorDraftRef]
  )

  const annotationHoverPopoverBridge = useMemo(
    () => createWritableRef(() => annotationHoverPopoverRef.current, setAnnotationHoverPopover),
    [annotationHoverPopoverRef]
  )

  const selectionResolver = useMemo(
    () =>
      createPaperAnnotationSelectionResolver({
        renderedSegments: renderedSegmentsRef,
        getSourceSegments: () => optionsRef.current.getSourceSegments()
      }),
    [optionsRef, renderedSegmentsRef]
  )

  const getAnnotationById = useCallback(
    (annotationId: string | null): PaperAnnotation | null => {
      if (!annotationId) {
        return null
      }

      return (
        (optionsRef.current.annotations() ?? []).find(
          (annotation) => annotation.id === annotationId
        ) || null
      )
    },
    [optionsRef]
  )

  const clearSelectionUi = useCallback((): void => {
    setSelectionActionMenu(null)
    setSelectionActionMenuError(null)
    setNoteEditorDraft(null)
    setNoteEditorComment('')
    setNoteEditorOriginalComment('')
    setNoteEditorSaving(false)
    setNoteEditorError(null)
  }, [])

  const clearHoverPopover = useCallback((): void => {
    setAnnotationHoverPopover(null)
    setHoverPopoverError(null)
  }, [])

  const clearComposer = useCallback((): void => {
    clearSelectionUi()
    clearHoverPopover()
  }, [clearHoverPopover, clearSelectionUi])

  const clearNativeSelection = useCallback((): void => {
    window.getSelection()?.removeAllRanges()
  }, [])

  const handleCancelComposer = useCallback((): void => {
    clearComposer()
    clearNativeSelection()
  }, [clearComposer, clearNativeSelection])

  const actions = useMemo(
    () =>
      createPaperAnnotationComposerActions({
        paperId: () => optionsRef.current.paperId(),
        getSourceSegments: () => optionsRef.current.getSourceSegments(),
        createAnnotation: (params) => optionsRef.current.createAnnotation(params),
        deleteAnnotation: (paperId, annotationId) =>
          optionsRef.current.deleteAnnotation(paperId, annotationId),
        onAddToChat: (quote) => optionsRef.current.onAddToChat?.(quote),
        currentTranslationRevisionId,
        currentTranslationModelName,
        noteEditorDraft: noteEditorDraftBridge,
        annotationHoverPopover: annotationHoverPopoverBridge,
        clearSelectionUi,
        clearHoverPopover
      }),
    [
      annotationHoverPopoverBridge,
      clearHoverPopover,
      clearSelectionUi,
      currentTranslationModelName,
      currentTranslationRevisionId,
      noteEditorDraftBridge,
      optionsRef
    ]
  )

  const findNoteConflict = useCallback(
    (draft: SelectionDraft): PaperAnnotation | null =>
      findPaperAnnotationNoteConflict(optionsRef.current.annotations() ?? [], {
        kind: 'note',
        segmentStableId: draft.segmentStableId,
        originalAnchor: draft.originalAnchor,
        translationAnchor: draft.translationAnchor,
        ignoreAnnotationId: draft.annotationId
      })?.annotation || null,
    [optionsRef]
  )

  const openSelectionActionMenu = useCallback(
    (draft: SelectionDraft, rect: CanonicalTextClientRect): void => {
      const position = computeFloatingPosition(rect, SELECTION_MENU_WIDTH, SELECTION_MENU_HEIGHT)
      setSelectionActionMenu({
        draft,
        x: position.x,
        y: position.y
      })
      setSelectionActionMenuError(null)
    },
    []
  )

  const openNoteEditorAtPosition = useCallback(
    (
      draft: SelectionDraft,
      x: number,
      y: number,
      comment: string,
      intent: NoteEditorState['intent']
    ): void => {
      const position = clampFloatingPosition(x, y, NOTE_EDITOR_WIDTH, NOTE_EDITOR_HEIGHT)
      setNoteEditorDraft({
        draft,
        intent,
        x: position.x,
        y: position.y
      })
      setNoteEditorComment(comment)
      setNoteEditorOriginalComment(comment)
      setNoteEditorSaving(false)
      setNoteEditorError(null)
      setSelectionActionMenu(null)
    },
    []
  )

  const handleOpenNoteEditorFromHover = useCallback((): void => {
    const annotation = getAnnotationById(annotationHoverPopoverRef.current?.annotationId || null)
    const hoverState = annotationHoverPopoverRef.current
    if (!annotation || !hoverState) {
      return
    }

    clearHoverPopover()
    openNoteEditorAtPosition(
      selectionResolver.buildSelectionDraftFromAnnotation(annotation),
      hoverState.x,
      hoverState.y,
      annotation.comment,
      'edit'
    )
  }, [
    annotationHoverPopoverRef,
    clearHoverPopover,
    getAnnotationById,
    openNoteEditorAtPosition,
    selectionResolver
  ])

  const updateComposerFromSelection = useCallback(
    (event?: MouseEvent): void => {
      const selectionResult = selectionResolver.buildSelectionDraftFromCurrentSelection(event)
      if (!selectionResult) {
        return
      }

      clearComposer()
      openSelectionActionMenu(selectionResult.draft, selectionResult.rect)
    },
    [clearComposer, openSelectionActionMenu, selectionResolver]
  )

  const handleCreateHighlight = useCallback(
    async (colorKey: PaperAnnotationColorKey): Promise<void> => {
      const menu = selectionActionMenuRef.current
      if (!menu) {
        return
      }

      const result = await actions.persistSelectionDraft(menu.draft, 'highlight', colorKey, '')
      if (!result.success) {
        setSelectionActionMenuError(result.error || '创建标记失败')
        return
      }

      clearSelectionUi()
      clearNativeSelection()
    },
    [actions, clearNativeSelection, clearSelectionUi, selectionActionMenuRef]
  )

  const handleOpenNoteEditorFromSelection = useCallback((): void => {
    const menu = selectionActionMenuRef.current
    if (!menu) {
      return
    }

    if (findNoteConflict(menu.draft)) {
      setSelectionActionMenuError(PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE)
      return
    }

    const targetAnnotation = getAnnotationById(menu.draft.annotationId || null)
    openNoteEditorAtPosition(menu.draft, menu.x, menu.y, targetAnnotation?.comment || '', 'create')
  }, [findNoteConflict, getAnnotationById, openNoteEditorAtPosition, selectionActionMenuRef])

  const handleAddToChat = useCallback((): void => {
    const menu = selectionActionMenuRef.current
    if (!menu) {
      return
    }

    const result = actions.addSelectionDraftToChat(menu.draft)
    if (!result.success) {
      if (result.error) {
        setSelectionActionMenuError(result.error)
      }
      return
    }

    clearSelectionUi()
    clearNativeSelection()
  }, [actions, clearNativeSelection, clearSelectionUi, selectionActionMenuRef])

  const handleSaveNote = useCallback(async (): Promise<void> => {
    const draft = noteEditorDraftRef.current
    if (!draft) {
      return
    }

    if (findNoteConflict(draft.draft)) {
      setNoteEditorSaving(false)
      setNoteEditorError(PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE)
      return
    }

    setNoteEditorSaving(true)
    setNoteEditorError(null)
    const result = await actions.persistSelectionDraft(
      draft.draft,
      'note',
      PAPER_ANNOTATION_NOTE_COLOR_KEY,
      noteEditorCommentRef.current
    )

    if (!result.success) {
      setNoteEditorSaving(false)
      setNoteEditorError(result.error || '保存笔记失败')
      return
    }

    setNoteEditorSaving(false)
    clearSelectionUi()
    clearNativeSelection()
  }, [
    actions,
    clearNativeSelection,
    clearSelectionUi,
    findNoteConflict,
    noteEditorCommentRef,
    noteEditorDraftRef
  ])

  const handleUpdateNote = useCallback(async (): Promise<void> => {
    const annotationId = noteEditorDraftRef.current?.draft.annotationId
    const canUpdate =
      noteEditorDraftRef.current?.intent === 'edit' &&
      !noteEditorSaving &&
      noteEditorCommentRef.current !== noteEditorOriginalCommentRef.current
    if (!annotationId || !canUpdate) {
      return
    }

    setNoteEditorSaving(true)
    setNoteEditorError(null)
    const result = await optionsRef.current.updateAnnotation({
      paperId: optionsRef.current.paperId(),
      annotationId,
      comment: noteEditorCommentRef.current
    })
    setNoteEditorSaving(false)

    if (!result.success) {
      setNoteEditorError(result.error || '更新笔记失败')
      return
    }

    setNoteEditorOriginalComment(noteEditorCommentRef.current)
  }, [
    noteEditorCommentRef,
    noteEditorDraftRef,
    noteEditorOriginalCommentRef,
    noteEditorSaving,
    optionsRef
  ])

  const handleDeleteNoteFromEditor = useCallback(async (): Promise<void> => {
    const annotationId = noteEditorDraftRef.current?.draft.annotationId
    if (!annotationId) {
      return
    }

    setNoteEditorSaving(true)
    setNoteEditorError(null)
    const result = await actions.deleteAnnotationById(annotationId)
    setNoteEditorSaving(false)

    if (!result.success) {
      setNoteEditorError(result.error || '删除笔记失败')
    }
  }, [actions, noteEditorDraftRef])

  const handleCloseNoteEditor = useCallback((): void => {
    clearSelectionUi()
    clearNativeSelection()
  }, [clearNativeSelection, clearSelectionUi])

  const handleMoveNoteEditor = useCallback(
    (delta: { x: number; y: number }): void => {
      const draft = noteEditorDraftRef.current
      if (!draft) {
        return
      }

      const position = clampFloatingPosition(
        draft.x + delta.x,
        draft.y + delta.y,
        NOTE_EDITOR_WIDTH,
        NOTE_EDITOR_HEIGHT
      )
      setNoteEditorDraft({
        ...draft,
        x: position.x,
        y: position.y
      })
    },
    [noteEditorDraftRef]
  )

  const handleUpdateHoverColor = useCallback(
    async (colorKey: PaperAnnotationColorKey): Promise<void> => {
      const annotation = getAnnotationById(annotationHoverPopoverRef.current?.annotationId || null)
      if (!annotation) {
        return
      }

      setHoverPopoverError(null)
      const result = await optionsRef.current.updateAnnotation({
        paperId: optionsRef.current.paperId(),
        annotationId: annotation.id,
        colorKey
      })

      if (!result.success) {
        setHoverPopoverError(result.error || '更新标记颜色失败')
      }
    },
    [annotationHoverPopoverRef, getAnnotationById, optionsRef]
  )

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string): Promise<void> => {
      const result = await actions.deleteAnnotationById(annotationId)
      if (!result.success && annotationHoverPopoverRef.current?.annotationId === annotationId) {
        setHoverPopoverError(result.error || '删除标注失败')
      }
    },
    [actions, annotationHoverPopoverRef]
  )

  const handleDocumentPointerDown = useCallback(
    (event: MouseEvent): void => {
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

      if (noteEditorDraftRef.current) {
        setSelectionActionMenu(null)
        setSelectionActionMenuError(null)
        clearNativeSelection()
      } else {
        clearSelectionUi()
        clearNativeSelection()
      }

      if (!target.closest('mark.paper-annotation-highlight')) {
        clearHoverPopover()
      }
    },
    [clearHoverPopover, clearNativeSelection, clearSelectionUi, noteEditorDraftRef]
  )

  const handleDocumentKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        clearComposer()
        clearNativeSelection()
      }
    },
    [clearComposer, clearNativeSelection]
  )

  const handleSurfaceAnnotationClick = useCallback(
    (event: MouseEvent): void => {
      if (selectionActionMenuRef.current || noteEditorDraftRef.current) {
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

      if (annotationHoverPopoverRef.current?.annotationId === annotation.id) {
        clearHoverPopover()
        return
      }

      if (annotation.kind === 'note') {
        const offset = 12
        clearHoverPopover()
        openNoteEditorAtPosition(
          selectionResolver.buildSelectionDraftFromAnnotation(annotation),
          event.clientX,
          event.clientY + offset,
          annotation.comment,
          'edit'
        )
        return
      }

      const offset = 12
      const position = clampFloatingPosition(
        event.clientX,
        event.clientY + offset,
        HOVER_POPOVER_WIDTH,
        HOVER_POPOVER_HEIGHT
      )
      setAnnotationHoverPopover({
        annotationId: annotation.id,
        x: position.x,
        y: position.y
      })
      setHoverPopoverError(null)
    },
    [
      annotationHoverPopoverRef,
      clearHoverPopover,
      getAnnotationById,
      noteEditorDraftRef,
      openNoteEditorAtPosition,
      selectionActionMenuRef,
      selectionResolver
    ]
  )

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
    hoverPopoverError,
    highlightColorOptions: PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
    updateComposerFromSelection,
    handleCreateHighlight,
    handleOpenNoteEditorFromSelection,
    handleAddToChat,
    handleOpenNoteEditorFromHover,
    handleSaveNote,
    handleUpdateNote,
    handleDeleteNoteFromEditor,
    handleCloseNoteEditor,
    handleMoveNoteEditor,
    handleUpdateHoverColor,
    handleDeleteAnnotation,
    clearComposer,
    handleCancelComposer,
    handleDocumentPointerDown,
    handleDocumentKeyDown,
    handleSurfaceAnnotationClick,
    setNoteEditorComment
  }
}
