import test from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import {
  normalizePaperInlineMathForRender,
  normalizePaperMarkdownForRender
} from './paperMarkdown.ts'

const markdownRenderer = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
})
const mathMarkdownRenderer = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
}).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'warn',
    output: 'htmlAndMathml',
    maxSize: 500,
    maxExpand: 1000
  }
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function renderPaperMath(content, kind = 'paragraph') {
  return mathMarkdownRenderer.render(
    normalizePaperInlineMathForRender(normalizePaperMarkdownForRender(content, kind), kind)
  )
}

test('年份残段不会被渲染为有序列表（右括号）', () => {
  const normalized = normalizePaperMarkdownForRender(
    '2023) and merges the sequences from the different directions.',
    'paragraph'
  )
  const html = markdownRenderer.render(normalized)

  assert.match(html, /<p>2023\) and merges the sequences from the different directions\.<\/p>/)
  assert.doesNotMatch(html, /<ol/)
})

test('年份残段不会被渲染为有序列表（句点）', () => {
  const normalized = normalizePaperMarkdownForRender(
    '2023. and merges the sequences from the different directions.',
    'list'
  )
  const html = markdownRenderer.render(normalized)

  assert.match(html, /<p>2023\. and merges the sequences from the different directions\.<\/p>/)
  assert.doesNotMatch(html, /<ol/)
})

test('真实的点号列表项仍保持列表渲染', () => {
  const normalized = normalizePaperMarkdownForRender('1. Remove the norm.', 'list')
  const html = markdownRenderer.render(normalized)

  assert.match(html, /<ol>\s*<li>Remove the norm\.<\/li>\s*<\/ol>/)
})

test('真实的右括号列表项仍保持列表渲染', () => {
  const normalized = normalizePaperMarkdownForRender('1) Remove the norm.', 'paragraph')
  const html = markdownRenderer.render(normalized)

  assert.match(html, /<ol>\s*<li>Remove the norm\.<\/li>\s*<\/ol>/)
})

test('代码段会渲染为 pre code，不把注释当作标题', () => {
  const normalized = normalizePaperMarkdownForRender(
    ['```python', '', '# image_encoder - ResNet', '', 'loss = 1', '', '```'].join('\n'),
    'code'
  )
  const html = markdownRenderer.render(normalized)

  assert.match(html, /<pre><code class="language-python">/)
  assert.match(html, /# image_encoder - ResNet/)
  assert.doesNotMatch(html, /<h1/)
  assert.doesNotMatch(html, /<h2/)
})

test('代码段不会执行行内数学归一化', () => {
  const code = 'echo $HOME ${value} a $ b'

  assert.equal(normalizePaperInlineMathForRender(code, 'code'), code)
  assert.equal(normalizePaperInlineMathForRender('value is $  x  $', 'paragraph'), 'value is $x$')
})

test('展示公式和括号公式会渲染为 KaTeX', () => {
  const displayDollarHtml = renderPaperMath(
    ['$$', '', 'P ^ {\\mathrm {s o u r c e}} = \\left{ x \\right}', '', '$$'].join('\n')
  )
  const singleDollarHtml = renderPaperMath(
    ['$', '', '\\mathbf {h}_{t} = \\mathbf {A} \\mathbf {x}_{t}', '', '$'].join('\n')
  )
  const bracketHtml = renderPaperMath('\\[\n\\eta = \\theta\n\\]')
  const inlineBracketHtml = renderPaperMath('Here, \\( \\tau_p \\) and \\( \\tau_i \\) represent.')

  assert.match(displayDollarHtml, /class="katex-display"/)
  assert.doesNotMatch(displayDollarHtml, /katex-error/)
  assert.match(singleDollarHtml, /class="katex-display"/)
  assert.match(bracketHtml, /class="katex-display"/)
  assert.match(inlineBracketHtml, /class="katex"/)
})
