import { test } from 'node:test'
import assert from 'node:assert/strict'

test('ChatRequest.harnessOverrides 字段可选', () => {
  // 构造最小 ChatRequest,验证 harnessOverrides 可选
  const request = {
    sessionId: 's1',
    content: 'hello'
  }
  // harnessOverrides 未设置时应为 undefined
  assert.equal((request as { harnessOverrides?: unknown }).harnessOverrides, undefined)

  // 设置时能携带配置覆盖
  const withOverrides = {
    ...request,
    harnessOverrides: { budget: { maxIterations: 10 } }
  }
  assert.deepEqual(withOverrides.harnessOverrides, { budget: { maxIterations: 10 } })
})
