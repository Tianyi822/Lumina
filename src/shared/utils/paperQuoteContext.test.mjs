import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPaperTextAnchor } from './paperAnnotationAnchors.ts'
import { buildPaperQuoteContext, PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT } from './paperQuoteContext.ts'

test('中文引用上下文包含前后句且不会无限扩张', () => {
  const selectedText = '用户选中的关键句子。'
  const text =
    '背景句一。前文句二说明方法。' +
    selectedText +
    '后文句一解释指代。后文句二给出结论。很远句子不应出现。'
  const startOffset = text.indexOf(selectedText)
  const anchor = buildPaperTextAnchor(text, startOffset, startOffset + selectedText.length)

  const context = buildPaperQuoteContext(text, anchor)

  assert.match(context.beforeText, /背景句一。前文句二说明方法。/)
  assert.match(context.afterText, /后文句一解释指代。后文句二给出结论。/)
  assert.equal(context.contextualText.includes(selectedText), true)
  assert.equal(context.contextualText.includes('很远句子不应出现'), false)
})

test('英文引用上下文支持句号、问号、感叹号和分号边界', () => {
  const selectedText = 'Selected sentence with this reference'
  const text =
    'Intro clause. Earlier sentence; ' +
    `${selectedText}? Follow up explains it! Nearby detail is still useful. ` +
    'Remote detail should stay out.'
  const startOffset = text.indexOf(selectedText)
  const anchor = buildPaperTextAnchor(text, startOffset, startOffset + selectedText.length)

  const context = buildPaperQuoteContext(text, anchor)

  assert.match(context.beforeText, /Intro clause\. Earlier sentence; /)
  assert.match(context.afterText, /\? Follow up explains it!/)
  assert.equal(context.contextualText.includes('Remote detail should stay out'), false)
})

test('超长段落上下文会按单侧字符上限裁剪', () => {
  const selectedText = 'central claim'
  const text = `${'A'.repeat(900)} ${selectedText} ${'B'.repeat(900)}`
  const startOffset = text.indexOf(selectedText)
  const anchor = buildPaperTextAnchor(text, startOffset, startOffset + selectedText.length)

  const context = buildPaperQuoteContext(text, anchor)

  assert.ok(context.beforeText.length <= PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT)
  assert.ok(context.afterText.length <= PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT)
  assert.equal(context.contextualText.includes(selectedText), true)
})

test('无法精确恢复锚点时仍基于偏移返回最小可用上下文', () => {
  const text = 'Short context only.'
  const anchor = {
    selectedText: 'missing',
    prefixText: '',
    suffixText: '',
    startOffset: 6,
    endOffset: 13,
    normalizedText: 'missing'
  }

  const context = buildPaperQuoteContext(text, anchor)

  assert.equal(context.contextualText.length > 0, true)
  assert.equal(context.contextStartOffset, 0)
  assert.ok(context.selectedStartOffset >= 0)
})
