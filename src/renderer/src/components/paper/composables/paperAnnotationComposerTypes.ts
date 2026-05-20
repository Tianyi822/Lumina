import type { PaperQuote, PaperQuoteSurroundingContext } from '@shared/types/chat'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationTextAnchor,
  PaperReaderSegmentSourceRefs,
  PaperTranslationCache,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'
import type { RenderedSegment } from '../hooks/usePaperMarkdownEngine'

export interface Ref<T> {
  value: T
}

export interface ComputedRef<T> {
  readonly value: T
}

export interface SelectionDraft {
  mode: 'create'
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
  quoteContext?: PaperQuoteSurroundingContext
  originalAnchor?: PaperAnnotationTextAnchor
  translationAnchor?: PaperAnnotationTextAnchor
}

export interface SelectionActionMenuState {
  draft: SelectionDraft
  x: number
  y: number
}

export interface NoteEditorState {
  draft: SelectionDraft
  intent: 'create' | 'edit'
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
  renderedSegments: ComputedRef<RenderedSegment[]>
  getSourceSegments: () => RenderSourceSegment[]
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  updateAnnotation: (
    params: UpdatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
  onAddToChat?: (quote: PaperQuote) => void
}

export interface PaperAnnotationComposer {
  selectionActionMenu: Ref<SelectionActionMenuState | null>
  selectionActionMenuError: Ref<string | null>
  noteEditorDraft: Ref<NoteEditorState | null>
  noteEditorComment: Ref<string>
  noteEditorIsExistingNote: ComputedRef<boolean>
  noteEditorCanUpdate: ComputedRef<boolean>
  noteEditorSaving: Ref<boolean>
  noteEditorError: Ref<string | null>
  annotationHoverPopover: Ref<AnnotationHoverPopoverState | null>
  hoverPopoverAnnotation: ComputedRef<PaperAnnotation | null>
  hoverPopoverComment: Ref<string>
  hoverPopoverSaving: Ref<boolean>
  hoverPopoverError: Ref<string | null>
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  currentAnnotations: ComputedRef<PaperAnnotation[]>
  currentTranslationRevisionId: ComputedRef<string | null>
  updateComposerFromSelection: (event?: MouseEvent) => void
  handleCreateHighlight: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleOpenNoteEditorFromSelection: () => void
  handleAddToChat: () => void
  handleOpenNoteEditorFromHover: () => void
  handleSaveNote: () => Promise<void>
  handleUpdateNote: () => Promise<void>
  handleDeleteNoteFromEditor: () => Promise<void>
  handleCancelNoteEditor: () => void
  handleCloseNoteEditor: () => void
  handleMoveNoteEditor: (delta: { x: number; y: number }) => void
  handleUpdateHoverColor: (colorKey: PaperAnnotationColorKey) => Promise<void>
  handleSaveHoverNote: () => Promise<void>
  handleDeleteAnnotation: (annotationId: string) => Promise<void>
  clearComposer: () => void
  handleCancelComposer: () => void
  handleDocumentPointerDown: (event: MouseEvent) => void
  handleDocumentKeyDown: (event: KeyboardEvent) => void
  handleSurfaceAnnotationClick: (event: MouseEvent) => void
}
