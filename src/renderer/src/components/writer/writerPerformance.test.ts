import assert from 'node:assert/strict'
import test from 'node:test'
import type { WriterDocumentSummary } from '@shared/types/writer'
import { filterWriterDocuments } from '@renderer/stores/writer/writerLibraryStore'
import {
  buildBoundedWriterAiContext,
  type BoundedWriterAiContextResult
} from './suggestions/writerSuggestionCore'
import type { WriterAiContextBlock, WriterAiRequestContext } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'

/** 与 WriterContextFormatter.WRITER_CONTEXT_CHAR_BUDGET 对齐 */
const WRITER_CONTEXT_CHAR_BUDGET = 24_000

function createSummary(
  overrides: Partial<WriterDocumentSummary> & Pick<WriterDocumentSummary, 'id' | 'title'>
): WriterDocumentSummary {
  return {
    revision: 0,
    favorite: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

test('filterWriterDocuments 不改变输入并按标题搜索返回正确顺序', () => {
  const documents = Array.from({ length: 1000 }, (_, index) =>
    createSummary({
      id: `writer-${String(index).padStart(8, '0')}`,
      title: index % 50 === 0 ? `专题笔记 ${index}` : `普通文档 ${index}`,
      favorite: index % 7 === 0,
      updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`
    })
  )
  const inputSnapshot = documents.map((item) => ({ ...item }))

  const started = performance.now()
  const filtered = filterWriterDocuments(documents, {
    collection: 'all',
    searchQuery: '专题笔记',
    recentDocumentIds: []
  })
  const elapsed = performance.now() - started

  assert.equal(elapsed < 50, true, `搜索耗时应低于 50ms，实际 ${elapsed.toFixed(2)}ms`)
  assert.deepEqual(documents, inputSnapshot)
  assert.ok(filtered.length > 0)
  assert.equal(
    filtered.every((document) => document.title.includes('专题笔记')),
    true
  )
  // 与库内 sortDocuments 规则一致：收藏优先，再按 updatedAt/id
  const expected = filterWriterDocuments(
    documents.filter((document) => document.title.includes('专题笔记')),
    { collection: 'all', searchQuery: '', recentDocumentIds: [] }
  )
  assert.deepEqual(
    filtered.map((document) => document.id),
    expected.map((document) => document.id)
  )
})

test('buildBoundedWriterAiContext 对超长文档按标题分组截断并标记 truncated', () => {
  const blocks: WriterAiContextBlock[] = []
  for (let section = 0; section < 40; section += 1) {
    blocks.push({
      nodeId: `h-${section}`,
      type: 'heading',
      level: 1,
      text: `章节 ${section}`
    })
    for (let paragraph = 0; paragraph < 20; paragraph += 1) {
      blocks.push({
        nodeId: `p-${section}-${paragraph}`,
        type: 'paragraph',
        text: `段落内容 ${section}-${paragraph} ${'字'.repeat(80)}`
      })
    }
  }

  const fullContext: WriterAiRequestContext = {
    documentId: 'writer-bounded-1',
    baseRevision: 3,
    title: '超长文档',
    anchor: {
      documentId: 'writer-bounded-1',
      baseRevision: 3,
      scope: 'document',
      startBlockId: blocks[0]!.nodeId,
      endBlockId: blocks[blocks.length - 1]!.nodeId,
      startOffset: 0,
      endOffset: blocks[blocks.length - 1]!.text.length,
      expectedTextHash: hashWriterText(blocks.map((block) => block.text).join('\n'))
    },
    blocks
  }

  const result: BoundedWriterAiContextResult = buildBoundedWriterAiContext(fullContext, {
    charBudget: Math.min(8_000, WRITER_CONTEXT_CHAR_BUDGET)
  })

  assert.equal(result.truncated, true)
  assert.ok(result.context.blocks.length < fullContext.blocks.length)
  assert.ok(result.context.blocks.length > 0)
  assert.equal(result.context.anchor.startBlockId, result.context.blocks[0]!.nodeId)
  assert.equal(
    result.context.anchor.endBlockId,
    result.context.blocks[result.context.blocks.length - 1]!.nodeId
  )
})
