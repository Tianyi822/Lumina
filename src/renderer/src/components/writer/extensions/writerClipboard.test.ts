import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { sanitizeWriterPaste } from './writerClipboard'

const { DOMParser } = parseHTML('<html></html>').window
Object.defineProperty(globalThis, 'DOMParser', {
  configurable: true,
  value: DOMParser
})

test('富文本粘贴移除字体颜色、事件和危险标签', () => {
  const payload = sanitizeWriterPaste(
    '<p style="font-size:42px;color:red" onclick="run()">正文<script>bad()</script></p>',
    '正文',
    ''
  )

  assert.equal(payload.kind, 'html')
  assert.doesNotMatch(payload.html, /font-size|color:|onclick|script/i)
  assert.match(payload.html, /<p>正文<\/p>/)
})

test('富文本粘贴解包未知标签且不保留任意样式', () => {
  const payload = sanitizeWriterPaste(
    '<weird style="background-color:red; padding: 99px"><strong>内容</strong></weird>',
    '内容',
    ''
  )

  assert.equal(payload.kind, 'html')
  assert.equal(payload.html, '<strong>内容</strong>')
})

test('明确 text/markdown 时才解析 Markdown', () => {
  const markdownPayload = sanitizeWriterPaste('', '# 标题', '# 标题')
  const plainPayload = sanitizeWriterPaste('', '# 标题', '')

  assert.equal(markdownPayload.kind, 'markdown')
  assert.match(markdownPayload.html, /<h1>标题<\/h1>/)
  assert.equal(plainPayload.kind, 'text')
  assert.equal(plainPayload.html, '<p># 标题</p>')
})

test('普通文本按空行分段并转义 HTML', () => {
  const payload = sanitizeWriterPaste('', '第一段\n\n<img src=x onerror=run()>', '')

  assert.equal(payload.kind, 'text')
  assert.equal(payload.html, '<p>第一段</p><p>&lt;img src=x onerror=run()&gt;</p>')
})

test('受限 Markdown 解析器拒绝原始 HTML 和危险链接', () => {
  const payload = sanitizeWriterPaste(
    '',
    '<script>bad()</script> [运行](javascript:run())',
    '<script>bad()</script> [运行](javascript:run())'
  )

  assert.equal(payload.kind, 'markdown')
  assert.doesNotMatch(payload.html, /<script>|href="javascript:/i)
  assert.match(payload.html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/)
  assert.match(payload.html, /运行/)
})

test('Markdown 任务列表转换为语义任务节点', () => {
  const payload = sanitizeWriterPaste('', '- [ ] 待办\n- [x] 完成', '- [ ] 待办\n- [x] 完成')

  assert.equal(payload.kind, 'markdown')
  assert.match(payload.html, /data-type="taskList"/)
  assert.match(payload.html, /data-checked="false"/)
  assert.match(payload.html, /data-checked="true"/)
})
