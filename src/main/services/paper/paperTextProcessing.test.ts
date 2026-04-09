import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getBodyBlockGapReplacement,
  getTextFlowReplacement,
  normalizeMergeableTextBlockContent,
  shouldMergeAdjacentTextBlocks
} from './paperTextProcessing.ts'
import { createTextBlock } from './paperFigureExtractor.testUtils.ts'

test('文本流替换规则会处理续写、小写连接词和连字符断词', () => {
  assert.equal(
    getTextFlowReplacement('In the downstream task', 'of object detection', 'of object detection'),
    ' '
  )
  assert.equal(getTextFlowReplacement('cross-', 'scale interaction', 'scale interaction'), '')
  assert.equal(
    getTextFlowReplacement(
      'The method achieves strong results.',
      'However, the training cost remains high.',
      'However, the training cost remains high.'
    ),
    '\n\n'
  )
})

test('相邻正文块会在续写场景下合并，在新段落场景下保留间隔', () => {
  const previousContinuationBlock = createTextBlock(0, 'The model improves feature fusion,')
  const previousParagraphBlock = createTextBlock(1, 'The method achieves strong results.')
  const nextContinuation = createTextBlock(1, 'and remains lightweight in practical deployment.', {
    x: 620,
    y: 160,
    width: 420,
    height: 40
  })
  const nextParagraph = createTextBlock(
    2,
    'However, the second paragraph should remain separate.',
    {
      x: 620,
      y: 160,
      width: 440,
      height: 40
    }
  )

  assert.equal(shouldMergeAdjacentTextBlocks(previousContinuationBlock, nextContinuation), true)
  assert.equal(getBodyBlockGapReplacement(previousContinuationBlock, nextContinuation), ' ')
  assert.equal(shouldMergeAdjacentTextBlocks(previousParagraphBlock, nextParagraph), false)
  assert.equal(getBodyBlockGapReplacement(previousParagraphBlock, nextParagraph), '\n\n')
})

test('包含 inline math 的正文块不会被自动并到下一段', () => {
  const mathBlock = createTextBlock(
    0,
    'In Equation (2), $\\mathbf{C}$ maps the hidden state to the output.'
  )
  const nextBlock = createTextBlock(1, 'The observation matrix remains fixed during inference.')

  assert.equal(shouldMergeAdjacentTextBlocks(mathBlock, nextBlock), false)
  assert.equal(getBodyBlockGapReplacement(mathBlock, nextBlock), '\n\n')
})

test('普通纯文本块内部的 OCR 误断段会被收拢为连续正文', () => {
  const content = [
    'stable domain-invariant features. This conclusion is further verified under larger domain discrepancies:',
    'when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only',
    'marginal gains [1.9% and 1.0%], whereas DA-Mamba maintains substantial improvements (5.7% and',
    '5.9%). Overall, DA-Mamba inherits the global',
    'modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-',
    'invariant representation learning under domain shift.'
  ].join('\n')

  const normalized = normalizeMergeableTextBlockContent(content)

  assert.match(
    normalized,
    /stable domain-invariant features\. This conclusion is further verified under larger domain discrepancies: when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only marginal gains \[1\.9% and 1\.0%], whereas DA-Mamba maintains substantial improvements \(5\.7% and 5\.9%\)\. Overall, DA-Mamba inherits the global modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-invariant representation learning under domain shift\./
  )
  assert.doesNotMatch(normalized, /global\s*\n\s*modeling/)
  assert.doesNotMatch(normalized, /domain-\s*\n\s*invariant/)
})

test('简单 HTML 文本块内部的断段会按正文规则合并', () => {
  const content =
    '<div>In the downstream task\n\nof object detection, CNNs are predominantly used.</div>'
  const normalized = normalizeMergeableTextBlockContent(content)

  assert.equal(
    normalized,
    'In the downstream task of object detection, CNNs are predominantly used.'
  )
})

test('参考文献标题与相邻条目边界会被保留', () => {
  const content = [
    'References',
    '[1] Shengcao Cao and Yu-Xiong Wang. Contrastive mean teacher for domain adaptive object detectors. In CVPR, 2023. 7',
    '[2] Yue Cao and Han Hu. Gcnet: Non-local networks meet squeeze-excitation networks and beyond. In ICCV, 2019.'
  ].join('\n')

  const normalized = normalizeMergeableTextBlockContent(content)

  assert.match(normalized, /References\n\n\[1\] Shengcao Cao/)
  assert.match(normalized, /2023\. 7\n\n\[2\] Yue Cao/)
})

test('结构性 HTML 块不会被误当作可并段正文', () => {
  const content = '<ul><li>First item</li></ul>\n\ncontinues here.'
  assert.equal(normalizeMergeableTextBlockContent(content), content)
})
