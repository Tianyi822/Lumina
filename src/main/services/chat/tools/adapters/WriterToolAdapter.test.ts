import test from 'node:test'
import assert from 'node:assert/strict'
import { WriterToolAdapter } from './WriterToolAdapter'
import type { WriterAiProposal, WriterAiRequestContext } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'

function createWriterContext(
  overrides: Partial<WriterAiRequestContext> & {
    scope?: WriterAiRequestContext['anchor']['scope']
    blocks?: WriterAiRequestContext['blocks']
  } = {}
): WriterAiRequestContext {
  const blocks = overrides.blocks ?? [
    { nodeId: 'p-1', type: 'paragraph' as const, text: '默认段落' },
    { nodeId: 'image-1', type: 'paragraph' as const, text: '图片说明' }
  ]
  const scope = overrides.scope ?? 'selection'
  const text = blocks.map((b) => b.text).join('\n')
  return {
    documentId: 'writer-aaaaaaaa',
    baseRevision: 3,
    title: '文档标题',
    blocks,
    anchor: {
      documentId: 'writer-aaaaaaaa',
      baseRevision: 3,
      scope,
      startBlockId: blocks[0].nodeId,
      endBlockId: blocks[blocks.length - 1].nodeId,
      startOffset: 0,
      endOffset: blocks[0].text.length,
      expectedTextHash: hashWriterText(text)
    },
    ...overrides,
    blocks,
    anchor: {
      documentId: 'writer-aaaaaaaa',
      baseRevision: 3,
      scope,
      startBlockId: blocks[0].nodeId,
      endBlockId: blocks[blocks.length - 1].nodeId,
      startOffset: 0,
      endOffset: blocks[0].text.length,
      expectedTextHash: hashWriterText(text),
      ...overrides.anchor,
      scope
    }
  }
}

test('适配器接受范围内替换并生成带原文哈希的建议', async () => {
  const context = createWriterContext({
    scope: 'selection',
    blocks: [{ nodeId: 'p-1', type: 'paragraph', text: '原始句子' }]
  })
  const adapter = new WriterToolAdapter(context)
  const result = await adapter.execute('writer__propose_edits', {
    operations: [
      {
        kind: 'replace_text',
        blockId: 'p-1',
        from: 0,
        to: 4,
        text: '修改后'
      }
    ]
  })
  assert.equal(result.success, true)
  assert.equal((result.content as WriterAiProposal).operations.length, 1)
  const op = (result.content as WriterAiProposal).operations[0]
  assert.equal(op.kind, 'replace_text')
  if (op.kind === 'replace_text') {
    assert.equal(op.expectedTextHash, hashWriterText('原始句子'))
  }
})

test('适配器拒绝标题修改、越界节点和图片结构变化', async () => {
  const adapter = new WriterToolAdapter(createWriterContext())
  const result = await adapter.execute('writer__propose_edits', {
    operations: [{ kind: 'delete_blocks', blockIds: ['image-1'] }]
  })
  assert.equal(result.success, false)
})

test('适配器拒绝越界 blockId', async () => {
  const adapter = new WriterToolAdapter(
    createWriterContext({
      blocks: [{ nodeId: 'p-1', type: 'paragraph', text: '在范围内' }]
    })
  )
  const result = await adapter.execute('writer__propose_edits', {
    operations: [
      {
        kind: 'replace_text',
        blockId: 'p-outside',
        from: 0,
        to: 1,
        text: 'x'
      }
    ]
  })
  assert.equal(result.success, false)
})

test('适配器拒绝显式标题修改', async () => {
  const adapter = new WriterToolAdapter(createWriterContext())
  const result = await adapter.execute('writer__propose_edits', {
    title: '新标题',
    operations: [
      {
        kind: 'insert_text',
        blockId: 'p-1',
        offset: 0,
        text: '前缀'
      }
    ]
  })
  assert.equal(result.success, false)
})

test('getTools 暴露 writer propose_edits', async () => {
  const adapter = new WriterToolAdapter(createWriterContext())
  const tools = await adapter.getTools()
  assert.equal(tools.length, 1)
  assert.equal(tools[0].serverName, 'writer')
  assert.equal(tools[0].toolName, 'propose_edits')
})
