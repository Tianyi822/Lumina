import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts,
  normalizeFormulaSpacing,
  buildFormulaNormOffsetMap,
  resolvePaperTextAnchorRange
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

test('normalizeFormulaSpacing 归一化行内公式内部空格', () => {
  assert.equal(normalizeFormulaSpacing('$ L_{train} $'), '$L_{train}$')
  assert.equal(
    normalizeFormulaSpacing('loss = $ L_{train} $ defined'),
    'loss = $L_{train}$ defined'
  )
  assert.equal(normalizeFormulaSpacing('$x + y$'), '$x+y$')
})

test('normalizeFormulaSpacing 归一化 display 公式空格', () => {
  assert.equal(normalizeFormulaSpacing('$$ E = mc^2 $$'), '$$E=mc^2$$')
  assert.equal(normalizeFormulaSpacing('result $$ E = mc^2 $$ end'), 'result $$E=mc^2$$ end')
})

test('normalizeFormulaSpacing 保留公式外文本不变', () => {
  assert.equal(normalizeFormulaSpacing('hello world'), 'hello world')
  assert.equal(normalizeFormulaSpacing('a $b$ c'), 'a $b$ c')
})

test('normalizeFormulaSpacing 无 $ 符号时原样返回', () => {
  const text = '没有公式的普通文本'
  assert.equal(normalizeFormulaSpacing(text), text)
})

test('buildFormulaNormOffsetMap 正确构建偏移映射', () => {
  // "$ L_{train} $" → "$L_{train}$"
  const map = buildFormulaNormOffsetMap('loss = $ L_{train} $ defined')
  assert.equal(map.normalized, 'loss = $L_{train}$ defined')

  // 映射一致性：normalized[0] 对应 original[0]
  assert.equal(map.normalized[0], 'l')
  assert.equal(map.normToOriginal[0], 0)

  // '$' 在归一化文本中的位置应该正确映射
  const normDollarStart = map.normalized.indexOf('$')
  const normDollarEnd = map.normalized.lastIndexOf('$')
  assert.ok(normDollarStart >= 0)
  assert.ok(normDollarEnd >= 0)

  // 归一化后的 $ 对应原始文本中的 $
  const origDollarStart = map.normToOriginal[normDollarStart]
  const origDollarEnd = map.normToOriginal[normDollarEnd]
  assert.equal('loss = $ L_{train} $ defined'[origDollarStart], '$')
  assert.equal('loss = $ L_{train} $ defined'[origDollarEnd], '$')
})

test('buildFormulaNormOffsetMap 支持归一化文本尾边界', () => {
  const source = 'loss = $ L_{train} $'
  const map = buildFormulaNormOffsetMap(source)

  assert.equal(map.normalized, 'loss = $L_{train}$')
  assert.equal(map.normToOriginal[map.normalized.length], source.length)
})

test('resolvePaperTextAnchorRange 返回公式空格差异后的真实范围', () => {
  const canonicalText = 'the loss $L_{train}$ is defined'
  const selectedText = 'loss $L_{train}$ is'
  const anchor = buildPaperTextAnchor(
    canonicalText,
    canonicalText.indexOf(selectedText),
    canonicalText.indexOf(selectedText) + selectedText.length
  )
  const originalText = 'the loss $ L_{train} $ is defined'
  const range = resolvePaperTextAnchorRange(originalText, anchor)

  assert.deepEqual(range, {
    startOffset: originalText.indexOf('loss'),
    endOffset: originalText.indexOf(' defined')
  })
  assert.equal(originalText.slice(range.startOffset, range.endOffset), 'loss $ L_{train} $ is')
})

test('resolvePaperTextAnchorRange 可解析 display 公式空格和段尾边界', () => {
  const canonicalText = 'result $$E=mc^2$$'
  const anchor = buildPaperTextAnchor(
    canonicalText,
    canonicalText.indexOf('$$'),
    canonicalText.length
  )
  const originalText = 'result $$ E = mc^2 $$'
  const range = resolvePaperTextAnchorRange(originalText, anchor)

  assert.deepEqual(range, {
    startOffset: originalText.indexOf('$$'),
    endOffset: originalText.length
  })
})

test('resolvePaperTextAnchorRange 同时处理零宽字符和公式空格', () => {
  const canonicalText = '其中 $L_{train}$ is defined'
  const selectedText = '其中 $L_{train}$ is'
  const anchor = buildPaperTextAnchor(canonicalText, 0, selectedText.length)
  const currentText = '\u200b其中 $ L_{train} $ is defined'
  const range = resolvePaperTextAnchorRange(currentText, anchor)

  assert.deepEqual(range, {
    startOffset: 1,
    endOffset: currentText.indexOf(' defined')
  })
})

test('findPaperTextAnchorOffset 可匹配公式空格差异的文本', () => {
  // anchor 来自 canonical text（无空格）
  const canonicalText = 'loss = $L_{train}$ defined'
  const anchor = buildPaperTextAnchor(canonicalText, 7, 7 + '$L_{train}$'.length)

  // 在含公式空格的文本中查找
  const originalText = 'loss = $ L_{train} $ defined'
  const recoveredOffset = findPaperTextAnchorOffset(originalText, anchor)

  assert.equal(recoveredOffset, originalText.indexOf('$'))
})

test('findPaperTextAnchorOffset 可匹配跨公式和文本的选区', () => {
  // 选中 "loss $L_{train}$ is" 这样的混合选区
  const canonicalText = 'the loss $L_{train}$ is defined'
  const start = canonicalText.indexOf('loss')
  const end = canonicalText.indexOf(' is') + ' is'.length
  const anchor = buildPaperTextAnchor(canonicalText, start, end)

  // 在含公式空格的文本中查找
  const originalText = 'the loss $ L_{train} $ is defined'
  const recoveredOffset = findPaperTextAnchorOffset(originalText, anchor)

  assert.equal(recoveredOffset, originalText.indexOf('loss'))
})

test('mapPaperTextAnchorBetweenTexts 精确映射仅公式空格不同的文本', () => {
  // canonical text（无空格）→ originalText（有空格）
  const canonicalText = 'loss = $L_{train}$ defined'
  const originalText = 'loss = $ L_{train} $ defined'

  const start = canonicalText.indexOf('$L_{train}$')
  const end = start + '$L_{train}$'.length
  const sourceAnchor = buildPaperTextAnchor(canonicalText, start, end)

  const mapped = mapPaperTextAnchorBetweenTexts(canonicalText, originalText, sourceAnchor)

  assert.ok(mapped)
  assert.ok(mapped.confidence >= 0.9)
  // 映射后应该选中 originalText 中的公式区域
  assert.equal(
    originalText.slice(mapped.anchor.startOffset, mapped.anchor.endOffset),
    '$ L_{train} $'
  )
})

test('mapPaperTextAnchorBetweenTexts 精确映射跨公式和文本的选区', () => {
  const canonicalText = 'the loss $L_{train}$ is defined'
  const originalText = 'the loss $ L_{train} $ is defined'

  const start = canonicalText.indexOf('loss')
  const end = canonicalText.indexOf(' defined')
  const sourceAnchor = buildPaperTextAnchor(canonicalText, start, end)

  const mapped = mapPaperTextAnchorBetweenTexts(canonicalText, originalText, sourceAnchor)

  assert.ok(mapped)
  assert.ok(mapped.confidence >= 0.9)
  // 映射后的文本应该包含公式和周围文本
  assert.equal(
    originalText.slice(mapped.anchor.startOffset, mapped.anchor.endOffset),
    'loss $ L_{train} $ is'
  )
})

test('mapPaperTextAnchorBetweenTexts 对真正不同的文本仍用比例映射', () => {
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
