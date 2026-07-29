import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeFileName,
  isValidSessionId,
  extractSessionIdFromFileName,
  getSessionJsonlFileName
} from './sessionPaths'

test('sessionPaths', async (t) => {
  await t.test('getSessionJsonlFileName 生成 {sessionId}.jsonl', () => {
    assert.equal(
      getSessionJsonlFileName('session-1722240000000-abc123'),
      'session-1722240000000-abc123.jsonl'
    )
  })

  await t.test('isValidSessionId 接受标准格式', () => {
    assert.equal(isValidSessionId('session-1722240000000-abc123'), true)
  })

  await t.test('isValidSessionId 拒绝路径穿越', () => {
    assert.equal(isValidSessionId('session-1-a/../x'), false)
    assert.equal(isValidSessionId('../session-1-a'), false)
    assert.equal(isValidSessionId('other-1-a'), false)
  })

  await t.test('extractSessionIdFromFileName 解析旧格式文件名', () => {
    assert.equal(
      extractSessionIdFromFileName('session-1722240000000-abc123-我的标题.json'),
      'session-1722240000000-abc123'
    )
    assert.equal(extractSessionIdFromFileName('index.json'), null)
  })

  await t.test('sanitizeFileName 清洗非法字符', () => {
    assert.equal(sanitizeFileName('a/b\\c:d'), 'abcd')
    assert.equal(sanitizeFileName('  '), 'untitled')
  })
})
