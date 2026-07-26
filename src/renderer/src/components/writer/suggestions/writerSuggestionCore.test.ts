import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor, getSchema } from '@tiptap/core'
import { history, undo, undoDepth } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import type { WriterAiProposal, WriterEditOperation } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'
import { useWriterSessionStore } from '@renderer/stores/writer/writerSessionStore'
import { createWriterExtensions } from '../extensions/createWriterExtensions'
import {
  applyAcceptedOperations,
  createWriterAiRequestContext,
  validateProposalAgainstState
} from './writerSuggestionCore'
import { writerSuggestionPluginKey } from './writerSuggestionPlugin'

function createSuggestionDocument(targetText: string, outsideText: string) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        attrs: { nodeId: 'target-block' },
        content: targetText ? [{ type: 'text' as const, text: targetText }] : undefined
      },
      {
        type: 'paragraph' as const,
        attrs: { nodeId: 'outside-block' },
        content: outsideText ? [{ type: 'text' as const, text: outsideText }] : undefined
      }
    ]
  }
}

function createSuggestionEditor(targetText: string, outsideText: string): Editor {
  return new Editor({
    element: null,
    extensions: createWriterExtensions('writer-test-doc'),
    content: createSuggestionDocument(targetText, outsideText)
  })
}

function createSuggestionState(targetText: string, outsideText: string): EditorState {
  const schema = getSchema(createWriterExtensions('writer-test-doc'))
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON(createSuggestionDocument(targetText, outsideText)),
    plugins: [history()]
  })
}

function findBlockRange(state: EditorState, blockId: string): { pos: number; textStart: number } {
  let found: { pos: number; textStart: number } | null = null
  state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs?.nodeId === blockId) {
      found = { pos, textStart: pos + 1 }
      return false
    }
    return true
  })
  if (!found) throw new Error(`未找到块 ${blockId}`)
  return found
}

function applyTextChangeOutsideTarget(
  state: EditorState,
  blockId: string,
  offset: number,
  text: string
): EditorState {
  const { textStart } = findBlockRange(state, blockId)
  const tr = state.tr.insertText(text, textStart + offset)
  return state.apply(tr)
}

function applyTextChangeInsideTarget(
  state: EditorState,
  blockId: string,
  offset: number,
  text: string
): EditorState {
  return applyTextChangeOutsideTarget(state, blockId, offset, text)
}

function createReplaceProposal(
  blockId: string,
  from: number,
  to: number,
  text: string
): WriterAiProposal {
  const original = '目标文本'.slice(from, to)
  return {
    proposalId: 'proposal-test-1',
    documentId: 'writer-test-doc',
    baseRevision: 1,
    anchor: {
      documentId: 'writer-test-doc',
      baseRevision: 1,
      scope: 'document',
      startBlockId: blockId,
      endBlockId: blockId,
      startOffset: from,
      endOffset: to,
      expectedTextHash: hashWriterText(original)
    },
    operations: [
      {
        kind: 'replace_text',
        blockId,
        from,
        to,
        text,
        expectedTextHash: hashWriterText(original)
      }
    ],
    createdAt: new Date().toISOString()
  }
}

function acceptProposalFixture(): {
  nextState: EditorState
  undoDepthBefore: number
  undoDepthAfter: number
} {
  // 无 DOM 的 TipTap Editor 不会挂载 history 插件；用 ProseMirror state 验证单事务撤销
  let state = createSuggestionState('目标文本', '目标外内容')
  const proposal = createReplaceProposal('target-block', 0, 4, '修改文本')
  const validation = validateProposalAgainstState(proposal, state)
  assert.equal(validation.valid, true)

  const undoDepthBefore = undoDepth(state)
  const tr = applyAcceptedOperations(state, proposal.operations)
  tr.setMeta('writerSuggestionAccept', proposal.proposalId)
  state = state.apply(tr)
  const undoDepthAfter = undoDepth(state)

  // 一次 undo 即可恢复
  const undone = undo(state, (undoTr) => {
    state = state.apply(undoTr)
  })
  assert.equal(undone, true)
  assert.match(state.doc.textContent, /目标文本/)

  // 返回接受后的状态供断言
  let accepted = createSuggestionState('目标文本', '目标外内容')
  accepted = accepted.apply(
    applyAcceptedOperations(accepted, proposal.operations).setMeta(
      'writerSuggestionAccept',
      proposal.proposalId
    )
  )
  return { nextState: accepted, undoDepthBefore, undoDepthAfter }
}

test('目标外 Transaction 映射锚点但不使建议失效', () => {
  const initial = createSuggestionState('目标文本', '目标外内容')
  const proposal = createReplaceProposal('target-block', 0, 4, '修改文本')
  const next = applyTextChangeOutsideTarget(initial, 'outside-block', 0, '新增')
  const validation = validateProposalAgainstState(proposal, next)
  assert.equal(validation.valid, true)
})

test('目标文本变化使建议失效且不能接受', () => {
  const initial = createSuggestionState('目标文本', '目标外内容')
  const proposal = createReplaceProposal('target-block', 0, 4, '修改文本')
  const changed = applyTextChangeInsideTarget(initial, 'target-block', 0, '新')
  const validation = validateProposalAgainstState(proposal, changed)
  assert.equal(validation.valid, false)
  assert.equal(validation.reason, 'target_changed')
})

test('全部接受只产生一个历史步骤并可一次撤销', () => {
  const { nextState, undoDepthBefore, undoDepthAfter } = acceptProposalFixture()
  assert.equal(undoDepthAfter, undoDepthBefore + 1)
  assert.match(nextState.doc.textContent, /修改文本/)
})

test('createWriterAiRequestContext 按 document 范围收集块', () => {
  useWriterSessionStore.getState().openDocument('writer-test-doc', 3, '测试文档')
  const editor = createSuggestionEditor('目标文本', '目标外内容')
  const context = createWriterAiRequestContext(editor, 'document', 3)
  assert.ok(context)
  assert.equal(context.documentId, 'writer-test-doc')
  assert.equal(context.baseRevision, 3)
  assert.equal(context.anchor.scope, 'document')
  assert.equal(context.blocks.length, 2)
  assert.equal(context.blocks[0]?.nodeId, 'target-block')
  assert.equal(context.blocks[0]?.text, '目标文本')
  // 多块锚点：endBlockId / endOffset 必须相对末块，而非首块 text.length
  assert.equal(context.anchor.startBlockId, 'target-block')
  assert.equal(context.anchor.endBlockId, 'outside-block')
  assert.equal(context.anchor.startOffset, 0)
  assert.equal(context.anchor.endOffset, '目标外内容'.length)
  assert.notEqual(context.anchor.endOffset, context.blocks[0]!.text.length)
  editor.destroy()
  useWriterSessionStore.getState().closeDocument()
})

test('块 A 文本替换与 after A 的 insert_blocks 不重叠', () => {
  const state = createSuggestionState('目标文本', '目标外内容')
  const proposal: WriterAiProposal = {
    proposalId: 'proposal-insert-coexist',
    documentId: 'writer-test-doc',
    baseRevision: 1,
    anchor: {
      documentId: 'writer-test-doc',
      baseRevision: 1,
      scope: 'document',
      startBlockId: 'target-block',
      endBlockId: 'outside-block',
      startOffset: 0,
      endOffset: '目标外内容'.length,
      expectedTextHash: hashWriterText('目标文本\n目标外内容')
    },
    operations: [
      {
        kind: 'replace_text',
        blockId: 'target-block',
        from: 0,
        to: 4,
        text: '改写文本',
        expectedTextHash: hashWriterText('目标文本')
      },
      {
        kind: 'insert_blocks',
        afterBlockId: 'target-block',
        blocks: [{ nodeId: 'inserted-block', type: 'paragraph', text: '新段落' }]
      }
    ],
    createdAt: new Date().toISOString()
  }
  const validation = validateProposalAgainstState(proposal, state)
  assert.equal(validation.valid, true)
})

test('同 afterBlockId 的两次 insert_blocks 判定为重叠', () => {
  const state = createSuggestionState('目标文本', '目标外内容')
  const proposal: WriterAiProposal = {
    proposalId: 'proposal-insert-overlap',
    documentId: 'writer-test-doc',
    baseRevision: 1,
    anchor: {
      documentId: 'writer-test-doc',
      baseRevision: 1,
      scope: 'document',
      startBlockId: 'target-block',
      endBlockId: 'outside-block',
      startOffset: 0,
      endOffset: '目标外内容'.length,
      expectedTextHash: hashWriterText('目标文本\n目标外内容')
    },
    operations: [
      {
        kind: 'insert_blocks',
        afterBlockId: 'target-block',
        blocks: [{ nodeId: 'a', type: 'paragraph', text: 'A' }]
      },
      {
        kind: 'insert_blocks',
        afterBlockId: 'target-block',
        blocks: [{ nodeId: 'b', type: 'paragraph', text: 'B' }]
      }
    ],
    createdAt: new Date().toISOString()
  }
  const validation = validateProposalAgainstState(proposal, state)
  assert.equal(validation.valid, false)
  assert.equal(validation.reason, 'overlap')
})

test('applyAcceptedOperations 单事务写入替换文本', () => {
  const state = createSuggestionState('目标文本', '目标外内容')
  const operations: WriterEditOperation[] = [
    {
      kind: 'replace_text',
      blockId: 'target-block',
      from: 0,
      to: 4,
      text: '修改文本',
      expectedTextHash: hashWriterText('目标文本')
    }
  ]
  const tr: Transaction = applyAcceptedOperations(state, operations)
  const next = state.apply(tr)
  assert.match(next.doc.textContent, /修改文本/)
  assert.ok(!next.doc.textContent.includes('目标文本'))
})

test('writerSuggestionPluginKey 已导出', () => {
  assert.ok(writerSuggestionPluginKey)
  assert.equal(String(writerSuggestionPluginKey), '[object Object]')
  // PluginKey 内部 key 形如 writerSuggestion$
  assert.match(String((writerSuggestionPluginKey as { key?: string }).key ?? ''), /writerSuggestion/)
})
