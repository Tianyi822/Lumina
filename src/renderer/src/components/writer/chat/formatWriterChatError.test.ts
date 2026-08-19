import assert from 'node:assert/strict'
import test from 'node:test'
import { initI18n } from '@renderer/i18n'
import { formatWriterChatError } from './formatWriterChatError'

// formatWriterChatError 改走 i18n.t：先初始化（测试环境默认 zh，既有中文断言不变）
await initI18n()

test('空错误回退到通用文案', () => {
  assert.match(formatWriterChatError(''), /模型请求失败/)
  assert.match(formatWriterChatError('   '), /模型请求失败/)
})

test('terminated 等连接中断错误保留原始信息', () => {
  const formatted = formatWriterChatError('terminated')
  assert.match(formatted, /连接已中断/)
  assert.match(formatted, /terminated/)
})

test('普通错误原样展示', () => {
  assert.equal(formatWriterChatError('API key invalid'), 'API key invalid')
})
