import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperLayoutBlock, PaperPageOcrResult } from '../../../shared/types/paper.ts'
import {
  buildReaderMarkdown,
  extractPaperFigureData,
  type ExtractedPaperFigureData
} from './paperFigureExtractor.ts'

function createTextBlock(
  index: number,
  content: string,
  bbox = { x: 120, y: 100, width: 600, height: 40 },
  pageIndex = 0
): PaperLayoutBlock {
  return {
    index,
    pageIndex,
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
  bbox = { x: 120, y: 200, width: 420, height: 280 },
  pageIndex = 0
): PaperLayoutBlock {
  return {
    index,
    pageIndex,
    label: 'image',
    content: url,
    bbox,
    width: 1224,
    height: 1584
  }
}

function createTableBlock(
  index: number,
  content: string,
  bbox = { x: 120, y: 200, width: 720, height: 280 },
  pageIndex = 0
): PaperLayoutBlock {
  return {
    index,
    pageIndex,
    label: 'table',
    content,
    bbox,
    width: 1224,
    height: 1584
  }
}

function extractFigureData(pageResults: PaperPageOcrResult[]): ExtractedPaperFigureData {
  return extractPaperFigureData(pageResults, {
    resolveImagePath: (_pageResult, block) =>
      block.localAssetPath || block.remoteAssetUrl || block.content
  })
}

function extractFigures(pageResult: PaperPageOcrResult): ExtractedPaperFigureData {
  return extractFigureData([pageResult])
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
  assert.doesNotMatch(readerMarkdown, /Figure 1:/)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})

test('图片块切开的英文续写正文会重新合并为同一段', () => {
  const imageUrl = 'https://example.com/figure-continuation.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-continuation',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'In the downstream task',
      `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nFigure 3: Detection benchmark.\n\n</div>',
      'of object detection, CNNs and Transformer structures are predominantly used.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'In the downstream task', { x: 120, y: 80, width: 420, height: 40 }),
      createImageBlock(1, imageUrl),
      createTextBlock(2, '<div align="center">\n\nFigure 3: Detection benchmark.\n\n</div>'),
      createTextBlock(
        3,
        'of object detection, CNNs and Transformer structures are predominantly used.',
        { x: 120, y: 620, width: 720, height: 40 }
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /In the downstream task of object detection, CNNs and Transformer structures are predominantly used\./
  )
  assert.doesNotMatch(readerMarkdown, /task\s*\n\s*\n\s*of object detection/)
  assert.doesNotMatch(readerMarkdown, /Figure 3:/)
})

test('图片块结束后如果进入新段落，则保留段落分隔', () => {
  const imageUrl = 'https://example.com/figure-paragraph.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-paragraph',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'The method achieves strong results.',
      `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nFigure 4: Quantitative comparison.\n\n</div>',
      'However, the training cost remains high.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'The method achieves strong results.'),
      createImageBlock(1, imageUrl),
      createTextBlock(2, '<div align="center">\n\nFigure 4: Quantitative comparison.\n\n</div>'),
      createTextBlock(3, 'However, the training cost remains high.', {
        x: 120,
        y: 620,
        width: 680,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /The method achieves strong results\.\n\nHowever, the training cost remains high\./
  )
})

test('同页 OCR 断开的正文续写会重新合并为同一段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-continuation',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '# Related Work',
      '**Real-Time Object Detectors** Early performance improvements in YOLO were closely related to improvements in the backbone and led to the widespread adoption of DarkNet. YOLOv7 (Wang, Bochkovskiy, and Liao 2023) proposes the E-ELAN structure to enhance the model capability without destroying the original. YOLO8 (Jocher, Chaurasia,',
      'and Qiu 2023) combines the features of the previous generations of YOLOs and adopts the CSPDarknet53 to 2-Stage FPN (C2f) structure with richer gradient streams.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, '# Related Work'),
      createTextBlock(
        1,
        '**Real-Time Object Detectors** Early performance improvements in YOLO were closely related to improvements in the backbone and led to the widespread adoption of DarkNet. YOLOv7 (Wang, Bochkovskiy, and Liao 2023) proposes the E-ELAN structure to enhance the model capability without destroying the original. YOLO8 (Jocher, Chaurasia,',
        { x: 80, y: 1260, width: 520, height: 120 }
      ),
      createTextBlock(
        2,
        'and Qiu 2023) combines the features of the previous generations of YOLOs and adopts the CSPDarknet53 to 2-Stage FPN (C2f) structure with richer gradient streams.',
        { x: 640, y: 80, width: 500, height: 120 }
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /YOLO8 \(Jocher, Chaurasia, and Qiu 2023\) combines the features of the previous generations of YOLOs/
  )
  assert.doesNotMatch(readerMarkdown, /Chaurasia,\n\nand Qiu 2023/)
  assert.match(readerMarkdown, /# Related Work\n\n\*\*Real-Time Object Detectors\*\*/)
})

test('同页前段以未结束短语结尾、后段以小写连接词开头时会合并', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-and',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'The model improves feature fusion,',
      'and remains lightweight in practical deployment.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'The model improves feature fusion,'),
      createTextBlock(1, 'and remains lightweight in practical deployment.', {
        x: 620,
        y: 160,
        width: 420,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /The model improves feature fusion, and remains lightweight in practical deployment\./
  )
})

test('同页前段以连字符结尾时会无空格拼接', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-hyphen',
    pageIndex: 0,
    status: 'completed',
    markdown: ['cross-', 'scale interaction improves the detector.'].join('\n\n'),
    blocks: [
      createTextBlock(0, 'cross-'),
      createTextBlock(1, 'scale interaction improves the detector.', {
        x: 620,
        y: 160,
        width: 360,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /cross-scale interaction improves the detector\./)
  assert.doesNotMatch(readerMarkdown, /cross-\s+scale/)
})

test('同页正常新段落仍保留双换行', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-paragraph',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'The first paragraph ends with a complete sentence.',
      'However, the second paragraph should remain separate.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'The first paragraph ends with a complete sentence.'),
      createTextBlock(1, 'However, the second paragraph should remain separate.', {
        x: 620,
        y: 160,
        width: 440,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /The first paragraph ends with a complete sentence\.\n\nHowever, the second paragraph should remain separate\./
  )
})

test('独立展示公式块会原样保留，不会被并入正文段落', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-math-block',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'In Equation (1), $\\mathbf{A}\\in\\mathbb{R}^{N\\times N}$ represents the state transition matrix.',
      '$$',
      '\\overline {{\\mathbf {A}}} = \\exp (\\Delta \\mathbf {A})',
      '$$',
      'The discretized version can be defined as follows.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(
        0,
        'In Equation (1), $\\mathbf{A}\\in\\mathbb{R}^{N\\times N}$ represents the state transition matrix.'
      ),
      createTextBlock(1, '$$'),
      createTextBlock(2, '\\overline {{\\mathbf {A}}} = \\exp (\\Delta \\mathbf {A})'),
      createTextBlock(3, '$$'),
      createTextBlock(4, 'The discretized version can be defined as follows.')
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.ok(
    readerMarkdown.includes(
      '\n\n$$\n\n\\overline {{\\mathbf {A}}} = \\exp (\\Delta \\mathbf {A})\n\n$$\n\nThe discretized version can be defined as follows.'
    )
  )
  assert.doesNotMatch(readerMarkdown, /\$\$The discretized version/)
})

test('独立的单个数学定界符分行时会保持原有结构，不会污染后续正文', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-single-dollar',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'The update rule is defined as follows.',
      '$',
      '\\mathbf {h}_{t} = \\mathbf {A} \\mathbf {x}_{t}',
      '$',
      'The hidden state then evolves over time.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'The update rule is defined as follows.'),
      createTextBlock(1, '$'),
      createTextBlock(2, '\\mathbf {h}_{t} = \\mathbf {A} \\mathbf {x}_{t}'),
      createTextBlock(3, '$'),
      createTextBlock(4, 'The hidden state then evolves over time.')
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.ok(
    readerMarkdown.includes(
      '\n\n$\n\n\\mathbf {h}_{t} = \\mathbf {A} \\mathbf {x}_{t}\n\n$\n\nThe hidden state then evolves over time.'
    )
  )
  assert.doesNotMatch(readerMarkdown, /\$The hidden state/)
})

test('包含 inline math 的正文段不会被额外拼接到下一段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-math',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'In Equation (2), $\\mathbf{C}$ maps the hidden state to the output.',
      'The observation matrix remains fixed during inference.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'In Equation (2), $\\mathbf{C}$ maps the hidden state to the output.'),
      createTextBlock(1, 'The observation matrix remains fixed during inference.')
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /In Equation \(2\), \$\\mathbf\{C\}\$ maps the hidden state to the output\.\n\nThe observation matrix remains fixed during inference\./
  )
})

test('带 inline math 的半句正文不会被自动并到下一段，避免悬空定界符破坏样式', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-math-continuation',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'In Equation (4), $\\Delta$',
      'represents the timescale parameter that adjusts the temporal resolution of the model.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'In Equation (4), $\\Delta$'),
      createTextBlock(
        1,
        'represents the timescale parameter that adjusts the temporal resolution of the model.'
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /In Equation \(4\), \$\\Delta\$\n\nrepresents the timescale parameter that adjusts the temporal resolution of the model\./
  )
  assert.doesNotMatch(readerMarkdown, /\$ represents the timescale parameter/)
})

test('分页切开的英文续写正文会重新合并为同一段', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-continuation',
      pageIndex: 0,
      status: 'completed',
      markdown: 'In the downstream task',
      blocks: [createTextBlock(0, 'In the downstream task', { x: 120, y: 1460, width: 420, height: 40 }, 0)]
    },
    {
      paperId: 'paper-page-continuation',
      pageIndex: 1,
      status: 'completed',
      markdown: 'of object detection, CNNs are predominantly used.',
      blocks: [
        createTextBlock(
          0,
          'of object detection, CNNs are predominantly used.',
          { x: 120, y: 80, width: 560, height: 40 },
          1
        )
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(
    readerMarkdown,
    /In the downstream task\s*<!-- Page 2 -->\s*of object detection, CNNs are predominantly used\./
  )
  assert.doesNotMatch(readerMarkdown, /task\s*\n\s*\n\s*<!-- Page 2 -->/)
})

test('分页后如果确实进入新段落，则保留段落分隔', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-break',
      pageIndex: 0,
      status: 'completed',
      markdown: 'The method achieves strong results.',
      blocks: [createTextBlock(0, 'The method achieves strong results.', { x: 120, y: 1460, width: 520, height: 40 }, 0)]
    },
    {
      paperId: 'paper-page-break',
      pageIndex: 1,
      status: 'completed',
      markdown: 'However, the training cost remains high.',
      blocks: [
        createTextBlock(
          0,
          'However, the training cost remains high.',
          { x: 120, y: 80, width: 520, height: 40 },
          1
        )
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(
    readerMarkdown,
    /The method achieves strong results\.\n\n<!-- Page 2 -->\n\nHowever, the training cost remains high\./
  )
})

test('分页切开的连字符断词会无空格拼接', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-hyphen',
      pageIndex: 0,
      status: 'completed',
      markdown: 'self-',
      blocks: [createTextBlock(0, 'self-', { x: 120, y: 1460, width: 120, height: 40 }, 0)]
    },
    {
      paperId: 'paper-page-hyphen',
      pageIndex: 1,
      status: 'completed',
      markdown: 'attention improves global modeling.',
      blocks: [
        createTextBlock(
          0,
          'attention improves global modeling.',
          { x: 120, y: 80, width: 420, height: 40 },
          1
        )
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(readerMarkdown, /self-<!-- Page 2 -->attention improves global modeling\./)
  assert.doesNotMatch(readerMarkdown, /self-\s+<!-- Page 2 -->\s+attention/)
})

test('连字符断词被图片切断时会无空格拼接', () => {
  const imageUrl = 'https://example.com/figure-hyphen.png'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-hyphen',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'self-',
      `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
      '<div align="center">\n\nFigure 5: Attention map.\n\n</div>',
      'attention improves global modeling.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'self-', { x: 120, y: 80, width: 120, height: 40 }),
      createImageBlock(1, imageUrl),
      createTextBlock(2, '<div align="center">\n\nFigure 5: Attention map.\n\n</div>'),
      createTextBlock(3, 'attention improves global modeling.', {
        x: 120,
        y: 620,
        width: 480,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /self-attention improves global modeling\./)
  assert.doesNotMatch(readerMarkdown, /self-\s+attention/)
})

test('页尾图片清理后，下一页正文续写仍会跨页合并', () => {
  const imageUrl = 'https://example.com/figure-page-merge.png'
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-figure-merge',
      pageIndex: 0,
      status: 'completed',
      markdown: [
        'In the downstream task',
        `<div style='text-align: center;'><img src='${imageUrl}' alt='OCR图片'/></div>`,
        '<div align="center">\n\nFigure 6: Detection benchmark.\n\n</div>'
      ].join('\n\n'),
      blocks: [
        createTextBlock(0, 'In the downstream task', { x: 120, y: 1320, width: 420, height: 40 }, 0),
        createImageBlock(1, imageUrl, { x: 120, y: 1380, width: 320, height: 160 }, 0),
        createTextBlock(
          2,
          '<div align="center">\n\nFigure 6: Detection benchmark.\n\n</div>',
          { x: 140, y: 1540, width: 420, height: 32 },
          0
        )
      ]
    },
    {
      paperId: 'paper-page-figure-merge',
      pageIndex: 1,
      status: 'completed',
      markdown: 'of object detection, CNNs are predominantly used.',
      blocks: [
        createTextBlock(
          0,
          'of object detection, CNNs are predominantly used.',
          { x: 120, y: 80, width: 560, height: 40 },
          1
        )
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(
    readerMarkdown,
    /In the downstream task\s*<!-- Page 2 -->\s*of object detection, CNNs are predominantly used\./
  )
  assert.doesNotMatch(readerMarkdown, /Figure 6:/)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})

test('页首表格打断的跨页续写会先接正文再回插表格', () => {
  const tableMarkdown = '<table border="1"><tr><td>Method</td></tr></table>'
  const tableCaption = '<div align="center">\n\nTable 1: Comparison of methods.\n\n</div>'
  const continuation =
    '2023) and merges the sequences from the different directions so that the features are extracted to the global features.'
  const rgParagraph =
    'RG Block The original MLP is still the most widely adopted in this architecture.'

  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-table-merge',
      pageIndex: 0,
      status: 'completed',
      markdown:
        'The scan merge operation in SS2D takes the obtained sequences as inputs to the S6 block (Gu and Dao',
      blocks: [
        createTextBlock(
          0,
          'The scan merge operation in SS2D takes the obtained sequences as inputs to the S6 block (Gu and Dao',
          { x: 120, y: 1460, width: 520, height: 40 },
          0
        )
      ]
    },
    {
      paperId: 'paper-page-table-merge',
      pageIndex: 1,
      status: 'completed',
      markdown: [tableMarkdown, tableCaption, continuation, rgParagraph].join('\n\n'),
      blocks: [
        createTableBlock(0, tableMarkdown, { x: 120, y: 96, width: 880, height: 420 }, 1),
        createTextBlock(1, tableCaption, { x: 140, y: 544, width: 860, height: 80 }, 1),
        createTextBlock(2, continuation, { x: 120, y: 672, width: 460, height: 48 }, 1),
        createTextBlock(3, rgParagraph, { x: 120, y: 760, width: 460, height: 96 }, 1)
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(
    readerMarkdown,
    /Gu and Dao\s*<!-- Page 2 -->\s*2023\) and merges the sequences from the different directions/
  )

  const continuationIndex = readerMarkdown.indexOf(continuation)
  const tableIndex = readerMarkdown.indexOf(tableMarkdown)
  const rgParagraphIndex = readerMarkdown.indexOf(rgParagraph)

  assert.ok(continuationIndex >= 0)
  assert.ok(tableIndex > continuationIndex)
  assert.ok(rgParagraphIndex > tableIndex)
})

test('页首表格后若不是续写正文则保持原始顺序', () => {
  const tableMarkdown = '<table border="1"><tr><td>Method</td></tr></table>'
  const tableCaption = '<div align="center">\n\nTable 1: Comparison of methods.\n\n</div>'
  const nextParagraph = 'RG Block The original MLP is still the most widely adopted in this architecture.'

  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-table-stable',
      pageIndex: 0,
      status: 'completed',
      markdown: 'The previous section ends here.',
      blocks: [
        createTextBlock(
          0,
          'The previous section ends here.',
          { x: 120, y: 1460, width: 420, height: 40 },
          0
        )
      ]
    },
    {
      paperId: 'paper-page-table-stable',
      pageIndex: 1,
      status: 'completed',
      markdown: [tableMarkdown, tableCaption, nextParagraph].join('\n\n'),
      blocks: [
        createTableBlock(0, tableMarkdown, { x: 120, y: 96, width: 880, height: 420 }, 1),
        createTextBlock(1, tableCaption, { x: 140, y: 544, width: 860, height: 80 }, 1),
        createTextBlock(2, nextParagraph, { x: 120, y: 672, width: 460, height: 96 }, 1)
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(
    readerMarkdown,
    /The previous section ends here\.\n\n<!-- Page 2 -->\n\n<table border="1">/
  )

  const tableIndex = readerMarkdown.indexOf(tableMarkdown)
  const nextParagraphIndex = readerMarkdown.indexOf(nextParagraph)

  assert.ok(tableIndex >= 0)
  assert.ok(nextParagraphIndex > tableIndex)
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
  assert.match(readerMarkdown, /The network is composed of two branches\./)
  assert.doesNotMatch(readerMarkdown, /Encoder branch/)
  assert.doesNotMatch(readerMarkdown, /Decoder branch/)
  assert.doesNotMatch(readerMarkdown, /Figure 2:/)
})

test('HTML 包裹的居中标题断行会合并为同一段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-html-title-merge',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '<div align="center">\n\nDA-Mamba: Learning Domain-Aware State Space Model for Global-Local\n\n</div>',
      '<div align="center">\n\nAlignment in Domain Adaptive Object Detection\n\n</div>'
    ].join('\n\n'),
    blocks: [
      createTextBlock(
        0,
        '<div align="center">\n\nDA-Mamba: Learning Domain-Aware State Space Model for Global-Local\n\n</div>',
        { x: 96, y: 24, width: 1040, height: 56 }
      ),
      createTextBlock(
        1,
        '<div align="center">\n\nAlignment in Domain Adaptive Object Detection\n\n</div>',
        { x: 250, y: 92, width: 720, height: 56 }
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /DA-Mamba: Learning Domain-Aware State Space Model for Global-Local Alignment in Domain Adaptive Object Detection/
  )
  assert.doesNotMatch(readerMarkdown, /Global-Local\s*<\/div>\s*<div/)
})

test('HTML 包裹的普通正文断行会合并为同一段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-html-paragraph-merge',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '<div>In the downstream task</div>',
      '<p>of object detection, CNNs are predominantly used.</p>'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, '<div>In the downstream task</div>', {
        x: 120,
        y: 240,
        width: 420,
        height: 40
      }),
      createTextBlock(1, '<p>of object detection, CNNs are predominantly used.</p>', {
        x: 120,
        y: 296,
        width: 560,
        height: 40
      })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /In the downstream task of object detection, CNNs are predominantly used\./
  )
  assert.doesNotMatch(readerMarkdown, /task\s*<\/div>\s*<p>/)
})

test('单个纯文本块内部的 OCR 误断段会合并为同一段', () => {
  const content = [
    'stable domain-invariant features. This conclusion is further verified under larger domain discrepancies:',
    'when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only',
    'marginal gains [1.9% and 1.0%], whereas DA-Mamba maintains substantial improvements (5.7% and',
    '5.9%). Overall, DA-Mamba inherits the global',
    'modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-',
    'invariant representation learning under domain shift.'
  ].join('\n\n')

  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-single-block-paragraph-merge',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 180, width: 920, height: 240 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /stable domain-invariant features\. This conclusion is further verified under larger domain discrepancies: when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only marginal gains \[1\.9% and 1\.0%], whereas DA-Mamba maintains substantial improvements \(5\.7% and 5\.9%\)\. Overall, DA-Mamba inherits the global modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-invariant representation learning under domain shift\./
  )
  assert.doesNotMatch(readerMarkdown, /global\s*\n\s*\n\s*modeling/)
  assert.doesNotMatch(readerMarkdown, /domain-\s*\n\s*\n\s*invariant/)
})

test('单个纯文本块内部的单换行折行会被收拢为连续正文', () => {
  const content = [
    'stable domain-invariant features. This conclusion is further verified under larger domain discrepancies:',
    'when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only',
    'marginal gains [1.9% and 1.0%], whereas DA-Mamba maintains substantial improvements (5.7% and',
    '5.9%). Overall, DA-Mamba inherits the global',
    'modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-',
    'invariant representation learning under domain shift.'
  ].join('\n')

  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-single-block-line-wrap-merge',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 180, width: 920, height: 240 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /stable domain-invariant features\. This conclusion is further verified under larger domain discrepancies: when adapting under cross-style scenarios P → Clp and P → Cmc standard Mamba achieves only marginal gains \[1\.9% and 1\.0%], whereas DA-Mamba maintains substantial improvements \(5\.7% and 5\.9%\)\. Overall, DA-Mamba inherits the global modeling strength of Mamba while grounding it in convolutional local priors, achieving robust domain-invariant representation learning under domain shift\./
  )
  assert.doesNotMatch(readerMarkdown, /global\s*\n\s*modeling/)
  assert.doesNotMatch(readerMarkdown, /domain-\s*\n\s*invariant/)
})

test('单个简单 HTML 文本块内部的断段会按正文规则合并', () => {
  const content =
    '<div>In the downstream task\n\nof object detection, CNNs are predominantly used.</div>'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-single-html-block-merge',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 220, width: 620, height: 72 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /In the downstream task of object detection, CNNs are predominantly used\./
  )
  assert.doesNotMatch(readerMarkdown, /<div>/)
})

test('参考文献标题与相邻文献条目之间会保留分段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-reference-blocks',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      'References',
      '[1] Shengcao Cao and Yu-Xiong Wang. Contrastive mean teacher for domain adaptive object detectors. In CVPR, 2023. 7',
      '[2] Yue Cao and Han Hu. Gcnet: Non-local networks meet squeeze-excitation networks and beyond. In ICCV, 2019.'
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, 'References', { x: 120, y: 120, width: 260, height: 44 }),
      createTextBlock(
        1,
        '[1] Shengcao Cao and Yu-Xiong Wang. Contrastive mean teacher for domain adaptive object detectors. In CVPR, 2023. 7',
        { x: 120, y: 220, width: 980, height: 72 }
      ),
      createTextBlock(
        2,
        '[2] Yue Cao and Han Hu. Gcnet: Non-local networks meet squeeze-excitation networks and beyond. In ICCV, 2019.',
        { x: 120, y: 320, width: 980, height: 72 }
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /References\n\n\[1\] Shengcao Cao/)
  assert.match(readerMarkdown, /2023\. 7\n\n\[2\] Yue Cao/)
  assert.doesNotMatch(readerMarkdown, /References \[1\]/)
  assert.doesNotMatch(readerMarkdown, /2023\. 7 \[2\]/)
})

test('单个文本块内部的参考文献条目不会被重新并成一段', () => {
  const content = [
    'References',
    '[1] Shengcao Cao and Yu-Xiong Wang. Contrastive mean teacher for domain adaptive object detectors. In CVPR, 2023. 7',
    '[2] Yue Cao and Han Hu. Gcnet: Non-local networks meet squeeze-excitation networks and beyond. In ICCV, 2019.'
  ].join('\n\n')

  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-reference-single-block',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 120, width: 980, height: 220 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /References\n\n\[1\] Shengcao Cao/)
  assert.match(readerMarkdown, /2023\. 7\n\n\[2\] Yue Cao/)
  assert.doesNotMatch(readerMarkdown, /References \[1\]/)
  assert.doesNotMatch(readerMarkdown, /2023\. 7 \[2\]/)
})

test('单个文本块内部的参考文献单换行边界也会保留', () => {
  const content = [
    'References',
    '[1] Shengcao Cao and Yu-Xiong Wang. Contrastive mean teacher for domain adaptive object detectors. In CVPR, 2023. 7',
    '[2] Yue Cao and Han Hu. Gcnet: Non-local networks meet squeeze-excitation networks and beyond. In ICCV, 2019.'
  ].join('\n')

  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-reference-single-line-breaks',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 120, width: 980, height: 220 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /References\n\n\[1\] Shengcao Cao/)
  assert.match(readerMarkdown, /2023\. 7\n\n\[2\] Yue Cao/)
  assert.doesNotMatch(readerMarkdown, /References \[1\]/)
  assert.doesNotMatch(readerMarkdown, /2023\. 7 \[2\]/)
})

test('居中作者行与单位行间距较大时不会误并', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-author-affiliation-separate',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '<div align="center">\n\nHaochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2\n\n</div>',
      '<div align="center">\n\n1 Intelligent Software Research Center, Institute of Software, CAS\n\n</div>'
    ].join('\n\n'),
    blocks: [
      createTextBlock(
        0,
        '<div align="center">\n\nHaochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2\n\n</div>',
        { x: 180, y: 238, width: 860, height: 48 }
      ),
      createTextBlock(
        1,
        '<div align="center">\n\n1 Intelligent Software Research Center, Institute of Software, CAS\n\n</div>',
        { x: 180, y: 340, width: 860, height: 40 }
      )
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(
    readerMarkdown,
    /Haochen Li 1,4 Rui Zhang 2\* Hantao Yao 3 Xin Zhang 2[\s\S]*\n\n[\s\S]*1 Intelligent Software Research Center, Institute of Software, CAS/
  )
  assert.doesNotMatch(
    readerMarkdown,
    /Haochen Li 1,4 Rui Zhang 2\* Hantao Yao 3 Xin Zhang 2 1 Intelligent Software Research Center/
  )
})

test('结构性 HTML 块不会参与正文并段', () => {
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-structural-html',
    pageIndex: 0,
    status: 'completed',
    markdown: ['<ul><li>First item</li></ul>', 'continues here.'].join('\n\n'),
    blocks: [
      createTextBlock(0, '<ul><li>First item</li></ul>', { x: 120, y: 180, width: 260, height: 60 }),
      createTextBlock(1, 'continues here.', { x: 120, y: 280, width: 240, height: 40 })
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /<ul><li>First item<\/li><\/ul>\n\ncontinues here\./)
  assert.doesNotMatch(readerMarkdown, /First item continues here\./)
})

test('单个结构性 HTML 文本块内部断段时仍保持原结构', () => {
  const content = '<ul><li>First item</li></ul>\n\ncontinues here.'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-single-structural-html',
    pageIndex: 0,
    status: 'completed',
    markdown: content,
    blocks: [createTextBlock(0, content, { x: 120, y: 180, width: 360, height: 88 })]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /<ul><li>First item<\/li><\/ul>\n\ncontinues here\./)
  assert.doesNotMatch(readerMarkdown, /First item continues here\./)
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
      createTextBlock(
        3,
        'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2',
        { x: 180, y: 238, width: 860, height: 48 }
      ),
      createTextBlock(
        4,
        '1Intelligent Software Research Center, Institute of Software, CAS',
        { x: 180, y: 340, width: 860, height: 40 }
      )
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

  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)
  assert.doesNotMatch(readerMarkdown, /img src=/)
})
