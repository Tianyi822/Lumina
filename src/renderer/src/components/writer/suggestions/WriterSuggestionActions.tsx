import { useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import {
  applyAcceptedOperations,
  findBlockByNodeId,
  validateProposalAgainstState
} from './writerSuggestionCore'
import { refreshWriterSuggestionDecorations } from './writerSuggestionPlugin'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'
import styles from './WriterSuggestionActions.module.css'

interface WriterSuggestionActionsProps {
  editor: Editor
}

/**
 * AI 建议操作条：逐项/全部接受或拒绝。
 * 全部接受构造单个 Transaction 并带 writerSuggestionAccept meta。
 */
export default function WriterSuggestionActions({ editor }: WriterSuggestionActionsProps) {
  const status = useWriterSuggestionStore((s) => s.status)
  const proposal = useWriterSuggestionStore((s) => s.activeProposal)
  const pending = useWriterSuggestionStore((s) => s.pendingOperationIndexes)
  const invalidReason = useWriterSuggestionStore((s) => s.invalidReason)

  const refresh = useCallback(() => {
    refreshWriterSuggestionDecorations((tr) => editor.view.dispatch(tr), editor.state)
  }, [editor])

  const handleRejectAll = useCallback(() => {
    useWriterSuggestionStore.getState().rejectAll()
    refresh()
  }, [refresh])

  const handleAcceptAll = useCallback(() => {
    const store = useWriterSuggestionStore.getState()
    const active = store.activeProposal
    if (!active || store.pendingOperationIndexes.length === 0) return

    const operations = store.pendingOperationIndexes
      .map((index) => active.operations[index])
      .filter((op): op is NonNullable<typeof op> => Boolean(op))

    const validation = validateProposalAgainstState(active, editor.state)
    if (!validation.valid) {
      store.invalidate(validation.reason)
      refresh()
      return
    }

    const tr = applyAcceptedOperations(editor.state, operations)
    tr.setMeta('writerSuggestionAccept', active.proposalId)
    editor.view.dispatch(tr)
    store.acceptAll()
  }, [editor, refresh])

  const handleRejectOne = useCallback(
    (index: number) => {
      useWriterSuggestionStore.getState().rejectOperation(index)
      refresh()
    },
    [refresh]
  )

  const handleAcceptOne = useCallback(
    (index: number) => {
      const store = useWriterSuggestionStore.getState()
      const active = store.activeProposal
      const op = active?.operations[index]
      if (!active || !op) return

      const singleProposal = { ...active, operations: [op] }
      const validation = validateProposalAgainstState(singleProposal, editor.state)
      if (!validation.valid) {
        store.invalidate(validation.reason)
        refresh()
        return
      }

      const tr = applyAcceptedOperations(editor.state, [op])
      tr.setMeta('writerSuggestionRefresh', true)
      editor.view.dispatch(tr)
      store.acceptOperation(index)
      refresh()
    },
    [editor, refresh]
  )

  if (status === 'invalid' && invalidReason) {
    return (
      <div className={styles.bar} role="status">
        <span className={styles.reason}>
          {invalidReason === 'target_changed' ? '目标内容已变化，建议已失效' : '建议无效，请重新生成'}
        </span>
        <button type="button" className={styles.button} onClick={handleRejectAll}>
          关闭
        </button>
      </div>
    )
  }

  if (status !== 'active' || !proposal || pending.length === 0) {
    return null
  }

  return (
    <div className={styles.bar} role="region" aria-label="AI 编辑建议">
      <div className={styles.summary}>
        {pending.length} 项待确认建议
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.buttonPrimary} onClick={handleAcceptAll}>
          全部接受
        </button>
        <button type="button" className={styles.button} onClick={handleRejectAll}>
          全部拒绝
        </button>
      </div>
      <ul className={styles.list}>
        {pending.map((index) => {
          const op = proposal.operations[index]
          if (!op) return null
          const label = describeOperation(op, editor)
          return (
            <li key={`${proposal.proposalId}-${index}`} className={styles.item}>
              <span className={styles.itemLabel}>{label}</span>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  onClick={() => handleAcceptOne(index)}
                >
                  接受
                </button>
                <button type="button" className={styles.button} onClick={() => handleRejectOne(index)}>
                  拒绝
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function describeOperation(
  op: NonNullable<ReturnType<typeof useWriterSuggestionStore.getState>['activeProposal']>['operations'][number],
  editor: Editor
): string {
  switch (op.kind) {
    case 'insert_text':
      return `在块内插入「${truncate(op.text)}」`
    case 'replace_text': {
      const block = findBlockByNodeId(editor.state, op.blockId)
      const oldText = block?.text.slice(op.from, op.to) ?? ''
      return `替换「${truncate(oldText)}」→「${truncate(op.text)}」`
    }
    case 'delete_text':
      return `删除块内文本`
    case 'insert_blocks':
      return `新增 ${op.blocks.length} 个块`
    case 'replace_blocks':
      return `替换 ${op.targetBlockIds.length} 个块`
    default:
      return '编辑建议'
  }
}

function truncate(text: string, max = 24): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
