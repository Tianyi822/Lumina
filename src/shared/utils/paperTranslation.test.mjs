import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPaperTocOutline,
  hasPaperTranslationResult,
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  isPaperReferenceLikeSegment,
  parsePaperTranslationSegments,
  stripPaperTranslationMarkdown
} from './paperTranslation.ts'

test('可以按空段稳定切分论文 Markdown 段落', () => {
  const markdown = [
    '# Title',
    '',
    'First paragraph with **bold** text.',
    '',
    '- item one',
    '- item two',
    '',
    '> quoted text'
  ].join('\n')

  const segments = parsePaperTranslationSegments(markdown)

  assert.equal(segments.length, 4)
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['heading', 'paragraph', 'list', 'quote']
  )
  assert.equal(segments[1].originalText, 'First paragraph with bold text.')
})

test('标题、作者、机构和正文会保持独立分段', () => {
  const markdown = [
    '# DEYOLO: Dual-Feature-Enhancement YOLO for Cross-Modality Object Detection',
    '',
    'Yishuo Chen 1, Boran Wang 1, Xinyu Guo 1, Wenbin Zhu 1',
    '',
    '1 College of Artificial Intelligence, Nankai University, Tianjin 300350, China',
    '',
    'As a fundamental task of computer vision, object detection still encounters various challenges.'
  ].join('\n')

  const segments = parsePaperTranslationSegments(markdown)

  assert.equal(segments.length, 4)
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['heading', 'paragraph', 'paragraph', 'paragraph']
  )
  assert.equal(segments[1].originalText, 'Yishuo Chen 1, Boran Wang 1, Xinyu Guo 1, Wenbin Zhu 1')
  assert.equal(
    segments[2].originalText,
    '1 College of Artificial Intelligence, Nankai University, Tianjin 300350, China'
  )
})

test('可以识别作者段、机构段和参考文献段', () => {
  const markdown = [
    'Yishuo Chen ¹, Boran Wang ¹,¹, Xinyu Guo ¹',
    '',
    '¹ College of Artificial Intelligence, Nankai University, Tianjin 300350, China {chen@example.com}',
    '',
    '31. Xu, H., Ma, J., Jiang, J., Guo, X., Ling, H.: U2fusion: A unified unsupervised image fusion network. IEEE Transactions on Pattern Analysis and Machine Intelligence 44(1), 502-518 (2020)'
  ].join('\n')

  const segments = parsePaperTranslationSegments(markdown)

  assert.equal(isPaperAuthorLikeSegment(segments[0]), true)
  assert.equal(isPaperAffiliationLikeSegment(segments[1]), true)
  assert.equal(isPaperReferenceLikeSegment(segments[2]), true)
})

test('纯图片块会被识别为 image 段', () => {
  const markdown = [
    '![Architecture](./assets/figure-1.png)',
    '',
    '<div><img src="./assets/figure-2.png" /></div>'
  ].join('\n')

  const segments = parsePaperTranslationSegments(markdown)

  assert.equal(segments.length, 2)
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['image', 'image']
  )
  assert.equal(segments[0].originalText, '')
})

test('会去除常见 Markdown 标记，保留正文文本', () => {
  const plainText = stripPaperTranslationMarkdown(
    '# Heading\n\nA [link](https://example.com) with `code` and ![img](a.png)'
  )

  assert.equal(plainText, 'Heading A link with code and')
})

test('各种格式的表格段都会被识别为 table 段', () => {
  // 标准分隔行表格
  const standardTable = ['| Method | AP |', '|---|---|', '| Ours | 52.3 |'].join('\n')
  assert.equal(parsePaperTranslationSegments(standardTable)[0].kind, 'table')

  // 无分隔行的纯管道表格（因空行拆分残留的数据行）
  const noSeparatorTable = ['| Ours | 52.3 |', '| Baseline | 45.6 |', '| SOTA | 51.0 |'].join('\n')
  assert.equal(parsePaperTranslationSegments(noSeparatorTable)[0].kind, 'table')

  // HTML 表格
  const htmlTable = '<table><tr><td>A</td><td>B</td></tr></table>'
  assert.equal(parsePaperTranslationSegments(htmlTable)[0].kind, 'table')

  // 含对齐标记的分隔行表格
  const alignTable = ['| Left | Center | Right |', '|:-----|:------:|------:|', '| a | b | c |'].join('\n')
  assert.equal(parsePaperTranslationSegments(alignTable)[0].kind, 'table')
})

test('普通段落不会被误判为表格', () => {
  // 含管道符但不是表格的普通文本
  const textWithPipe = 'The value is a | b in the expression.'
  assert.equal(parsePaperTranslationSegments(textWithPipe)[0].kind, 'paragraph')
})

test('目录层级会优先根据标题编号恢复，最多三级', () => {
  const markdown = [
    '# 3. Method',
    '',
    '# 3.1. Preliminary',
    '',
    '# 3.1.1. Details',
    '',
    '# 3.1.1.1. Extra'
  ].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [
      { text: '3. Method', level: 1 },
      { text: '3.1. Preliminary', level: 2 },
      { text: '3.1.1. Details', level: 3 },
      { text: '3.1.1.1. Extra', level: 3 }
    ]
  )
})

test('无编号标题会按 Markdown 标题级别生成目录', () => {
  const markdown = ['# Method', '', '## Preliminary', '', '### Details'].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [
      { text: 'Method', level: 1 },
      { text: 'Preliminary', level: 2 },
      { text: 'Details', level: 3 }
    ]
  )
})

test('标题与正文落在同一段时，目录只保留标题第一行', () => {
  const markdown = ['# 3. Method', 'This section introduces the overall architecture.'].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.equal(outline.items.length, 1)
  assert.equal(outline.items[0].text, '3. Method')
  assert.equal(outline.items[0].id, '3-method')
})

test('目录译文会取翻译 Markdown 的标题第一行，并保留原文锚点', () => {
  const segments = parsePaperTranslationSegments(['# 3.1. Preliminary', 'Body text.'].join('\n'))
  const outline = buildPaperTocOutline(segments, [
    {
      ...segments[0],
      status: 'completed',
      translatedMarkdown: '# 3.1. 预备知识\n这是正文译文。',
      translatedText: '3.1. 预备知识 这是正文译文。'
    }
  ])

  assert.equal(outline.items.length, 1)
  assert.equal(outline.items[0].text, '3.1. Preliminary')
  assert.equal(outline.items[0].translatedText, '3.1. 预备知识')
  assert.equal(outline.items[0].id, '3-1-preliminary')
  assert.equal(outline.items[0].segmentId, segments[0].id)
})

test('同名标题会生成稳定的去重锚点', () => {
  const markdown = ['# Introduction', '', '# Introduction'].join('\n\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.deepEqual(
    outline.items.map((item) => item.id),
    ['introduction', 'introduction-2']
  )
})

test('论文 title 会单独展示，Abstract 与 Introduction 作为同级一级目录', () => {
  const markdown = [
    '# DA-Mamba: Learning Domain-Aware State Space Model for Global-Local Alignment',
    '',
    'Yishuo Chen 1, Boran Wang 1, Xinyu Guo 1',
    '',
    '1 College of Artificial Intelligence, Nankai University',
    '',
    'Abstract. Object detection in poor-illumination environments is a challenging task...',
    '',
    '# 1 Introduction'
  ].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.equal(
    outline.documentTitle?.text,
    'DA-Mamba: Learning Domain-Aware State Space Model for Global-Local Alignment'
  )
  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [
      { text: 'Abstract', level: 1 },
      { text: '1 Introduction', level: 1 }
    ]
  )
})

test('标题后的 # Abstract 会作为一级目录，而不是挂在 title 下', () => {
  const markdown = [
    '# DA-Mamba: Learning Domain-Aware State Space Model',
    '',
    '# Abstract',
    '',
    '# 1 Introduction'
  ].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.equal(outline.documentTitle?.text, 'DA-Mamba: Learning Domain-Aware State Space Model')
  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [
      { text: 'Abstract', level: 1 },
      { text: '1 Introduction', level: 1 }
    ]
  )
})

test('直接开篇的 Introduction 不会被误判为论文 title', () => {
  const markdown = ['# Introduction', '', 'This is the first paragraph.'].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.equal(outline.documentTitle, undefined)
  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [{ text: 'Introduction', level: 1 }]
  )
})

test('References 和 参考文献即使 Markdown 级别错误，也会被提升为一级目录', () => {
  const markdown = ['### References', '', '## 参考文献'].join('\n')

  const outline = buildPaperTocOutline(parsePaperTranslationSegments(markdown))

  assert.deepEqual(
    outline.items.map((item) => ({
      text: item.text,
      level: item.level
    })),
    [
      { text: 'References', level: 1 },
      { text: '参考文献', level: 1 }
    ]
  )
})

test('文档标题和 synthetic 摘要都能保留翻译标题文本', () => {
  const markdown = [
    '# DA-Mamba: Learning Domain-Aware State Space Model',
    '',
    'Abstract. Object detection in poor-illumination environments is a challenging task...'
  ].join('\n')
  const segments = parsePaperTranslationSegments(markdown)
  const outline = buildPaperTocOutline(segments, [
    {
      ...segments[0],
      status: 'completed',
      translatedMarkdown: '# DA-Mamba：面向全局-局部对齐的领域感知状态空间模型',
      translatedText: 'DA-Mamba：面向全局-局部对齐的领域感知状态空间模型'
    },
    {
      ...segments[1],
      status: 'completed',
      translatedMarkdown: '摘要：在低照度环境中的目标检测是一项具有挑战性的任务……',
      translatedText: '摘要：在低照度环境中的目标检测是一项具有挑战性的任务……'
    }
  ])

  assert.equal(outline.documentTitle?.translatedText, 'DA-Mamba：面向全局-局部对齐的领域感知状态空间模型')
  assert.equal(outline.items[0].text, 'Abstract')
  assert.equal(outline.items[0].translatedText, '摘要')
})

test('仅当存在实际译文结果或中断态结果时，才视为可删除译文', () => {
  assert.equal(
    hasPaperTranslationResult({
      paperId: 'paper-1',
      sourceHash: 'hash-1',
      totalSegments: 2,
      completedSegments: 0,
      updatedAt: '2026-04-08T00:00:00.000Z',
      entries: [
        {
          id: 'seg-0',
          index: 0,
          kind: 'paragraph',
          originalMarkdown: 'Paragraph A.',
          originalText: 'Paragraph A.',
          status: 'queued'
        }
      ]
    }),
    false
  )

  assert.equal(
    hasPaperTranslationResult({
      paperId: 'paper-2',
      sourceHash: 'hash-2',
      totalSegments: 3,
      completedSegments: 1,
      updatedAt: '2026-04-08T00:00:00.000Z',
      entries: [
        {
          id: 'seg-0',
          index: 0,
          kind: 'paragraph',
          originalMarkdown: 'Paragraph A.',
          originalText: 'Paragraph A.',
          status: 'completed',
          translatedMarkdown: '段落 A。',
          translatedText: '段落 A。'
        },
        {
          id: 'seg-1',
          index: 1,
          kind: 'paragraph',
          originalMarkdown: 'Paragraph B.',
          originalText: 'Paragraph B.',
          status: 'translating'
        },
        {
          id: 'seg-2',
          index: 2,
          kind: 'paragraph',
          originalMarkdown: 'Paragraph C.',
          originalText: 'Paragraph C.',
          status: 'queued'
        }
      ]
    }),
    true
  )
})
