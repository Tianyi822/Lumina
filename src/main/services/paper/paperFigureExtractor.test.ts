import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperLayoutBlock, PaperPageOcrResult } from '../../../shared/types/paper'
import {
  buildReaderMarkdown,
  extractPaperFigureData,
  type ExtractedPaperFigureData
} from './paperFigureExtractor'

function createTextBlock(
  index: number,
  content: string,
  bbox = { x: 120, y: 100, width: 600, height: 40 }
): PaperLayoutBlock {
  return {
    index,
    pageIndex: 0,
    label: 'text',
    content,
    bbox,
    width: 1224,
    height: 1584
  }
}

function createImageBlock(
  index: number,
  url: string,
  bbox = { x: 120, y: 200, width: 420, height: 280 }
): PaperLayoutBlock {
  return {
    index,
    pageIndex: 0,
    label: 'image',
    content: url,
    bbox,
    width: 1224,
    height: 1584
  }
}

function extractFigures(pageResult: PaperPageOcrResult): ExtractedPaperFigureData {
  return extractPaperFigureData([pageResult], {
    resolveImagePath: (_pageResult, block) =>
      block.localAssetPath || block.remoteAssetUrl || block.content
  })
}

test('单图与主图注可以正确提取并从阅读版正文移除', () => {
  const imageUrl = 'https://example.com/figure-1.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-1',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '前置正文。',
      `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nFigure 1: Overview of the method.\n\n</div>',
      '后置正文。'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, '前置正文。', { x: 120, y: 80, width: 400, height: 40 }),
      createImageBlock(1, imageUrl),
      createTextBlock(2, '<div align="center">\n\nFigure 1: Overview of the method.\n\n</div>'),
      createTextBlock(3, '后置正文。', { x: 120, y: 620, width: 400, height: 40 })
    ]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 1)
  assert.equal(extracted.figures[0].caption, 'Figure 1: Overview of the method.')

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted.pageRemovalBlockIndexes)
  assert.match(readerMarkdown, /前置正文。/)
  assert.match(readerMarkdown, /后置正文。/)
  assert.doesNotMatch(readerMarkdown, /Figure 1:/)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})

test('多图共享同一主图注，子图标注会绑定到各自图片', () => {
  const firstUrl = 'https://example.com/figure-2a.png'
  const secondUrl = 'https://example.com/figure-2b.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-2',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      `<div style='text-align: center;'><img src='${firstUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\n(a) Encoder branch\n\n</div>',
      `<div style='text-align: center;'><img src='${secondUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\n(b) Decoder branch\n\n</div>',
      '<div align="center">\n\nFigure 2: Architecture details.\n\n</div>'
    ].join('\n\n'),
    blocks: [
      createImageBlock(0, firstUrl, { x: 80, y: 160, width: 260, height: 220 }),
      createTextBlock(1, '<div align="center">\n\n(a) Encoder branch\n\n</div>', {
        x: 96,
        y: 400,
        width: 220,
        height: 32
      }),
      createImageBlock(2, secondUrl, { x: 400, y: 160, width: 260, height: 220 }),
      createTextBlock(3, '<div align="center">\n\n(b) Decoder branch\n\n</div>', {
        x: 420,
        y: 400,
        width: 220,
        height: 32
      }),
      createTextBlock(4, '<div align="center">\n\nFigure 2: Architecture details.\n\n</div>', {
        x: 140,
        y: 460,
        width: 520,
        height: 48
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 2)
  assert.equal(extracted.figures[0].caption, 'Figure 2: Architecture details.')
  assert.equal(extracted.figures[1].caption, 'Figure 2: Architecture details.')
  assert.equal(extracted.figures[0].subCaption, '(a) Encoder branch')
  assert.equal(extracted.figures[1].subCaption, '(b) Decoder branch')

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted.pageRemovalBlockIndexes)
  assert.doesNotMatch(readerMarkdown, /Encoder branch/)
  assert.doesNotMatch(readerMarkdown, /Decoder branch/)
  assert.doesNotMatch(readerMarkdown, /Figure 2:/)
})

test('无主图注时可以按图片组落地并保留后续正文', () => {
  const imageUrl = 'https://example.com/figure-3.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-3',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nTarget Domain\n\n</div>',
      '这里开始恢复正文内容。'
    ].join('\n\n'),
    blocks: [
      createImageBlock(0, imageUrl),
      createTextBlock(1, '<div align="center">\n\nTarget Domain\n\n</div>', {
        x: 160,
        y: 520,
        width: 340,
        height: 28
      }),
      createTextBlock(2, '这里开始恢复正文内容。', { x: 120, y: 640, width: 500, height: 40 })
    ]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 1)
  assert.equal(extracted.figures[0].caption, '')
  assert.equal(extracted.figures[0].subCaption, 'Target Domain')

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted.pageRemovalBlockIndexes)
  assert.match(readerMarkdown, /这里开始恢复正文内容。/)
  assert.doesNotMatch(readerMarkdown, /Target Domain/)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})

test('图片块只在 content 中提供远程 URL 时也能作为图片源处理', () => {
  const imageUrl = 'https://example.com/figure-4.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-4',
    pageIndex: 0,
    status: 'completed',
    markdown: `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
    blocks: [createImageBlock(0, imageUrl)]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 1)
  assert.equal(extracted.figures[0].imagePath, imageUrl)

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted.pageRemovalBlockIndexes)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})
