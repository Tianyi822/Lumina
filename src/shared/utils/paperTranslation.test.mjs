import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePaperTranslationSegments, stripPaperTranslationMarkdown } from './paperTranslation.ts'

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

test('会去除常见 Markdown 标记，保留正文文本', () => {
  const plainText = stripPaperTranslationMarkdown(
    '# Heading\n\nA [link](https://example.com) with `code` and ![img](a.png)'
  )

  assert.equal(plainText, 'Heading A link with code and')
})
