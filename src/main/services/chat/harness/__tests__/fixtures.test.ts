// src/main/services/chat/harness/__tests__/fixtures.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createTestContext } from './fixtures'

test('createTestContext 默认值合理', () => {
  const ctx = createTestContext()
  assert.equal(ctx.sessionType, 'default')
  assert.equal(ctx.state.iteration, 0)
  assert.equal(ctx.state.toolCallHistory.length, 0)
  assert.equal(ctx.state.flags.budgetExhausted, false)
  assert.equal(ctx.isSharedPaperSession, false)
  assert.equal(ctx.trace.log instanceof Function, true)
})

test('createTestContext 支持 overrides', () => {
  const ctx = createTestContext({
    sessionType: 'paper',
    paperId: 'p1',
    userMessage: '分析这篇论文',
    state: { iteration: 5 }
  })
  assert.equal(ctx.sessionType, 'paper')
  assert.equal(ctx.paperId, 'p1')
  assert.equal(ctx.userMessage, '分析这篇论文')
  assert.equal(ctx.state.iteration, 5)
})

test('trace.log 记录事件供断言', () => {
  const ctx = createTestContext()
  ctx.trace.log({
    event: 'route_decided',
    requestId: 'test-req-1',
    engineKind: 'react',
    reason: 'test'
  })
  ctx.trace.log({
    event: 'run_finished',
    requestId: 'test-req-1',
    outcome: 'success',
    durationMs: 100
  })
  const events = ctx.trace.getEvents()
  assert.equal(events.length, 2)
})
