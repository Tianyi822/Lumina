import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { WriterCapability } from './WriterCapability'
import type { WriterAiRequestContext } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'

function makeWriterContext(): WriterAiRequestContext {
  const blocks = [{ nodeId: 'p-1', type: 'paragraph' as const, text: '正文' }]
  return {
    documentId: 'writer-aaaaaaaa',
    baseRevision: 1,
    title: '标题',
    blocks,
    anchor: {
      documentId: 'writer-aaaaaaaa',
      baseRevision: 1,
      scope: 'selection',
      startBlockId: 'p-1',
      endBlockId: 'p-1',
      startOffset: 0,
      endOffset: 2,
      expectedTextHash: hashWriterText('正文')
    }
  }
}

describe('WriterCapability', () => {
  const cap = new WriterCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'writer')
    assert.equal(cap.displayName, '写作编辑')
    assert.ok(cap.tags.includes('写作'))
  })

  it('无 writerContext 时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({}), null)
    assert.equal(cap.createAdapter({ writerContext: undefined }), null)
  })

  it('有 writerContext 时 createAdapter 返回非 null', () => {
    const adapter = cap.createAdapter({ writerContext: makeWriterContext() })
    assert.notEqual(adapter, null)
  })

  it('describeTools 返回 writer__propose_edits', () => {
    const tools = cap.describeTools({})
    assert.ok(tools.some((t) => t.name === 'writer__propose_edits'))
  })

  it('enrichResult 返回 sourceType writer', () => {
    const meta = cap.enrichResult!('writer__propose_edits', {}, { success: true, content: {} })
    assert.equal(meta.sourceType, 'writer')
  })
})
