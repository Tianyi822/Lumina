import test from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { parseHTML, NodeFilter } from 'linkedom'
import { postProcessRenderedHtml, tableMathSourceToInline } from './paperMarkdownPostProcess.ts'

function installDomGlobals() {
  if (globalThis.NodeFilter === undefined) {
    globalThis.NodeFilter = NodeFilter
  }

  if (typeof globalThis.DOMParser !== 'undefined') {
    return
  }

  globalThis.DOMParser = class DOMParser {
    parseFromString(html) {
      return parseHTML(html).document
    }
  }
}

installDomGlobals()

const markdownRenderer = new MarkdownIt({
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

function renderTableHtml(markdown) {
  const rawHtml = markdownRenderer.render(markdown)
  return postProcessRenderedHtml(rawHtml, (inline) => markdownRenderer.renderInline(inline))
}

test('表格内 $$...$$ 应转为行内 $...$', () => {
  assert.equal(tableMathSourceToInline('$$82.9 \\pm 0.1$$'), '$82.9 \\pm 0.1$')
})

test('表格内 \\[...\\] 应转为行内 $...$', () => {
  assert.equal(tableMathSourceToInline('\\[F_1 = 0.9\\]'), '$F_1 = 0.9$')
})

test('表格内原有行内 $...$ 保持不变', () => {
  assert.equal(tableMathSourceToInline('$P$-F1'), '$P$-F1')
})

test('display 公式去空白后包裹为行内', () => {
  assert.equal(tableMathSourceToInline('  $$ x^2 $$  '), '$x^2$')
})

test('表格内 display math 应渲染为行内 katex 且不含块级 display', () => {
  const html = renderTableHtml(
    '<table><tr><td>$$82.9 \\pm 0.1$$</td><td>$$84.5 \\pm 0.2$$</td></tr></table>'
  )

  assert.match(html, /paper-markdown-view__table-wrap/)
  assert.match(html, /katex/)
  assert.doesNotMatch(html, /<head>|<body>/)

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root =
    doc.documentElement?.tagName === 'DIV' ? doc.documentElement : doc.body?.firstElementChild
  const blockDisplays = root?.querySelectorAll('table .katex-display') ?? []

  assert.equal(blockDisplays.length, 0, 'table cells should not use block katex-display')
})

test('表格内单美元行内公式应被渲染为 katex', () => {
  const html = renderTableHtml(
    '<table><tr><td>$P$</td><td>$R$</td><td>$F_1$</td></tr></table>'
  )

  assert.match(html, /katex/)
  assert.doesNotMatch(html, /<td>\$P\$<\/td>/)
})

test('postProcess 应为表格包裹横向滚动容器', () => {
  const html = renderTableHtml('<table><tr><td>A</td><td>B</td></tr></table>')

  assert.match(html, /paper-markdown-view__table-wrap/)
})
