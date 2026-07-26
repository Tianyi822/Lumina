import type { Editor } from '@tiptap/core'
import { applyAcceptedOperations, validateProposalAgainstState } from './writerSuggestionCore'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'

function refresh(editor: Editor): void {
  const tr = editor.state.tr.setMeta('writerSuggestionRefresh', true)
  editor.view.dispatch(tr)
}

/** 拒绝单条建议并刷新 decoration */
export function rejectWriterSuggestionOperation(editor: Editor, index: number): void {
  useWriterSuggestionStore.getState().rejectOperation(index)
  refresh(editor)
}

/** 接受单条建议（校验后落盘到编辑器） */
export function acceptWriterSuggestionOperation(editor: Editor, index: number): void {
  const store = useWriterSuggestionStore.getState()
  const active = store.activeProposal
  const op = active?.operations[index]
  if (!active || !op) return

  const singleProposal = { ...active, operations: [op] }
  const validation = validateProposalAgainstState(singleProposal, editor.state)
  if (!validation.valid) {
    store.invalidate(validation.reason)
    refresh(editor)
    return
  }

  const tr = applyAcceptedOperations(editor.state, [op])
  tr.setMeta('writerSuggestionRefresh', true)
  editor.view.dispatch(tr)
  store.acceptOperation(index)
  refresh(editor)
}

/** 拒绝全部待确认建议 */
export function rejectAllWriterSuggestions(editor: Editor): void {
  useWriterSuggestionStore.getState().rejectAll()
  refresh(editor)
}

/**
 * 全部接受：构造单个 Transaction，并带 writerSuggestionAccept meta。
 * 接受前校验；失败则 invalidate。
 */
export function acceptAllWriterSuggestions(editor: Editor): void {
  const store = useWriterSuggestionStore.getState()
  const active = store.activeProposal
  if (!active || store.pendingOperationIndexes.length === 0) return

  const operations = store.pendingOperationIndexes
    .map((index) => active.operations[index])
    .filter((op): op is NonNullable<typeof op> => Boolean(op))

  const validation = validateProposalAgainstState(active, editor.state)
  if (!validation.valid) {
    store.invalidate(validation.reason)
    refresh(editor)
    return
  }

  const tr = applyAcceptedOperations(editor.state, operations)
  tr.setMeta('writerSuggestionAccept', active.proposalId)
  editor.view.dispatch(tr)
  store.acceptAll()
}
