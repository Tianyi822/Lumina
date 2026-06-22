import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderInline, renderBlock } from './markdownRender'

test('renderInline 渲染行内 LaTeX 公式', () => {
  const html = renderInline('能量 $E=mc^2$ 守恒')
  assert.ok(html.includes('katex'), '应包含 katex 渲染结果')
  assert.ok(!html.includes('<p>'), '行内不应有块级 p 标签')
})

test('renderBlock 渲染独立公式块', () => {
  const html = renderBlock('$$\nE=mc^2\n$$')
  assert.ok(html.includes('katex-display'), '应包含块级公式渲染')
})

test('renderInline 普通文本无 katex', () => {
  const html = renderInline('普通文本')
  assert.ok(!html.includes('katex'))
})

test('renderInline 空字符串返回空', () => {
  assert.equal(renderInline(''), '')
})

test('renderBlock 空字符串返回空', () => {
  assert.equal(renderBlock(''), '')
})
