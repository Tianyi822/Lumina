import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { WriterAiProposal, WriterEditOperation } from '@shared/types/writer'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'
import type { WriterSuggestionPendingAction } from './writerSuggestionLabels'
import { getWriterSuggestionPendingLabel } from './writerSuggestionLabels'
import {
  acceptAllWriterSuggestions,
  acceptWriterSuggestionOperation,
  rejectAllWriterSuggestions,
  rejectWriterSuggestionOperation
} from './writerSuggestionActionsCore'
import { findBlockByNodeId } from './writerSuggestionCore'
import {
  appendOperationToolbar,
  createBlocksPreviewElement,
  createInlineAddElement,
  createLoadingPreviewElement,
  type OperationToolbarOptions
} from './writerSuggestionPreview'

export const writerSuggestionPluginKey = new PluginKey('writerSuggestion')

export interface WriterSuggestionPluginState {
  decorations: DecorationSet
}

interface OperationToolbarContext {
  operationIndex: number
  showBatchActions: boolean
  pendingCount: number
  editor: Editor | null
}

function buildToolbarOptions(ctx: OperationToolbarContext): OperationToolbarOptions {
  const { operationIndex, showBatchActions, pendingCount, editor } = ctx
  return {
    operationIndex,
    showBatchActions,
    pendingCount,
    onAcceptOne: (index) => {
      if (editor) acceptWriterSuggestionOperation(editor, index)
    },
    onRejectOne: (index) => {
      if (editor) rejectWriterSuggestionOperation(editor, index)
    },
    onAcceptAll: () => {
      if (editor) acceptAllWriterSuggestions(editor)
    },
    onRejectAll: () => {
      if (editor) rejectAllWriterSuggestions(editor)
    }
  }
}

function withToolbar(preview: HTMLElement, ctx: OperationToolbarContext): HTMLElement {
  // 块级预览根可直接挂工具条；内联 span 外包一层，避免工具条打断文本流语义
  if (
    preview.classList.contains('sm-writer-diff-add-blocks') ||
    preview.classList.contains('sm-writer-diff-op')
  ) {
    return appendOperationToolbar(preview, buildToolbarOptions(ctx))
  }
  const wrapper = document.createElement('span')
  wrapper.className = 'sm-writer-diff-op'
  wrapper.appendChild(preview)
  return appendOperationToolbar(wrapper, buildToolbarOptions(ctx))
}

function clampDocPos(state: EditorState, pos: number): number {
  return Math.min(Math.max(1, pos), state.doc.content.size)
}

function resolvePendingDecorationPos(
  state: EditorState,
  pendingAnchorPos: number | null
): number {
  const { selection } = state
  const raw = pendingAnchorPos ?? (selection.empty ? selection.head : selection.to)
  return clampDocPos(state, raw)
}

function buildPendingDecorations(
  state: EditorState,
  pendingAction: WriterSuggestionPendingAction | null,
  pendingAnchorPos: number | null
): DecorationSet {
  const pos = resolvePendingDecorationPos(state, pendingAnchorPos)
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
  pending: number[],
  editor: Editor | null
): DecorationSet {
  if (!proposal || pending.length === 0) {
    return DecorationSet.empty
  }

  const decorations: ReturnType<typeof Decoration.inline>[] = []
  const pendingCount = pending.length

  for (let i = 0; i < pending.length; i++) {
    const index = pending[i]!
    const op = proposal.operations[index]
    if (!op) continue
    const toolbarCtx: OperationToolbarContext = {
      operationIndex: index,
      // 仅一项时不重复展示「全部接受/拒绝」
      showBatchActions: i === 0 && pendingCount > 1,
      pendingCount,
      editor
    }
    const built = decorationsForOperation(state, op, toolbarCtx)
    decorations.push(...built)
  }

  return DecorationSet.create(state.doc, decorations)
}

function decorationsForOperation(
  state: EditorState,
  op: WriterEditOperation,
  toolbarCtx: OperationToolbarContext
): Array<ReturnType<typeof Decoration.inline>> {
  const result: Array<ReturnType<typeof Decoration.inline>> = []

  switch (op.kind) {
    case 'insert_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return result
      const pos = block.textStart + op.offset
      result.push(
        Decoration.widget(pos, () => withToolbar(createInlineAddElement(op.text), toolbarCtx), {
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
        Decoration.widget(to, () => withToolbar(createInlineAddElement(op.text), toolbarCtx), {
          side: 1,
          key: `replace-${op.blockId}-${op.from}`
        })
      )
      break
    }
    case 'delete_text': {
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
        Decoration.widget(
          to,
          () => {
            const root = document.createElement('span')
            root.className = 'sm-writer-diff-op'
            return withToolbar(root, toolbarCtx)
          },
          {
            side: 1,
            key: `delete-${op.blockId}-${op.from}`
          }
        )
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
        Decoration.widget(
          pos,
          () => withToolbar(createBlocksPreviewElement(op.blocks), toolbarCtx),
          {
            side: 1,
            key: `insert-blocks-${op.afterBlockId ?? 'start'}`
          }
        )
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
            () => withToolbar(createBlocksPreviewElement(op.blocks), toolbarCtx),
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

function buildPluginDecorations(state: EditorState, editor: Editor | null): DecorationSet {
  const store = useWriterSuggestionStore.getState()
  if (store.status === 'pending') {
    return buildPendingDecorations(state, store.pendingAction, store.pendingAnchorPos)
  }
  if (
    store.status !== 'active' ||
    !store.activeProposal ||
    store.pendingOperationIndexes.length === 0
  ) {
    return DecorationSet.empty
  }
  return buildActiveDecorations(
    state,
    store.activeProposal,
    store.pendingOperationIndexes,
    editor
  )
}

/** @internal 仅供测试断言 decoration 构建 */
export function buildPluginDecorationsForTest(
  state: EditorState,
  editor: Editor | null = null
): DecorationSet {
  return buildPluginDecorations(state, editor)
}

/**
 * 写作 AI 建议 Decoration 插件：未接受内容仅以 decoration 呈现，不进入文档 JSON。
 */
export function createWriterSuggestionExtension() {
  return Extension.create({
    name: 'writerSuggestion',

    addProseMirrorPlugins() {
      const extension = this
      return [
        new Plugin<WriterSuggestionPluginState>({
          key: writerSuggestionPluginKey,
          state: {
            init: (_, state) => ({
              decorations: buildPluginDecorations(state, extension.editor)
            }),
            apply: (tr, pluginState, _oldState, newState) => {
              if (tr.getMeta('writerSuggestionAccept')) {
                return { decorations: DecorationSet.empty }
              }

              const store = useWriterSuggestionStore.getState()
              if (store.status === 'pending') {
                let anchorPos = store.pendingAnchorPos
                if (anchorPos != null && tr.docChanged) {
                  anchorPos = tr.mapping.map(anchorPos)
                  useWriterSuggestionStore.setState({ pendingAnchorPos: anchorPos })
                }
                return {
                  decorations: buildPendingDecorations(
                    newState,
                    store.pendingAction,
                    anchorPos
                  )
                }
              }

              const proposal = store.activeProposal
              const pending = store.pendingOperationIndexes
              if (store.status !== 'active' || !proposal || pending.length === 0) {
                return { decorations: DecorationSet.empty }
              }

              if (tr.getMeta('writerSuggestionRefresh') || tr.docChanged) {
                return {
                  decorations: buildActiveDecorations(
                    newState,
                    proposal,
                    pending,
                    extension.editor
                  )
                }
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
export function refreshWriterSuggestionDecorations(
  dispatch: (tr: Transaction) => void,
  state: EditorState
): void {
  const tr = state.tr.setMeta('writerSuggestionRefresh', true)
  dispatch(tr)
}
