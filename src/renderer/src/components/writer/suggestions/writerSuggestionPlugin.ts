import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { WriterAiProposal, WriterEditOperation } from '@shared/types/writer'
import { findBlockByNodeId } from './writerSuggestionCore'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'

export const writerSuggestionPluginKey = new PluginKey('writerSuggestion')

export interface WriterSuggestionPluginState {
  decorations: DecorationSet
}

function buildDecorations(state: EditorState, proposal: WriterAiProposal | null, pending: number[]): DecorationSet {
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
        Decoration.widget(pos, () => createAddWidget(op.text), {
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
        Decoration.widget(to, () => createAddWidget(op.text), {
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
      const preview = op.blocks.map((block) => block.text).join('\n')
      result.push(
        Decoration.widget(pos, () => createBlockAddWidget(preview), {
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
        const preview = op.blocks.map((block) => block.text).join('\n')
        result.push(
          Decoration.widget(last.pos + last.node.nodeSize, () => createBlockAddWidget(preview), {
            side: 1,
            key: `replace-blocks-${lastId}`
          })
        )
      }
      break
    }
    default:
      break
  }

  return result
}

function createAddWidget(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'sm-writer-diff-add'
  span.textContent = text
  return span
}

function createBlockAddWidget(text: string): HTMLElement {
  const div = document.createElement('div')
  div.className = 'sm-writer-diff-add-block'
  div.textContent = text
  return div
}

function readSuggestionSnapshot(): {
  proposal: WriterAiProposal | null
  pending: number[]
} {
  const store = useWriterSuggestionStore.getState()
  return {
    proposal: store.activeProposal,
    pending: store.pendingOperationIndexes
  }
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
            init: (_, state) => {
              const { proposal, pending } = readSuggestionSnapshot()
              return { decorations: buildDecorations(state, proposal, pending) }
            },
            apply: (tr, pluginState, _oldState, newState) => {
              if (tr.getMeta('writerSuggestionAccept')) {
                return { decorations: DecorationSet.empty }
              }

              const store = useWriterSuggestionStore.getState()
              const proposal = store.activeProposal
              const pending = store.pendingOperationIndexes
              if (store.status !== 'active' || !proposal || pending.length === 0) {
                return { decorations: DecorationSet.empty }
              }

              if (tr.getMeta('writerSuggestionRefresh') || tr.docChanged) {
                return { decorations: buildDecorations(newState, proposal, pending) }
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
