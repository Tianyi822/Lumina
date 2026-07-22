// src/main/services/chat/harness/__tests__/integration.smoke.test.ts
/**
 * 阶段 A 集成冒烟测试:验证"配置 → ctx → trace → token 估算"端到端能跑通。
 *
 * 这是阶段 A 的验收门禁:即便尚未接入主流程,各基础设施模块(类型 + 配置 + trace + token 估算)
 * 必须能作为一个整体协作。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §8
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveHarnessConfig } from '../config/resolveConfig'
import { TraceRecorder } from '../trace/TraceRecorder'
import { TokenEstimator } from '../trace/TokenEstimator'
import { createTestContext } from './fixtures'

test('阶段 A 集成冒烟:配置 → ctx → trace → token 估算 端到端', () => {
  // 1. 解析配置(三层合并:default < userGlobal < preset < request)
  const config = resolveHarnessConfig(
    'paper',
    { agent: { budget: { maxTokenBudget: 50_000 } } } as never,
    {
      sessionId: 's1',
      content: '分析论文',
      sessionType: 'paper',
      paperId: 'p1',
      harnessOverrides: { budget: { maxTokenBudget: 70_000 } }
    } as never
  )
  // 请求级优先级最高,覆盖 userGlobal(50000)与 paper 预设(60000)
  assert.equal(config.budget.maxTokenBudget, 70_000)

  // 2. 构造 ctx(用解析出的 config 的预算值)
  const trace = new TraceRecorder({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    paperId: 'p1'
  })
  const ctx = createTestContext({
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    paperId: 'p1',
    userMessage: '分析论文',
    state: {
      budget: {
        iterationsRemaining: config.budget.maxIterations,
        tokensRemaining: config.budget.maxTokenBudget,
        toolCallsRemaining: config.budget.maxToolCallCount
      }
    }
  })
  // 替换默认 trace 为本测试构造的带 paperId 的实例
  ;(ctx as { trace: TraceRecorder }).trace = trace

  // 3. trace 记录 run_started
  trace.log({
    event: 'run_started',
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    paperId: 'p1',
    engineKind: 'react'
  })

  // 4. token 估算(粗估 > 0)
  const estimator = new TokenEstimator()
  const messages = [{ role: 'user', content: '分析论文的方法与贡献' }] as never
  const estimated = estimator.estimatePreCall(messages, [])
  assert.ok(estimated > 0, `期望估算 > 0,实际 ${estimated}`)

  // 扣减预算:扣减后应小于初始 70_000
  ctx.state.budget.tokensRemaining -= estimated
  assert.ok(ctx.state.budget.tokensRemaining < 70_000)

  // 5. 验证 trace 收集(TraceRecorder 自动补全 ts/requestId/sessionId/paperId)
  const events = trace.getEvents()
  assert.equal(events.length, 1)
  assert.equal(events[0].paperId, 'p1')
  assert.equal(events[0].event.event, 'run_started')
})

test('阶段 A 不影响现有 ChatService 行为(类型层面)', () => {
  // ChatRequest 的新字段 harnessOverrides 可选,老调用方零改动:仅传 sessionId + content 仍可解析
  const oldRequest = { sessionId: 's', content: 'hi' }
  const config = resolveHarnessConfig('default', {} as never, oldRequest as never)
  assert.equal(config.budget.maxIterations, 30) // 全默认
})
