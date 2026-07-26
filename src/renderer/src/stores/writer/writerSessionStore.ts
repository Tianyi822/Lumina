import { create } from 'zustand'

export type WriterSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface WriterSessionStore {
  currentDocumentId: string | null
  revision: number
  dirty: boolean
  saveStatus: WriterSaveStatus
  editVersion: number
  titleSummary: string
  error: string | null

  openDocument: (documentId: string, revision?: number, titleSummary?: string) => void
  closeDocument: () => void
  markDirty: (titleSummary?: string) => number
  markSaving: () => void
  applySaveResult: (revision: number, savedEditVersion?: number) => void
  syncRevision: (revision: number) => void
  handleSaveFailure: (error?: string) => void
  handleRevisionConflict: () => void
}

const initialState = {
  currentDocumentId: null,
  revision: 0,
  dirty: false,
  saveStatus: 'idle' as const,
  editVersion: 0,
  titleSummary: '',
  error: null
}

/** 编辑会话只保存元数据，正文唯一权威始终由 Tiptap EditorState 持有。 */
export const useWriterSessionStore = create<WriterSessionStore>((set, get) => ({
  ...initialState,

  openDocument: (currentDocumentId, revision = 0, titleSummary = '') =>
    set({
      currentDocumentId,
      revision,
      dirty: false,
      saveStatus: 'idle',
      editVersion: 0,
      titleSummary,
      error: null
    }),
  closeDocument: () => set(initialState),
  markDirty: (titleSummary) => {
    const editVersion = get().editVersion + 1
    set((state) => ({
      dirty: true,
      saveStatus: state.saveStatus === 'conflict' ? 'conflict' : 'dirty',
      editVersion,
      titleSummary: titleSummary ?? state.titleSummary,
      error: state.saveStatus === 'conflict' ? state.error : null
    }))
    return editVersion
  },
  markSaving: () =>
    set((state) => ({
      saveStatus: state.saveStatus === 'conflict' ? 'conflict' : 'saving',
      error: state.saveStatus === 'conflict' ? state.error : null
    })),
  applySaveResult: (revision, savedEditVersion = get().editVersion) =>
    set((state) => {
      const isLatestEdit = savedEditVersion === state.editVersion && state.saveStatus !== 'conflict'
      return {
        revision: Math.max(state.revision, revision),
        dirty: isLatestEdit ? false : state.dirty,
        saveStatus: isLatestEdit
          ? 'saved'
          : state.saveStatus === 'saving'
            ? 'dirty'
            : state.saveStatus,
        error: isLatestEdit ? null : state.error
      }
    }),
  syncRevision: (revision) =>
    set((state) => ({
      revision: Math.max(state.revision, revision)
    })),
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
