import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { Editor } from '@tiptap/core'
import { createWriterExtensions } from './extensions/createWriterExtensions'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'
import type { WriterAiProposal } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'

function createProposal(): WriterAiProposal {
  return {
    proposalId: 'proposal-a11y',
    documentId: 'writer-a11y-doc',
    baseRevision: 1,
    createdAt: new Date().toISOString(),
    anchor: {
      documentId: 'writer-a11y-doc',
      baseRevision: 1,
      scope: 'selection',
      startBlockId: 'p-1',
      endBlockId: 'p-1',
      startOffset: 0,
      endOffset: 2,
      expectedTextHash: hashWriterText('原始')
    },
    operations: [
      {
        kind: 'replace_text',
        blockId: 'p-1',
        from: 0,
        to: 2,
        text: '修改',
        expectedTextHash: hashWriterText('原始')
      }
    ]
  }
}

test('AI 建议按钮具备明确 aria-label', async () => {
  const source = await readFile(
    new URL('./suggestions/writerSuggestionPreview.ts', import.meta.url),
    'utf8'
  )
  assert.match(source, /setAttribute\('role', 'toolbar'\)/)
  assert.match(source, /'AI 编辑建议'/)
  assert.match(source, /'全部接受建议'/)
  assert.match(source, /'全部拒绝建议'/)
  assert.match(source, /'接受该项建议'/)
  assert.match(source, /'拒绝该项建议'/)

  useWriterSuggestionStore.getState().reset()
  const editor = new Editor({
    element: null,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { nodeId: 'p-1' },
          content: [{ type: 'text', text: '原始句子' }]
        }
      ]
    },
    extensions: createWriterExtensions()
  })
  const proposal = createProposal()
  useWriterSuggestionStore.getState().beginRequest(proposal.documentId, proposal.baseRevision)
  assert.equal(
    useWriterSuggestionStore
      .getState()
      .ingestProposal(proposal, proposal.documentId, 1, editor.state),
    true
  )
  assert.equal(useWriterSuggestionStore.getState().status, 'active')
  editor.destroy()
})

test('Slash Menu 使用 listbox 与 option 语义', async () => {
  const source = await readFile(new URL('./toolbar/WriterSlashMenu.tsx', import.meta.url), 'utf8')
  assert.match(source, /role="listbox"/)
  assert.match(source, /aria-label="插入内容"/)
  assert.match(source, /role="option"/)
})

test('标题输入与保存状态具备 label 与 aria-live', async () => {
  const source = await readFile(new URL('./WriterEditor.tsx', import.meta.url), 'utf8')
  assert.match(source, /aria-label="文档标题"/)
  assert.match(source, /role="status"/)
  assert.match(source, /aria-live="polite"/)
})

test('建议等待状态通过 sr-only aria-live 播报', async () => {
  const source = await readFile(new URL('./WriterEditor.tsx', import.meta.url), 'utf8')
  assert.match(source, /styles\.srOnly/)
  assert.match(source, /getWriterSuggestionPendingLabel/)
  assert.match(source, /suggestionStatus === 'pending'/)
})

test('Bubble Menu 暴露改写与续写动作 aria-label', async () => {
  const source = await readFile(
    new URL('./toolbar/WriterBubbleMenu.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /aria-label="AI 改写选区"/)
  assert.match(source, /aria-label="AI 续写选区"/)
  assert.match(source, /role="separator"/)
})
