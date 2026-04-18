import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts
} from './paperAnnotationAnchors.ts'

test('文本锚点可以结合上下文恢复到重复文本的正确位置', () => {
  const source = 'First sentence. Important concept appears here. Important concept appears later.'
  const startOffset = source.indexOf('Important concept appears later')
  const anchor = buildPaperTextAnchor(source, startOffset, startOffset + 'Important concept'.length)

  const shiftedText =
    'Opening note. Important concept appears here. Another bridge sentence. Important concept appears later.'
  const recoveredOffset = findPaperTextAnchorOffset(shiftedText, anchor)

  assert.equal(recoveredOffset, shiftedText.indexOf('Important concept appears later'))
})

test('可以按句段比例把原文锚点映射到译文文本', () => {
  const originalText =
    'We first encode the image features. Then we align the feature maps with the detection head.'
  const translatedText = '我们先编码图像特征。然后再把特征图与检测头进行对齐。'
  const sourceStart = originalText.indexOf('Then we align')
  const sourceAnchor = buildPaperTextAnchor(
    originalText,
    sourceStart,
    sourceStart + 'Then we align the feature maps'.length
  )

  const mapped = mapPaperTextAnchorBetweenTexts(originalText, translatedText, sourceAnchor)

  assert.ok(mapped)
  assert.ok(mapped.confidence >= 0.58)
  assert.match(mapped.anchor.selectedText, /^然后再把特征图与检/)
})

test('文本锚点可以恢复表格文本中的选区', () => {
  const source = 'Method Accuracy F1\nBaseline 82.1 79.4\nSparrow 91.3 88.8'
  const startOffset = source.indexOf('91.3')
  const anchor = buildPaperTextAnchor(source, startOffset, startOffset + '91.3'.length)
  const shiftedText = 'Metric table\nMethod Accuracy F1\nBaseline 82.1 79.4\nSparrow 91.3 88.8'
  const recoveredOffset = findPaperTextAnchorOffset(shiftedText, anchor)

  assert.equal(recoveredOffset, shiftedText.indexOf('91.3'))
})

test('文本锚点可以恢复公式邻近文本中的选区', () => {
  const source = 'The loss is L = - log p(y | x), and the margin term stabilizes training.'
  const startOffset = source.indexOf('margin term')
  const anchor = buildPaperTextAnchor(source, startOffset, startOffset + 'margin term'.length)
  const shiftedText =
    'For the final objective, the loss is L = - log p(y | x), and the margin term stabilizes training.'
  const recoveredOffset = findPaperTextAnchorOffset(shiftedText, anchor)

  assert.equal(recoveredOffset, shiftedText.indexOf('margin term'))
})
