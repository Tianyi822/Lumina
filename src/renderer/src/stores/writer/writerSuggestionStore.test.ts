import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import type { WriterAiProposal } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'
import { createWriterExtensions } from '@renderer/components/writer/extensions/createWriterExtensions'
import { useWriterSuggestionStore } from './writerSuggestionStore'

function makeProposal(overrides: Partial<WriterAiProposal> = {}): WriterAiProposal {
  const original = '目标文本'
  return {
    proposalId: 'proposal-store-1',
    documentId: 'writer-doc-test01',
    baseRevision: 2,
    anchor: {
      documentId: 'writer-doc-test01',
      baseRevision: 2,
      scope: 'document',
      startBlockId: 'target-block',
      endBlockId: 'target-block',
      startOffset: 0,
      endOffset: 4,
      expectedTextHash: hashWriterText(original)
    },
    operations: [
      {
        kind: 'replace_text',
        blockId: 'target-block',
        from: 0,
        to: 4,
        text: '修改文本',
        expectedTextHash: hashWriterText(original)
      },
      {
        kind: 'insert_text',
        blockId: 'target-block',
        offset: 4,
        text: '后缀'
      }
    ],
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

function createValidEditorState() {
  const editor = new Editor({
    element: null,
    extensions: createWriterExtensions('writer-doc-test01'),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { nodeId: 'target-block' },
          content: [{ type: 'text', text: '目标文本' }]
        }
      ]
    }
  })
  const state = editor.state
  editor.destroy()
  return state
}

test('ingest 有效 proposal 进入 active', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  const ok = useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  assert.equal(ok, true)
  assert.equal(useWriterSuggestionStore.getState().status, 'active')
  assert.equal(useWriterSuggestionStore.getState().activeProposal?.proposalId, 'proposal-store-1')
})

test('无效 proposal 不进入 active', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  const invalid = makeProposal({
    operations: [
      {
        kind: 'replace_text',
        blockId: 'missing-block',
        from: 0,
        to: 1,
        text: 'x',
        expectedTextHash: hashWriterText('a')
      }
    ]
  })
  const ok = useWriterSuggestionStore
    .getState()
    .ingestProposal(invalid, 'writer-doc-test01', 2, createValidEditorState())
  assert.equal(ok, false)
  assert.notEqual(useWriterSuggestionStore.getState().status, 'active')
  assert.equal(useWriterSuggestionStore.getState().activeProposal, null)
})

test('逐项拒绝后从待处理列表移除', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  useWriterSuggestionStore.getState().rejectOperation(0)
  assert.deepEqual(useWriterSuggestionStore.getState().pendingOperationIndexes, [1])
})

test('逐项接受记录索引并从待处理移除', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  useWriterSuggestionStore.getState().acceptOperation(1)
  assert.deepEqual(useWriterSuggestionStore.getState().pendingOperationIndexes, [0])
  assert.deepEqual(useWriterSuggestionStore.getState().acceptedOperationIndexes, [1])
})

test('全部拒绝清空 active', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  useWriterSuggestionStore.getState().rejectAll()
  assert.equal(useWriterSuggestionStore.getState().activeProposal, null)
  assert.equal(useWriterSuggestionStore.getState().status, 'idle')
})

test('全部接受清空 active', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  useWriterSuggestionStore.getState().acceptAll()
  assert.equal(useWriterSuggestionStore.getState().activeProposal, null)
  assert.equal(useWriterSuggestionStore.getState().status, 'idle')
})

test('beginRequest 记录 pendingAction，ingest 后清除', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2, 'rewrite')
  assert.equal(useWriterSuggestionStore.getState().status, 'pending')
  assert.equal(useWriterSuggestionStore.getState().pendingAction, 'rewrite')
  const ok = useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  assert.equal(ok, true)
  assert.equal(useWriterSuggestionStore.getState().pendingAction, null)
})

test('切换文档取消请求并清空建议', () => {
  useWriterSuggestionStore.getState().reset()
  useWriterSuggestionStore.getState().beginRequest('writer-doc-test01', 2)
  useWriterSuggestionStore
    .getState()
    .ingestProposal(makeProposal(), 'writer-doc-test01', 2, createValidEditorState())
  useWriterSuggestionStore.getState().cancelForDocumentSwitch()
  assert.equal(useWriterSuggestionStore.getState().activeProposal, null)
  assert.equal(useWriterSuggestionStore.getState().status, 'idle')
  assert.equal(useWriterSuggestionStore.getState().pendingRequest, null)
})
