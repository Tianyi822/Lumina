import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperQuote } from '@shared/types/chat'
import { buildPaperTextAnchor } from '@shared/utils/paperAnnotationAnchors'
import { formatQuotesContext } from './MessageFormatter.ts'

function createQuote(
  viewKind: PaperQuote['viewKind'],
  segmentIndex: number,
  text: string,
  selectedText: string
): PaperQuote {
  const startOffset = text.indexOf(selectedText)
  assert.notEqual(startOffset, -1)

  return {
    id: `${viewKind}-${segmentIndex}`,
    paperId: 'paper-1',
    segmentStableId: `segment-${segmentIndex}`,
    segmentIndex,
    viewKind,
    selectedText,
    textAnchor: buildPaperTextAnchor(text, startOffset, startOffset + selectedText.length)
  }
}

test('formatQuotesContext 按原文和译文分别编号并包含引用内容', () => {
  const context = formatQuotesContext([
    createQuote('original', 0, 'Alpha original content.', 'Alpha original'),
    createQuote('translation', 1, '第一段译文内容。', '第一段译文'),
    createQuote('original', 2, 'Beta original content.', 'Beta original')
  ])

  assert.match(context, /【原文引用 1】\nAlpha original/)
  assert.match(context, /【译文引用 1】\n第一段译文/)
  assert.match(context, /【原文引用 2】\nBeta original/)
  assert.equal(context.includes('第1段'), false)
})
