import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'
import { buildPaperTocOutline } from '../../../shared/utils/paperTranslation.ts'
import { buildReaderDocument, buildReaderMarkdown } from './paperFigureExtractor.ts'
import {
  createImageBlock,
  createTableBlock,
  createTextBlock,
  extractFigureData,
  extractFigures
} from './paperFigureExtractor.testUtils.ts'

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

test('含行内公式的同页换栏正文续写会重新合并为同一段', () => {
  const leadingText =
    'Few-shot medical image segmentation aims to train a model capable of achieving effective and accurate segmentation of novel classes using only a limited number of images and annotations. Specifically, the dataset is divided into a training set $ \\mathcal{D}_{train} $ and a test set $ \\mathcal{D}_{test} $ . $ \\mathcal{D}_{train} $ contains a sufficient number of images and annotations for a base class set $ \\mathcal{C}_{base} $ , while $ \\mathcal{D}_{test} $ includes only a limited number of annotated images for a novel class set $ \\mathcal{C}_{novel} $ , where $ \\mathcal{C}_{base} \\cap \\mathcal{C}_{novel} = \\emptyset $ . To train our model, we follow the episode training method [15] commonly used in few-shot semantic segmentation. For each N-way K-shot'
  const continuationText =
    'few-shot segmentation task, we divide both the training and test sets $\\mathcal{D}_{train/test} = \\{S, Q\\}$ into a support set $S = \\{(I_s^i, M_s^i)\\}_{i=1}^K$ and a query set $Q = \\{(I_q, M_q)\\}$ where $I$ denotes the image and $M$ denotes the corresponding segmentation mask.'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-inline-math-column-continuation',
    pageIndex: 2,
    status: 'completed',
    markdown: [leadingText, continuationText].join('\n\n'),
    blocks: [
      createTextBlock(5, leadingText, { x: 90, y: 1262, width: 514, height: 240 }, 2),
      createTextBlock(6, continuationText, { x: 617, y: 114, width: 513, height: 242 }, 2)
    ]
  }

  const extracted = extractFigures(pageResult)
  const readerMarkdown = buildReaderMarkdown([pageResult], extracted)

  assert.match(readerMarkdown, /For each N-way K-shot few-shot segmentation task/)
  assert.doesNotMatch(readerMarkdown, /For each N-way K-shot\s*\n\s*\n\s*few-shot/)
})

test('HTML 包裹标题不会与作者和摘要合并为同一个标题', () => {
  const title = [
    '<div align="center">',
    '',
    '# Uncertainty-Guided Prototype Reliability Enhancement Network for Few-Shot Medical Image Segmentation',
    '',
    '</div>'
  ].join('\n')
  const authors =
    'Junfei Hu, Tao Zhou, Senior Member, IEEE, Kaiwen Huang, Yi Zhou, Senior Member, IEEE, Haofeng Zhang, Senior Member, IEEE, Boqiang Fan, and Huazhu Fu, Senior Member, IEEE'
  const abstract =
    'Abstract—Few-Shot Learning (FSL) has garnered increasing attention for data-scarce scenarios, particularly in medical segmentation tasks where only a few labeled data points are available.'
  const indexTerms =
    'Index Terms—Few-shot learning, medical image segmentation, prototype enhancement, reliable dynamic fusion.'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-front-matter-boundary',
    pageIndex: 0,
    status: 'completed',
    markdown: [title, authors, abstract, 'I. INTRODUCTION', indexTerms].join('\n\n'),
    blocks: [
      createTextBlock(0, title, { x: 90, y: 54, width: 1020, height: 112 }),
      createTextBlock(1, authors, { x: 118, y: 172, width: 980, height: 118 }),
      createTextBlock(2, abstract, { x: 118, y: 320, width: 980, height: 180 }),
      createTextBlock(3, 'I. INTRODUCTION', { x: 118, y: 640, width: 360, height: 40 }),
      createTextBlock(4, indexTerms, { x: 118, y: 720, width: 820, height: 56 })
    ]
  }

  const figureData = extractFigureData([pageResult])
  const readerDocument = buildReaderDocument(
    'paper-front-matter-boundary',
    [pageResult],
    figureData
  )

  assert.match(
    readerDocument.markdown,
    /^<!-- Page 1 -->\n\n# Uncertainty-Guided Prototype Reliability Enhancement Network for Few-Shot Medical Image Segmentation\n\nJunfei Hu/
  )
  assert.match(readerDocument.markdown, /IEEE\n\nAbstract—Few-Shot Learning/)
  assert.doesNotMatch(readerDocument.markdown, /# .*Junfei Hu/)
  assert.doesNotMatch(readerDocument.markdown, /# .*Abstract—Few-Shot Learning/)
  assert.equal(readerDocument.segments[0]?.kind, 'paragraph')
  assert.equal(readerDocument.segments[1]?.kind, 'heading')
  assert.equal(readerDocument.segments[1]?.originalText.includes('Junfei Hu'), false)
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
  const readerDocument = buildReaderDocument(
    'paper-math-block',
    [pageResult],
    extractFigureData([pageResult])
  )
  const formulaSegments = readerDocument.segments.filter((segment) =>
    segment.originalMarkdown.startsWith('$$')
  )

  assert.ok(
    readerMarkdown.includes(
      '\n\n$$\n\n\\overline {{\\mathbf {A}}} = \\exp (\\Delta \\mathbf {A})\n\n$$\n\nThe discretized version can be defined as follows.'
    )
  )
  assert.doesNotMatch(readerMarkdown, /\$\$The discretized version/)
  assert.equal(formulaSegments.length, 1)
  assert.match(formulaSegments[0].originalMarkdown, /\\overline/)
})

test('代码块会作为独立 reader 段落保留，不会被拆成标题或并入正文', () => {
  const codeMarkdown = [
    '```python',
    '',
    '# image_encoder - ResNet or Vision Transformer',
    '',
    '# text_encoder - CBOW or Text Transformer',
    '',
    'I_f = image_encoder(I) #[n, d_i]',
    '',
    'loss   = (loss_i + loss_t)/2',
    '',
    '```'
  ].join('\n')
  const caption = '<div align="center">\n\nFigure 3. Numpy-like pseudocode for CLIP.\n\n</div>'
  const body = 'The method continues with the text encoder.'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-code-block',
    pageIndex: 0,
    status: 'completed',
    markdown: [codeMarkdown, caption, body].join('\n\n'),
    blocks: [
      createTextBlock(0, codeMarkdown, { x: 120, y: 120, width: 460, height: 420 }),
      createTextBlock(1, caption, { x: 120, y: 560, width: 460, height: 48 }),
      createTextBlock(2, body, { x: 120, y: 640, width: 520, height: 40 })
    ]
  }

  const figureData = extractFigureData([pageResult])
  const readerDocument = buildReaderDocument('paper-code-block', [pageResult], figureData)
  const codeSegment = readerDocument.segments.find((segment) => segment.kind === 'code')
  const outline = buildPaperTocOutline(readerDocument.segments)

  assert.ok(codeSegment)
  assert.equal(codeSegment.originalMarkdown, codeMarkdown)
  assert.match(codeSegment.originalText, /# image_encoder - ResNet/)
  assert.deepEqual(codeSegment.sourceRefs.pageIndexes, [0])
  assert.deepEqual(codeSegment.sourceRefs.blockIndexes, [0])
  assert.ok(readerDocument.segments.some((segment) => segment.originalMarkdown === body))
  assert.equal(
    outline.items.some((item) => item.text.includes('image_encoder')),
    false
  )
})

test('误包代码围栏的表题 HTML 会作为普通段落进入 reader', () => {
  const tableTitle = [
    '<div align="center">',
    '',
    'PERFORMANCE OF THE PROPOSED IRPNET ON THE IRSTD-1K DATASET',
    '',
    'WHEN DIFFERENT BACKBONES ARE USED',
    '',
    '</div>'
  ].join('\n')
  const fencedTableTitle = ['```', tableTitle, '```'].join('\n')
  const tableMarkdown =
    '<table border="1"><tr><td>Backbone</td><td>IoU↑</td></tr><tr><td>resnet34</td><td>69.77</td></tr></table>'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-fenced-table-title',
    pageIndex: 0,
    status: 'completed',
    markdown: [
      '<div align="center">\n\nTABLE VIII\n\n</div>',
      fencedTableTitle,
      tableMarkdown
    ].join('\n\n'),
    blocks: [
      createTextBlock(0, '<div align="center">\n\nTABLE VIII\n\n</div>'),
      createTextBlock(1, fencedTableTitle),
      createTableBlock(2, tableMarkdown)
    ]
  }

  const figureData = extractFigureData([pageResult])
  const readerDocument = buildReaderDocument('paper-fenced-table-title', [pageResult], figureData)
  const titleSegment = readerDocument.segments.find((segment) =>
    segment.originalText.includes('PERFORMANCE OF THE PROPOSED IRPNET')
  )

  assert.doesNotMatch(readerDocument.markdown, /```\s*<div align="center">/)
  assert.doesNotMatch(readerDocument.markdown, /<div align="center">\s*PERFORMANCE/)
  assert.ok(
    readerDocument.markdown.includes(
      'PERFORMANCE OF THE PROPOSED IRPNET ON THE IRSTD-1K DATASET WHEN DIFFERENT BACKBONES ARE USED'
    )
  )
  assert.ok(titleSegment)
  assert.equal(titleSegment.kind, 'paragraph')
  assert.equal(
    titleSegment.originalText,
    'PERFORMANCE OF THE PROPOSED IRPNET ON THE IRSTD-1K DATASET WHEN DIFFERENT BACKBONES ARE USED'
  )
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

test('分页切开的英文续写正文会重新合并为同一段', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-continuation',
      pageIndex: 0,
      status: 'completed',
      markdown: 'In the downstream task',
      blocks: [
        createTextBlock(0, 'In the downstream task', { x: 120, y: 1460, width: 420, height: 40 }, 0)
      ]
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

test('含行内公式的跨页英文续写正文会重新合并为同一段', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-inline-math-continuation',
      pageIndex: 0,
      status: 'completed',
      markdown:
        'The episode dataset $\\mathcal{D}_{train/test} = \\{S, Q\\}$ is prepared for each N-way K-shot',
      blocks: [
        createTextBlock(
          0,
          'The episode dataset $\\mathcal{D}_{train/test} = \\{S, Q\\}$ is prepared for each N-way K-shot',
          { x: 120, y: 1460, width: 520, height: 40 },
          0
        )
      ]
    },
    {
      paperId: 'paper-page-inline-math-continuation',
      pageIndex: 1,
      status: 'completed',
      markdown: 'few-shot segmentation task, then support and query sets are constructed.',
      blocks: [
        createTextBlock(
          0,
          'few-shot segmentation task, then support and query sets are constructed.',
          { x: 120, y: 80, width: 560, height: 40 },
          1
        )
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerMarkdown = buildReaderMarkdown(pageResults, figureData)

  assert.match(readerMarkdown, /N-way K-shot\s*<!-- Page 2 -->\s*few-shot segmentation task/)
  assert.doesNotMatch(readerMarkdown, /N-way K-shot\s*\n\s*\n\s*<!-- Page 2 -->/)
})

test('论文编号方法小节会保留公式和跨页续写顺序但拆成独立 reader 段', () => {
  const firstItem =
    '1) Prototype Generation: We first apply average pooling [34] to the support feature $F_s$ and the support mask $M_s$ to obtain the global prototypes of different classes. This process can be expressed as follows:'
  const firstFormula =
    'g p _ {s} ^ {k} = \\frac {\\sum _ {h,w} F_s (h,w) \\cdot M_s^k(h,w)}{\\sum _ {h,w} M_s^k(h,w)}'
  const whereText =
    'where $k$ denotes different classes, with $k = 0$ representing the background class $bg$ and $k = 1$ representing the foreground class $fg$.'
  const continuation =
    'To preserve the detailed information in the feature as much as possible, we design a method for extracting local prototypes. First, we perform a patch operation on $F_s$ and $M_s$ dividing them into $N$ patches, each with height $H_p$ and width $W_p$.'
  const secondItem =
    '2) Uncertainty-Guided Prototype Selection: Next, the uncertainty scores are used to filter unreliable prototypes.'
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-sequence-list',
      pageIndex: 0,
      status: 'completed',
      markdown: [firstItem, '$$', firstFormula, '$$', whereText].join('\n\n'),
      blocks: [
        createTextBlock(0, firstItem, { x: 80, y: 120, width: 980, height: 92 }, 0),
        createTextBlock(1, '$$', { x: 360, y: 248, width: 60, height: 28 }, 0),
        createTextBlock(2, firstFormula, { x: 340, y: 292, width: 560, height: 68 }, 0),
        createTextBlock(3, '$$', { x: 360, y: 380, width: 60, height: 28 }, 0),
        createTextBlock(4, whereText, { x: 80, y: 444, width: 980, height: 72 }, 0)
      ]
    },
    {
      paperId: 'paper-sequence-list',
      pageIndex: 1,
      status: 'completed',
      markdown: [continuation, secondItem].join('\n\n'),
      blocks: [
        createTextBlock(0, continuation, { x: 80, y: 80, width: 980, height: 96 }, 1),
        createTextBlock(1, secondItem, { x: 80, y: 220, width: 980, height: 64 }, 1)
      ]
    }
  ]

  const figureData = extractFigureData(pageResults)
  const readerDocument = buildReaderDocument('paper-sequence-list', pageResults, figureData)
  const firstSequenceSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith('1) Prototype Generation')
  )
  const formulaSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.includes(firstFormula)
  )
  const whereSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith(whereText)
  )
  const continuationSegment = readerDocument.segments.find(
    (segment) => segment.originalMarkdown === continuation
  )
  const secondSequenceSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith('2) Uncertainty-Guided Prototype Selection')
  )

  assert.ok(firstSequenceSegment)
  assert.ok(formulaSegment)
  assert.ok(whereSegment)
  assert.ok(continuationSegment)
  assert.ok(secondSequenceSegment)
  assert.equal(firstSequenceSegment.kind, 'list')
  assert.equal(formulaSegment.kind, 'paragraph')
  assert.equal(whereSegment.kind, 'paragraph')
  assert.equal(continuationSegment.kind, 'paragraph')
  assert.doesNotMatch(firstSequenceSegment.originalMarkdown, /\n\n {3}\$\$/)
  assert.ok(firstSequenceSegment.index < formulaSegment.index)
  assert.ok(formulaSegment.index < whereSegment.index)
  assert.ok(whereSegment.index < continuationSegment.index)
  assert.ok(continuationSegment.index < secondSequenceSegment.index)
  assert.doesNotMatch(firstSequenceSegment.originalMarkdown, /2\) Uncertainty-Guided/)
  assert.equal(
    readerDocument.segments.some((segment) => segment.originalMarkdown === continuation),
    true
  )
})

test('表格打断的论文编号小节会保留表格和后续正文顺序但拆成独立 reader 段', () => {
  const item =
    '2. Effectiveness of Dual-Branch Prediction and RDF: To validate the effectiveness of the dual-branch strategy, No.4 applies a gated mechanism to combine'
  const tableNumber = 'TABLE VI'
  const tableTitle =
    'ABLATIVE RESULTS (DICE) ON IMPACTS OF THE CONSISTENCY LOSS AND UNCERTAINTY LOSS IN OUR MODEL'
  const tableMarkdown =
    '<table border="1"><tr><td>Auxiliary Loss</td><td>Mean</td></tr><tr><td>Ours</td><td>84.54</td></tr></table>'
  const continuation =
    'the two predictions. No.5 adopts the proposed RDF module to perform reliable fusion between the predictions.'
  const nextItem =
    '3. Effect of Threshold: We evaluate the influence of the uncertainty filtering threshold.'
  const pageResult: PaperPageOcrResult = {
    paperId: 'paper-sequence-table',
    pageIndex: 0,
    status: 'completed',
    markdown: [item, tableNumber, tableTitle, tableMarkdown, continuation, nextItem].join('\n\n'),
    blocks: [
      createTextBlock(0, item, { x: 80, y: 120, width: 980, height: 92 }),
      createTextBlock(1, tableNumber, { x: 80, y: 250, width: 180, height: 32 }),
      createTextBlock(2, tableTitle, { x: 80, y: 300, width: 980, height: 60 }),
      createTableBlock(3, tableMarkdown, { x: 80, y: 390, width: 980, height: 280 }),
      createTextBlock(4, continuation, { x: 80, y: 720, width: 980, height: 72 }),
      createTextBlock(5, nextItem, { x: 80, y: 830, width: 980, height: 64 })
    ]
  }

  const figureData = extractFigureData([pageResult])
  const readerDocument = buildReaderDocument('paper-sequence-table', [pageResult], figureData)
  const sequenceSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith('2. Effectiveness of Dual-Branch')
  )
  const tableTitleSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith(`${tableNumber} ${tableTitle}`)
  )
  const tableSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith('<table border="1">')
  )
  const continuationSegment = readerDocument.segments.find(
    (segment) => segment.originalMarkdown === continuation
  )
  const nextSequenceSegment = readerDocument.segments.find((segment) =>
    segment.originalMarkdown.startsWith('3. Effect of Threshold')
  )

  assert.ok(sequenceSegment)
  assert.ok(tableTitleSegment)
  assert.ok(tableSegment)
  assert.ok(continuationSegment)
  assert.ok(nextSequenceSegment)
  assert.equal(sequenceSegment.kind, 'list')
  assert.equal(tableTitleSegment.kind, 'paragraph')
  assert.equal(tableSegment.kind, 'table')
  assert.equal(continuationSegment.kind, 'paragraph')
  assert.ok(sequenceSegment.index < tableTitleSegment.index)
  assert.ok(tableTitleSegment.index < tableSegment.index)
  assert.ok(tableSegment.index < continuationSegment.index)
  assert.ok(continuationSegment.index < nextSequenceSegment.index)
  assert.doesNotMatch(sequenceSegment.originalMarkdown, /3\. Effect of Threshold/)
  assert.equal(
    readerDocument.segments.some((segment) => segment.originalMarkdown === continuation),
    true
  )
})

test('分页后如果确实进入新段落，则保留段落分隔', () => {
  const pageResults: PaperPageOcrResult[] = [
    {
      paperId: 'paper-page-break',
      pageIndex: 0,
      status: 'completed',
      markdown: 'The method achieves strong results.',
      blocks: [
        createTextBlock(
          0,
          'The method achieves strong results.',
          { x: 120, y: 1460, width: 520, height: 40 },
          0
        )
      ]
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
        createTextBlock(
          0,
          'In the downstream task',
          { x: 120, y: 1320, width: 420, height: 40 },
          0
        ),
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
  const nextParagraph =
    'RG Block The original MLP is still the most widely adopted in this architecture.'

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
