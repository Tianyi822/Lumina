import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'
import {
  getBlockImageSourceCandidates,
  getPlainText,
  isFigureCaptionBlock,
  isFigureSupportBlock,
  isTableCaptionBlock,
  shouldIgnoreCaptionlessFigureGroup
} from './paperBlockClassifiers.ts'
import type { PendingFigureImage } from './paperFigureExtractorTypes.ts'
import { createImageBlock, createTextBlock } from './paperFigureExtractor.testUtils.ts'

test('getPlainText 会清理 HTML、Markdown 与实体字符', () => {
  const content = '<div>**Figure 1**&nbsp;Overview<br/>line</div>'
  assert.equal(getPlainText(content), 'Figure 1 Overview line')
})

test('图注与表注块可以被正确识别', () => {
  const figureCaption = createTextBlock(
    0,
    '<div align="center">\n\nFigure 3: Detection benchmark.\n\n</div>'
  )
  const tableCaption = createTextBlock(
    1,
    '<div align="center">\n\nTable 1: Comparison of methods.\n\n</div>'
  )
  const plainText = createTextBlock(2, 'This is a normal paragraph.')

  assert.equal(isFigureCaptionBlock(figureCaption), true)
  assert.equal(isTableCaptionBlock(tableCaption), true)
  assert.equal(isFigureCaptionBlock(plainText), false)
  assert.equal(isTableCaptionBlock(plainText), false)
})

test('居中且较短的辅助说明会被识别为图片 support block', () => {
  const supportBlock = createTextBlock(0, '<div align="center">\n\n(a) Encoder branch\n\n</div>', {
    x: 96,
    y: 400,
    width: 220,
    height: 32
  })
  const bodyBlock = createTextBlock(
    1,
    'This paragraph is too long and too wide to be treated as a figure support block.',
    { x: 120, y: 520, width: 760, height: 48 }
  )

  assert.equal(isFigureSupportBlock(supportBlock), true)
  assert.equal(isFigureSupportBlock(bodyBlock), false)
})

test('远程图片 URL 会被纳入候选图片源', () => {
  const remoteUrl = 'https://example.com/figure.png'
  const block = createImageBlock(0, remoteUrl)

  assert.deepEqual(getBlockImageSourceCandidates(block), [remoteUrl])
})

test('首页标题区的装饰图片组会被忽略，不进入图库', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-title-icon',
    pageIndex: 0,
    status: 'completed',
    markdown: '',
    blocks: []
  }
  const pendingImages: PendingFigureImage[] = [
    {
      block: createImageBlock(0, 'https://example.com/title-icon.png', {
        x: 24,
        y: 18,
        width: 56,
        height: 64
      }),
      imagePath: 'https://example.com/title-icon.png',
      supportBlocks: [
        createTextBlock(1, 'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2', {
          x: 180,
          y: 238,
          width: 860,
          height: 48
        }),
        createTextBlock(2, '1 Intelligent Software Research Center, Institute of Software, CAS', {
          x: 180,
          y: 340,
          width: 860,
          height: 40
        })
      ]
    }
  ]

  assert.equal(shouldIgnoreCaptionlessFigureGroup(pageResult, pendingImages), true)
})
