// src/main/services/chat/harness/trace/TraceRecorder.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TraceRecorder } from './TraceRecorder'

test('TraceRecorder 收集事件到内存数组', () => {
  const recorder = new TraceRecorder({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    paperId: 'p1'
  })
  recorder.log({
    event: 'run_started',
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    engineKind: 'react'
  })
  recorder.log({ event: 'route_decided', requestId: 'r1', engineKind: 'react', reason: 'test' })

  const events = recorder.getEvents()
  assert.equal(events.length, 2)
  assert.equal(events[0].event.event, 'run_started')
  assert.equal(events[1].event.event, 'route_decided')
})

test('TraceRecorder 自动补全 ts/requestId/sessionId/paperId', () => {
  const recorder = new TraceRecorder({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'lab'
  })
  recorder.log({
    event: 'tool_call_started',
    requestId: 'r1',
    tool: 'lab__list',
    argsHash: 'abc',
    iteration: 0
  })

  const events = recorder.getEvents()
  assert.equal(events[0].ts > 0, true)
  assert.equal(events[0].requestId, 'r1')
  assert.equal(events[0].sessionId, 's1')
  assert.equal(events[0].paperId, undefined) // lab 会话无 paperId
})

test('TraceRecorder redactSecrets 过滤含 api_key 的事件', () => {
  const recorder = new TraceRecorder({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'default',
    redactSecrets: true
  })
  // 用带 detail 字段的 tool_call_blocked 事件验证脱敏(该事件类型含 detail: string)
  recorder.log({
    event: 'tool_call_blocked',
    requestId: 'r1',
    tool: 'mcp__x',
    reason: 'budget',
    detail: 'api_key=sk-12345 result'
  })
  const events = recorder.getEvents()
  assert.match(JSON.stringify(events[0]), /\[REDACTED\]/)
  assert.doesNotMatch(JSON.stringify(events[0]), /sk-12345/)
})

test('TraceRecorder redactSecrets=false 保留原值', () => {
  const recorder = new TraceRecorder({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'default',
    redactSecrets: false
  })
  recorder.log({
    event: 'tool_call_blocked',
    requestId: 'r1',
    tool: 'mcp__x',
    reason: 'budget',
    detail: 'api_key=sk-12345'
  })
  const events = recorder.getEvents()
  assert.match(JSON.stringify(events[0]), /sk-12345/)
})
