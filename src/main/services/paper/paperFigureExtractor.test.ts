import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'
import { buildReaderMarkdown } from './paperFigureExtractor.ts'
import {
  createImageBlock,
  createTextBlock,
  extractFigures
} from './paperFigureExtractor.testUtils.ts'

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
  assert.deepEqual(extracted.pageRemovalGroups[0], [
    {
      groupId: 'paper-1:0:1',
      startBlockIndex: 1,
      endBlockIndex: 2,
      blockIndexes: [1, 2]
    }
  ])

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  assert.match(readerMarkdown, /前置正文。/)
  assert.match(readerMarkdown, /后置正文。/)
  assert.match(readerMarkdown, /Figure 1: Overview of the method/)
  assert.match(readerMarkdown, /img src=['"]https:\/\/example\.com\/figure-1\.png['"]/)
})

test('多图共享同一主图注时不会把正文错误并入图注块', () => {
  const firstUrl = 'https://example.com/figure-2a.png'
  const secondUrl = 'https://example.com/figure-2b.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-2',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'The network is composed of',
      `<div style='text-align: center;'><img src='${firstUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\n(a) Encoder branch\n\n</div>',
      `<div style='text-align: center;'><img src='${secondUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\n(b) Decoder branch\n\n</div>',
      '<div align="center">\n\nFigure 2: Architecture details.\n\n</div>',
      'two branches.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'The network is composed of', {
        x: 120,
        y: 80,
        width: 320,
        height: 40
      }),
      createImageBlock(1, firstUrl, { x: 80, y: 160, width: 260, height: 220 }),
      createTextBlock(2, '<div align="center">\n\n(a) Encoder branch\n\n</div>', {
        x: 96,
        y: 400,
        width: 220,
        height: 32
      }),
      createImageBlock(3, secondUrl, { x: 400, y: 160, width: 260, height: 220 }),
      createTextBlock(4, '<div align="center">\n\n(b) Decoder branch\n\n</div>', {
        x: 420,
        y: 400,
        width: 220,
        height: 32
      }),
      createTextBlock(5, '<div align="center">\n\nFigure 2: Architecture details.\n\n</div>', {
        x: 140,
        y: 460,
        width: 520,
        height: 48
      }),
      createTextBlock(6, 'two branches.', { x: 120, y: 560, width: 220, height: 40 })
    ]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 2)
  assert.equal(extracted.figures[0].caption, 'Figure 2: Architecture details.')
  assert.equal(extracted.figures[1].caption, 'Figure 2: Architecture details.')
  assert.equal(extracted.figures[0].subCaption, '(a) Encoder branch')
  assert.equal(extracted.figures[1].subCaption, '(b) Decoder branch')

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  // 图片块保留后，前后正文不再跨图片合并；子图注、主图注与图片标记都保留在正文中
  assert.match(readerMarkdown, /The network is composed of/)
  assert.match(readerMarkdown, /two branches\./)
  assert.match(readerMarkdown, /\(a\) Encoder branch/)
  assert.match(readerMarkdown, /\(b\) Decoder branch/)
  assert.match(readerMarkdown, /Figure 2: Architecture details/)
  assert.match(readerMarkdown, /img src=['"]https:\/\/example\.com\/figure-2a\.png['"]/)
  assert.match(readerMarkdown, /img src=['"]https:\/\/example\.com\/figure-2b\.png['"]/)
})

test('首页标题中的装饰图片不会被错误收集进图库', () => {
  const imageUrl = 'https://example.com/title-icon.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-title-icon',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      `<div><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nDA-Mamba: Learning Domain-Aware State Space Model for Global-Local\n\n</div>',
      '<div align="center">\n\nAlignment in Domain Adaptive Object Detection\n\n</div>',
      'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2',
      '1Intelligent Software Research Center, Institute of Software, CAS'
    ].join('\n\n'),
    blocks: [
      createImageBlock(0, imageUrl, { x: 24, y: 18, width: 56, height: 64 }),
      createTextBlock(
        1,
        '<div align="center">\n\nDA-Mamba: Learning Domain-Aware State Space Model for Global-Local\n\n</div>',
        { x: 96, y: 24, width: 1040, height: 56 }
      ),
      createTextBlock(
        2,
        '<div align="center">\n\nAlignment in Domain Adaptive Object Detection\n\n</div>',
        { x: 250, y: 92, width: 720, height: 56 }
      ),
      createTextBlock(3, 'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2', {
        x: 180,
        y: 238,
        width: 860,
        height: 48
      }),
      createTextBlock(4, '1Intelligent Software Research Center, Institute of Software, CAS', {
        x: 180,
        y: 340,
        width: 860,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  assert.equal(extracted.figures.length, 0)
  assert.deepEqual(extracted.pageRemovalBlockIndexes[0], [])
  assert.deepEqual(extracted.pageRemovalGroups[0], [])

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  assert.match(
    readerMarkdown,
    /DA-Mamba: Learning Domain-Aware State Space Model for Global-Local Alignment in Domain Adaptive Object Detection/
  )
  assert.match(readerMarkdown, /Haochen Li 1,4 Rui Zhang 2\* Hantao Yao 3 Xin Zhang 2/)
  assert.match(
    readerMarkdown,
    /Haochen Li 1,4 Rui Zhang 2\* Hantao Yao 3 Xin Zhang 2[\s\S]*\n\n[\s\S]*1Intelligent Software Research Center, Institute of Software, CAS/
  )
  assert.match(readerMarkdown, /title-icon\.png/)
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

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  assert.match(readerMarkdown, /这里开始恢复正文内容。/)
  assert.match(readerMarkdown, /Target Domain/)
  assert.match(readerMarkdown, /img src=['"]https:\/\/example\.com\/figure-3\.png['"]/)
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

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  assert.match(readerMarkdown, /img src=['"]https:\/\/example\.com\/figure-4\.png['"]/)
})
