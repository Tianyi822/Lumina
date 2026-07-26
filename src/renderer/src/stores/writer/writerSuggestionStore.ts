import { create } from 'zustand'
import type { EditorState } from '@tiptap/pm/state'
import type { WriterAiProposal } from '@shared/types/writer'
import { writerAiProposalSchema } from '@shared/schemas/writerSchema'
import { validateProposalAgainstState } from '@renderer/components/writer/suggestions/writerSuggestionCore'
import type { WriterSuggestionPendingAction } from '@renderer/components/writer/suggestions/writerSuggestionLabels'

export type WriterSuggestionStatus = 'idle' | 'pending' | 'active' | 'invalid'

export interface WriterSuggestionPendingRequest {
  documentId: string
  baseRevision: number
}

export interface WriterSuggestionStore {
  status: WriterSuggestionStatus
  activeProposal: WriterAiProposal | null
  pendingRequest: WriterSuggestionPendingRequest | null
  pendingAction: WriterSuggestionPendingAction | null
  pendingAnchorPos: number | null
  pendingOperationIndexes: number[]
  acceptedOperationIndexes: number[]
  invalidReason: string | null

  reset: () => void
  beginRequest: (
    documentId: string,
    baseRevision: number,
    pendingAction?: WriterSuggestionPendingAction | null,
    anchorPos?: number
  ) => void
  ingestProposal: (
    proposal: unknown,
    currentDocumentId: string,
    currentRevision: number,
    state: EditorState
  ) => boolean
  acceptOperation: (index: number) => void
  rejectOperation: (index: number) => void
  acceptAll: () => void
  rejectAll: () => void
  invalidate: (reason: string) => void
  cancelForDocumentSwitch: () => void
}

const initialState = {
  status: 'idle' as const,
  activeProposal: null as WriterAiProposal | null,
  pendingRequest: null as WriterSuggestionPendingRequest | null,
  pendingAction: null as WriterSuggestionPendingAction | null,
  pendingAnchorPos: null as number | null,
  pendingOperationIndexes: [] as number[],
  acceptedOperationIndexes: [] as number[],
  invalidReason: null as string | null
}

/**
 * 写作 AI 建议 Store：仅持有未接受建议元数据；正文权威仍在 EditorState。
 */
export const useWriterSuggestionStore = create<WriterSuggestionStore>((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  beginRequest: (documentId, baseRevision, pendingAction = null, anchorPos) =>
    set({
      status: 'pending',
      pendingRequest: { documentId, baseRevision },
      pendingAction,
      pendingAnchorPos: anchorPos ?? null,
      activeProposal: null,
      pendingOperationIndexes: [],
      acceptedOperationIndexes: [],
      invalidReason: null
    }),

  ingestProposal: (proposal, currentDocumentId, currentRevision, state) => {
    const pending = get().pendingRequest
    const parsed = writerAiProposalSchema.safeParse(proposal)
    if (!parsed.success) {
      set({
        status: 'invalid',
        activeProposal: null,
        pendingOperationIndexes: [],
        acceptedOperationIndexes: [],
        invalidReason: 'invalid_structure'
      })
      return false
    }

    const data = parsed.data
    if (data.documentId !== currentDocumentId) {
      set({
        status: 'invalid',
        activeProposal: null,
        pendingOperationIndexes: [],
        acceptedOperationIndexes: [],
        invalidReason: 'document_mismatch'
      })
      return false
    }

    // baseRevision 只校验会话谱系（与 pending 请求对齐）；不要求等于当前本地 revision
    void currentRevision
    if (
      !pending ||
      pending.documentId !== data.documentId ||
      pending.baseRevision !== data.baseRevision
    ) {
      set({
        status: 'invalid',
        activeProposal: null,
        pendingOperationIndexes: [],
        acceptedOperationIndexes: [],
        invalidReason: 'session_stale'
      })
      return false
    }

    const validation = validateProposalAgainstState(data, state, {
      documentId: currentDocumentId
    })
    if (!validation.valid) {
      set({
        status: 'invalid',
        activeProposal: null,
        pendingOperationIndexes: [],
        acceptedOperationIndexes: [],
        invalidReason: validation.reason
      })
      return false
    }

    set({
      status: 'active',
      activeProposal: data,
      pendingRequest: null,
      pendingAction: null,
      pendingAnchorPos: null,
      pendingOperationIndexes: data.operations.map((_, index) => index),
      acceptedOperationIndexes: [],
      invalidReason: null
    })
    return true
  },

  acceptOperation: (index) =>
    set((state) => {
      if (!state.activeProposal) return state
      if (!state.pendingOperationIndexes.includes(index)) return state
      const pendingOperationIndexes = state.pendingOperationIndexes.filter((i) => i !== index)
      const acceptedOperationIndexes = [...state.acceptedOperationIndexes, index]
      if (pendingOperationIndexes.length === 0) {
        return {
          ...initialState
        }
      }
      return {
        pendingOperationIndexes,
        acceptedOperationIndexes
      }
    }),

  rejectOperation: (index) =>
    set((state) => {
      if (!state.activeProposal) return state
      const pendingOperationIndexes = state.pendingOperationIndexes.filter((i) => i !== index)
      if (pendingOperationIndexes.length === 0) {
        return { ...initialState }
      }
      return { pendingOperationIndexes }
    }),

  acceptAll: () => set(initialState),

  rejectAll: () => set(initialState),

  invalidate: (reason) =>
    set({
      status: 'invalid',
      activeProposal: null,
      pendingOperationIndexes: [],
      acceptedOperationIndexes: [],
      invalidReason: reason,
      pendingAction: null,
      pendingAnchorPos: null,
      pendingRequest: get().pendingRequest
    }),

  cancelForDocumentSwitch: () => set(initialState)
}))
