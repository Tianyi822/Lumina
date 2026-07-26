import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { WriterAiProposal, WriterEditOperation } from '@shared/types/writer'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'
import type { WriterSuggestionPendingAction } from './writerSuggestionLabels'
import { getWriterSuggestionPendingLabel } from './writerSuggestionLabels'
import { findBlockByNodeId } from './writerSuggestionCore'
import {
  createBlocksPreviewElement,
  createInlineAddElement,
  createLoadingPreviewElement
} from './writerSuggestionPreview'

export const writerSuggestionPluginKey = new PluginKey('writerSuggestion')

export interface WriterSuggestionPluginState {
  decorations: DecorationSet
}

function buildPendingDecorations(
  state: EditorState,
  pendingAction: WriterSuggestionPendingAction | null
): DecorationSet {
  const { selection } = state
  const pos = selection.empty ? selection.head : selection.to
  return DecorationSet.create(state.doc, [
    Decoration.widget(
      pos,
      () => createLoadingPreviewElement(getWriterSuggestionPendingLabel(pendingAction)),
      { side: 1, key: 'writer-suggestion-pending' }
    )
  ])
}

function buildActiveDecorations(
  state: EditorState,
  proposal: WriterAiProposal | null,
  pending: number[]
): DecorationSet {
  if (!proposal || pending.length === 0) {
    return DecorationSet.empty
  }

  const decorations: ReturnType<typeof Decoration.inline>[] = []

  for (const index of pending) {
    const op = proposal.operations[index]
    if (!op) continue
    const built = decorationsForOperation(state, op)
    decorations.push(...built)
  }

  return DecorationSet.create(state.doc, decorations)
}

function decorationsForOperation(
  state: EditorState,
  op: WriterEditOperation
): Array<ReturnType<typeof Decoration.inline>> {
  const result: Array<ReturnType<typeof Decoration.inline>> = []

  switch (op.kind) {
    case 'insert_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return result
      const pos = block.textStart + op.offset
      result.push(
        Decoration.widget(pos, () => createInlineAddElement(op.text), {
          side: 1,
          key: `insert-${op.blockId}-${op.offset}`
        })
      )
      break
    }
    case 'replace_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return result
      const from = block.textStart + op.from
      const to = block.textStart + op.to
      result.push(
        Decoration.inline(from, to, {
          class: 'sm-writer-diff-delete'
        })
      )
      result.push(
        Decoration.widget(to, () => createInlineAddElement(op.text), {
          side: 1,
          key: `replace-${op.blockId}-${op.from}`
        })
      )
      break
    }
    case 'delete_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return result
      result.push(
        Decoration.inline(block.textStart + op.from, block.textStart + op.to, {
          class: 'sm-writer-diff-delete'
        })
      )
      break
    }
    case 'insert_blocks': {
      let pos = 1
      if (op.afterBlockId) {
        const block = findBlockByNodeId(state, op.afterBlockId)
        if (!block) return result
        pos = block.pos + block.node.nodeSize
      }
      result.push(
        Decoration.widget(pos, () => createBlocksPreviewElement(op.blocks), {
          side: 1,
          key: `insert-blocks-${op.afterBlockId ?? 'start'}`
        })
      )
      break
    }
    case 'replace_blocks': {
      for (const id of op.targetBlockIds) {
        const block = findBlockByNodeId(state, id)
        if (!block) continue
        result.push(
          Decoration.node(block.pos, block.pos + block.node.nodeSize, {
            class: 'sm-writer-diff-delete-block'
          })
        )
      }
      const lastId = op.targetBlockIds[op.targetBlockIds.length - 1]
      const last = lastId ? findBlockByNodeId(state, lastId) : null
      if (last) {
        result.push(
          Decoration.widget(
            last.pos + last.node.nodeSize,
            () => createBlocksPreviewElement(op.blocks),
            {
              side: 1,
              key: `replace-blocks-${lastId}`
            }
          )
        )
      }
      break
    }
    default:
      break
  }

  return result
}

function buildPluginDecorations(state: EditorState): DecorationSet {
  const store = useWriterSuggestionStore.getState()
  if (store.status === 'pending') {
    return buildPendingDecorations(state, store.pendingAction)
  }
  if (
    store.status !== 'active' ||
    !store.activeProposal ||
    store.pendingOperationIndexes.length === 0
  ) {
    return DecorationSet.empty
  }
  return buildActiveDecorations(state, store.activeProposal, store.pendingOperationIndexes)
}

/** @internal 仅供测试断言 decoration 构建 */
export function buildPluginDecorationsForTest(state: EditorState): DecorationSet {
  return buildPluginDecorations(state)
}

/**
 * 写作 AI 建议 Decoration 插件：未接受内容仅以 decoration 呈现，不进入文档 JSON。
 */
export function createWriterSuggestionExtension() {
  return Extension.create({
    name: 'writerSuggestion',

    addProseMirrorPlugins() {
      return [
        new Plugin<WriterSuggestionPluginState>({
          key: writerSuggestionPluginKey,
          state: {
            init: (_, state) => ({ decorations: buildPluginDecorations(state) }),
            apply: (tr, pluginState, _oldState, newState) => {
              if (tr.getMeta('writerSuggestionAccept')) {
                return { decorations: DecorationSet.empty }
              }

              const store = useWriterSuggestionStore.getState()
              if (store.status === 'pending') {
                return { decorations: buildPendingDecorations(newState, store.pendingAction) }
              }

              const proposal = store.activeProposal
              const pending = store.pendingOperationIndexes
              if (store.status !== 'active' || !proposal || pending.length === 0) {
                return { decorations: DecorationSet.empty }
              }

              if (tr.getMeta('writerSuggestionRefresh') || tr.docChanged) {
                return { decorations: buildActiveDecorations(newState, proposal, pending) }
              }

              return {
                decorations: pluginState.decorations.map(tr.mapping, tr.doc)
              }
            }
          },
          props: {
            decorations(state) {
              return writerSuggestionPluginKey.getState(state)?.decorations ?? DecorationSet.empty
            }
          }
        })
      ]
    }
  })
}

/** 通知编辑器按当前 suggestion store 刷新 decorations */
export function refreshWriterSuggestionDecorations(dispatch: (tr: Transaction) => void, state: EditorState): void {
  const tr = state.tr.setMeta('writerSuggestionRefresh', true)
  dispatch(tr)
}
