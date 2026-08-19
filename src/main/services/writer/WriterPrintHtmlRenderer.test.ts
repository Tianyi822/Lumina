import assert from 'node:assert/strict'
import test from 'node:test'
import type { WriterExportDocument } from '@shared/types/writer'
import { WriterPrintHtmlRenderer } from './WriterPrintHtmlRenderer'

function createRichExportDocument(): WriterExportDocument {
  return {
    title: '通用文档',
    nodes: [
      {
        kind: 'heading',
        level: 1,
        runs: [{ kind: 'text', text: '章节标题' }]
      },
      {
        kind: 'paragraph',
        runs: [
          { kind: 'text', text: '含脚注' },
          { kind: 'footnoteRef', number: 1 }
        ]
      },
      { kind: 'math', display: true, latex: 'E = mc^2' },
      {
        kind: 'code',
        language: 'javascript',
        text: 'const x = 1'
      },
      {
        kind: 'footnotes',
        items: [{ number: 1, runs: [{ kind: 'text', text: '脚注说明' }] }]
      }
    ],
    assets: [],
    warnings: []
  }
}

test('打印 HTML 固定浅色且不包含网络来源', () => {
  const html = new WriterPrintHtmlRenderer().render(createRichExportDocument()).data!
  assert.match(html, /default-src 'none'/)
  assert.match(html, /background:\s*#fff/)
  assert.equal(/https?:|<script|<iframe/i.test(html), false)
  assert.match(html, /class="katex"/)
})

test('打印 HTML 内联图片为 data URL 且标题出现在 h1', () => {
  const result = new WriterPrintHtmlRenderer().render({
    title: '带图文档',
    nodes: [
      {
        kind: 'image',
        assetPath: 'missing.png',
        alt: '示意图',
        width: 50
      }
    ],
    assets: [],
    warnings: []
  })
  assert.equal(result.success, true)
  assert.match(result.data ?? '', /<h1>/)
  assert.match(result.data ?? '', /带图文档/)
})
