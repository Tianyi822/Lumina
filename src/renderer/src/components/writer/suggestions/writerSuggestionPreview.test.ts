import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import {
  createBlocksPreviewElement,
  createLoadingPreviewElement,
  createOperationToolbarElement
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
})

test('操作条含接受拒绝与可选批量动作', () => {
  const el = createOperationToolbarElement({
    operationIndex: 0,
    showBatchActions: true,
    pendingCount: 2,
    onAcceptOne: () => undefined,
    onRejectOne: () => undefined,
    onAcceptAll: () => undefined,
    onRejectAll: () => undefined
  })
  assert.equal(el.getAttribute('role'), 'toolbar')
  assert.equal(el.getAttribute('aria-label'), 'AI 编辑建议')
  assert.match(el.textContent ?? '', /2 项待确认/)
  assert.ok(el.querySelector('[aria-label="全部接受建议"]'))
  assert.ok(el.querySelector('[aria-label="全部拒绝建议"]'))
  assert.ok(el.querySelector('.sm-writer-diff-toolbar__divider'))
  assert.ok(el.querySelector('[aria-label="接受该项建议"]'))
  assert.ok(el.querySelector('[aria-label="拒绝该项建议"]'))
  assert.ok(el.querySelector('.sm-writer-diff-toolbar__btn--reject'))
})

test('操作条无批量时不渲染全部接受拒绝', () => {
  const el = createOperationToolbarElement({
    operationIndex: 1,
    showBatchActions: false,
    pendingCount: 2,
    onAcceptOne: () => undefined,
    onRejectOne: () => undefined,
    onAcceptAll: () => undefined,
    onRejectAll: () => undefined
  })
  assert.equal(el.querySelector('[aria-label="全部接受建议"]'), null)
  assert.ok(el.querySelector('[aria-label="接受该项建议"]'))
  assert.ok(el.querySelector('[aria-label="拒绝该项建议"]'))
})
