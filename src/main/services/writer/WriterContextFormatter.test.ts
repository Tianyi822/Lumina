import test from 'node:test'
import assert from 'node:assert/strict'
import { WriterContextFormatter } from './WriterContextFormatter'
import type { WriterAiRequestContext } from '@shared/types/writer'

function makeContext(
  overrides: Partial<WriterAiRequestContext> & {
    scope?: WriterAiRequestContext['anchor']['scope']
  } = {}
): WriterAiRequestContext {
  const scope = overrides.scope ?? overrides.anchor?.scope ?? 'selection'
  const blocks = overrides.blocks ?? [
    { nodeId: 'p-1', type: 'paragraph' as const, text: '目标段落' },
    { nodeId: 'p-2', type: 'paragraph' as const, text: '范围外段落' }
  ]
  return {
    documentId: 'writer-aaaaaaaa',
    baseRevision: 1,
    title: '只读标题',
    blocks,
    ...overrides,
    anchor: {
      documentId: 'writer-aaaaaaaa',
      baseRevision: 1,
      startBlockId: (overrides.blocks ?? blocks)[0].nodeId,
      endBlockId: (overrides.blocks ?? blocks)[0].nodeId,
      startOffset: 0,
      endOffset: (overrides.blocks ?? blocks)[0].text.length,
      expectedTextHash: 'hash',
      ...overrides.anchor,
      scope
    }
  }
}

test('cursor/selection/section 只包含目标块', () => {
  for (const scope of ['cursor', 'selection', 'section'] as const) {
    const formatted = WriterContextFormatter.format(
      makeContext({
        scope,
        blocks: [{ nodeId: 'p-1', type: 'paragraph', text: '仅此块' }]
      })
    )
    assert.match(formatted, /仅此块/)
    assert.doesNotMatch(formatted, /范围外段落/)
    assert.match(formatted, /标题只读|标题为只读|不可修改标题/)
    assert.match(formatted, /writer__propose_edits/)
    assert.match(formatted, /不可扩大|不得扩大|范围/)
  }
})

test('document 按标题分组', () => {
  const formatted = WriterContextFormatter.format(
    makeContext({
      scope: 'document',
      blocks: [
        { nodeId: 'h-1', type: 'heading', text: '引言', level: 1 },
        { nodeId: 'p-1', type: 'paragraph', text: '引言正文' },
        { nodeId: 'h-2', type: 'heading', text: '方法', level: 1 },
        { nodeId: 'p-2', type: 'paragraph', text: '方法正文' }
      ]
    })
  )
  assert.match(formatted, /引言/)
  assert.match(formatted, /方法/)
  assert.match(formatted, /引言正文/)
  assert.match(formatted, /方法正文/)
  // 分组标记：每个 heading 作为独立分组标题出现
  assert.match(formatted, /##\s*引言|【引言】|# 引言/)
})
