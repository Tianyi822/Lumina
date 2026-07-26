import { create } from 'zustand'

export type WriterSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface WriterSessionStore {
  currentDocumentId: string | null
  revision: number
  dirty: boolean
  saveStatus: WriterSaveStatus
  titleSummary: string
  error: string | null

  openDocument: (documentId: string, revision?: number, titleSummary?: string) => void
  closeDocument: () => void
  markDirty: (titleSummary?: string) => void
  markSaving: () => void
  applySaveResult: (revision: number) => void
  handleSaveFailure: (error?: string) => void
  handleRevisionConflict: () => void
}

const initialState = {
  currentDocumentId: null,
  revision: 0,
  dirty: false,
  saveStatus: 'idle' as const,
  titleSummary: '',
  error: null
}

/** 编辑会话只保存元数据，正文唯一权威始终由 Tiptap EditorState 持有。 */
export const useWriterSessionStore = create<WriterSessionStore>((set) => ({
  ...initialState,

  openDocument: (currentDocumentId, revision = 0, titleSummary = '') =>
    set({
      currentDocumentId,
      revision,
      dirty: false,
      saveStatus: 'idle',
      titleSummary,
      error: null
    }),
  closeDocument: () => set(initialState),
  markDirty: (titleSummary) =>
    set((state) => ({
      dirty: true,
      saveStatus: state.saveStatus === 'conflict' ? 'conflict' : 'dirty',
      titleSummary: titleSummary ?? state.titleSummary,
      error: state.saveStatus === 'conflict' ? state.error : null
    })),
  markSaving: () =>
    set((state) => ({
      saveStatus: state.saveStatus === 'conflict' ? 'conflict' : 'saving',
      error: state.saveStatus === 'conflict' ? state.error : null
    })),
  applySaveResult: (revision) =>
    set({
      revision,
      dirty: false,
      saveStatus: 'saved',
      error: null
    }),
  handleSaveFailure: (error = '保存失败') =>
    set({
      dirty: true,
      saveStatus: 'error',
      error
    }),
  handleRevisionConflict: () =>
    set({
      dirty: true,
      saveStatus: 'conflict',
      error: '文档已在其他位置更新，请重新加载'
    })
}))
