// src/main/services/chat/harness/__tests__/MiddlewareTypes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type {
  HarnessMiddleware,
  RouteDecision,
  IterationDecision,
  MutableModelRequest,
  RunOutcome
} from '../middleware/types'

test('HarnessMiddleware 类型可导入且支持部分 hook 实现', () => {
  // 一个只实现 beforeToolCall 的中间件(其余可选)
  const mw: HarnessMiddleware = {
    name: 'test',
    order: 100,
    beforeToolCall: async (_ctx, _call, next) => next(_call)
  }
  assert.equal(mw.name, 'test')
  assert.equal(mw.order, 100)
})

test('IterationDecision 联合类型可构造所有分支', () => {
  const a: IterationDecision = { action: 'continue' }
  const b: IterationDecision = { action: 'finalize', reason: 'budget' }
  const c: IterationDecision = { action: 'abort', reason: 'fatal' }
  assert.equal(a.action, 'continue')
  assert.equal(b.action, 'finalize')
  assert.equal(c.action, 'abort')
})

test('RouteDecision 携带 engineKind 与 reason', () => {
  const d: RouteDecision = { engineKind: 'react', reason: 'no plan needed' }
  assert.equal(d.engineKind, 'react')
})

test('RunOutcome 三态联合', () => {
  const ok: RunOutcome = { kind: 'success', result: {} as never }
  const err: RunOutcome = { kind: 'error', error: 'boom' }
  const ab: RunOutcome = { kind: 'aborted' }
  assert.equal(ok.kind, 'success')
  assert.equal(err.kind, 'error')
  assert.equal(ab.kind, 'aborted')
})

test('MutableModelRequest 字段齐全', () => {
  const req: MutableModelRequest = {
    tools: [],
    toolChoice: 'auto',
    messages: []
  }
  assert.equal(req.toolChoice, 'auto')
})
