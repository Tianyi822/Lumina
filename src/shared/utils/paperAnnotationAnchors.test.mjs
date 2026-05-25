import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts
} from './paperAnnotationAnchors.ts'

test('文本锚点生成会跳过选区首尾不可见格式字符', () => {
  const source = '\u200b其中 H_k 和后续文字'
  const anchor = buildPaperTextAnchor(source, 0, source.indexOf(' H_k'))

  assert.equal(anchor.selectedText, '其中')
  assert.equal(anchor.startOffset, 1)
  assert.equal(anchor.endOffset, 3)
  assert.equal(anchor.normalizedText, '其中')
})

test('历史锚点带段首隐藏字符时可以恢复到可见文本', () => {
  const anchor = {
    selectedText: '\u200b其中',
    prefixText: '',
    suffixText: ' H_k 和后续文字',
    startOffset: 0,
    endOffset: 3,
    normalizedText: '其中'
  }

  const recoveredOffset = findPaperTextAnchorOffset('其中 H_k 和后续文字', anchor)

  assert.equal(recoveredOffset, 0)
})

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
  const source = 'Method Accuracy F1\nBaseline 82.1 79.4\nLumina 91.3 88.8'
  const startOffset = source.indexOf('91.3')
  const anchor = buildPaperTextAnchor(source, startOffset, startOffset + '91.3'.length)
  const shiftedText = 'Metric table\nMethod Accuracy F1\nBaseline 82.1 79.4\nLumina 91.3 88.8'
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

test('文本锚点可以把旧 KaTeX DOM 偏移恢复到源码文本位置', () => {
  const selectedText = '训练中使用的唯一数据增强方法是从调整尺寸后的图像中随机裁剪正方形区域。'
  const source =
    '我们还移除了函数 $t_{u}$。我们也简化了图像变换函数 $t_{v}$。' +
    `${selectedText}最后，用于控制 softmax 中 logits 范围的温度参数 $\\tau$。`
  const legacyDomText =
    '我们还移除了函数 tut_{u}tu\u200b。我们也简化了图像变换函数 tvt_{v}tv\u200b。' +
    `${selectedText}最后，用于控制 softmax 中 logits 范围的温度参数 τ\\tauτ。`
  const sourceStartOffset = source.indexOf(selectedText)
  const legacyStartOffset = legacyDomText.indexOf(selectedText)
  const anchor = buildPaperTextAnchor(
    legacyDomText,
    legacyStartOffset,
    legacyStartOffset + selectedText.length
  )

  const recoveredOffset = findPaperTextAnchorOffset(source, anchor)

  assert.notEqual(legacyStartOffset, sourceStartOffset)
  assert.equal(recoveredOffset, sourceStartOffset)
})

test('精确切片命中但上下文不匹配时降级到片段搜索', () => {
  const creationText =
    'First sentence. Important concept appears here. Important concept appears later.'
  const renderText =
    'Opening note. Important concept appears here. Another bridge. Important concept appears later.'

  const secondStart = creationText.indexOf('Important concept appears later')
  const anchor = buildPaperTextAnchor(
    creationText,
    secondStart,
    secondStart + 'Important concept'.length
  )

  const recovered = findPaperTextAnchorOffset(renderText, anchor)

  assert.equal(recovered, renderText.indexOf('Important concept appears later'))
})

test('完全相同的两个词 — 上下文消歧选择正确位置', () => {
  const source = 'The data analysis shows the trend. The data analysis confirms the result.'

  const firstStart = source.indexOf('data')
  const anchor = buildPaperTextAnchor(source, firstStart, firstStart + 'data'.length)

  const shifted =
    'Introduction. The data analysis shows the trend. The data analysis confirms the result.'

  const recovered = findPaperTextAnchorOffset(shifted, anchor)

  assert.equal(recovered, shifted.indexOf('data'))
})

test('相邻相同词 — 锚定到正确的那一个', () => {
  const source = 'example example'

  const firstStart = 0
  const anchor = buildPaperTextAnchor(source, firstStart, firstStart + 'example'.length)

  const shifted = 'An example example'

  const recovered = findPaperTextAnchorOffset(shifted, anchor)

  assert.equal(recovered, shifted.indexOf('example'))
})
