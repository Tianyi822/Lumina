import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import {
  createBlocksPreviewElement,
  createLoadingPreviewElement
} from './writerSuggestionPreview'

const { window: testWindow } = parseHTML('<html><head></head><body></body></html>')
for (const [name, value] of Object.entries({
  window: testWindow,
  document: testWindow.document,
  HTMLElement: testWindow.HTMLElement
})) {
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

test('loading 预览含文案与骨架行', () => {
  const el = createLoadingPreviewElement('AI 正在续写…')
  assert.equal(el.className, 'sm-writer-diff-pending')
  assert.equal(el.getAttribute('role'), 'status')
  assert.match(el.textContent ?? '', /AI 正在续写/)
  assert.equal(el.querySelectorAll('.sm-writer-diff-pending-skeleton').length >= 2, true)
})

test('多块预览按块拆分而非单行拼接', () => {
  const el = createBlocksPreviewElement([
    { nodeId: 'a', type: 'paragraph', text: '第一段' },
    { nodeId: 'b', type: 'heading', text: '标题', level: 2 },
    { nodeId: 'c', type: 'paragraph', text: '第二段' }
  ])
  const children = el.querySelectorAll('.sm-writer-diff-add-block')
  assert.equal(children.length, 3)
  assert.equal(children[0]?.textContent, '第一段')
  assert.equal(children[1]?.getAttribute('data-block-type'), 'heading')
  assert.equal(children[1]?.getAttribute('data-heading-level'), '2')
  assert.equal(children[2]?.textContent, '第二段')
  assert.equal(el.textContent?.includes('第一段\n标题\n第二段') && children.length === 1, false)
})
