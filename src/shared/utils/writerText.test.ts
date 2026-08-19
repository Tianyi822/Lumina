import test from 'node:test'
import assert from 'node:assert/strict'
import { hashWriterText, normalizeWriterText } from './writerText'

test('相同 Unicode 文本得到稳定 SHA-256', () => {
  const a = hashWriterText('原始句子αβγ')
  const b = hashWriterText('原始句子αβγ')
  assert.equal(a, b)
  assert.match(a, /^[a-f0-9]{64}$/)
})

test('换行规范化后哈希一致', () => {
  const withCrlf = hashWriterText('第一行\r\n第二行\r第三行')
  const withLf = hashWriterText('第一行\n第二行\n第三行')
  assert.equal(withCrlf, withLf)
  assert.equal(normalizeWriterText('a\r\nb\rc'), 'a\nb\nc')
})
