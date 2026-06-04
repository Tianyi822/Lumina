import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateComposerAnchoredScrollTop, parseCssPixelValue } from './paperChatScrollAnchor'

test('计算滚动位置时将消息末尾锚到输入框上沿附近', () => {
  const scrollTop = calculateComposerAnchoredScrollTop({
    anchorOffsetTop: 1400,
    viewportHeight: 600,
    composerHeight: 150,
    composerBottomInset: 12,
    anchorGap: 12,
    maxScrollTop: 1000
  })

  assert.equal(scrollTop, 974)
})

test('锚定滚动不会超过可滚动范围', () => {
  const scrollTop = calculateComposerAnchoredScrollTop({
    anchorOffsetTop: 1800,
    viewportHeight: 600,
    composerHeight: 180,
    composerBottomInset: 12,
    anchorGap: 12,
    maxScrollTop: 1000
  })

  assert.equal(scrollTop, 1000)
})

test('内容不足一屏时滚动位置保持为 0', () => {
  const scrollTop = calculateComposerAnchoredScrollTop({
    anchorOffsetTop: 120,
    viewportHeight: 600,
    composerHeight: 150,
    composerBottomInset: 12,
    anchorGap: 12,
    maxScrollTop: 0
  })

  assert.equal(scrollTop, 0)
})

test('解析 CSS 像素值失败时使用兜底值', () => {
  assert.equal(parseCssPixelValue('12px', 8), 12)
  assert.equal(parseCssPixelValue('', 8), 8)
})
