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
