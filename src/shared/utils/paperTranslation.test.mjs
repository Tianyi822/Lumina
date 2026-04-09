import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
