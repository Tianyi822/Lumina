// src/main/services/chat/harness/config/resolveConfig.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveHarnessConfig, deepMerge } from './resolveConfig'
import { DEFAULT_HARNESS_CONFIG } from './defaultConfig'

test('deepMerge: 嵌套对象递归合并', () => {
  const result = deepMerge<Record<string, unknown>>({ a: { b: 1, c: 2 } }, { a: { c: 3 } })
  assert.deepEqual(result, { a: { b: 1, c: 3 } })
})

test('deepMerge: 数组与原始值覆盖', () => {
  const result = deepMerge<Record<string, unknown>>({ arr: [1, 2], n: 1 }, { arr: [3], n: 2 })
  assert.deepEqual(result, { arr: [3], n: 2 })
})

test('deepMerge: 忽略 null/undefined 覆盖', () => {
  const result = deepMerge<Record<string, unknown>>({ a: 1 }, { a: undefined, b: null as unknown })
  assert.equal(result.a, 1)
  assert.equal(result.b, null)
})

test('resolveHarnessConfig: 无覆盖时返回默认', () => {
  const result = resolveHarnessConfig('default', {} as never, { sessionId: 's', content: '' } as never)
  assert.deepEqual(result, DEFAULT_HARNESS_CONFIG)
})

test('resolveHarnessConfig: paper 预设生效', () => {
  const result = resolveHarnessConfig('paper', {} as never, { sessionId: 's', content: '' } as never)
  assert.equal(result.budget.maxTokenBudget, 60_000)
  assert.equal(result.budget.budgetAction, 'finalize')
  // 未被预设覆盖的字段保持默认
  assert.equal(result.budget.maxIterations, 30)
})

test('resolveHarnessConfig: lab 预设 budgetAction=abort', () => {
  const result = resolveHarnessConfig('lab', {} as never, { sessionId: 's', content: '' } as never)
  assert.equal(result.budget.budgetAction, 'abort')
  assert.equal(result.budget.maxToolCallCount, 60)
})

test('resolveHarnessConfig: 用户全局覆盖(appConfig.agent)', () => {
  const appConfig = { agent: { budget: { maxRepeatedCalls: 2 } } } as never
  const result = resolveHarnessConfig('paper', appConfig, { sessionId: 's', content: '' } as never)
  assert.equal(result.budget.maxRepeatedCalls, 2)
  // 其余仍来自默认
  assert.equal(result.budget.maxIterations, 30)
})

test('resolveHarnessConfig: 请求级覆盖优先级最高(spec §3.7)', () => {
  const appConfig = { agent: { budget: { maxTokenBudget: 50_000 } } } as never
  const request = {
    sessionId: 's',
    content: '',
    sessionType: 'paper',
    harnessOverrides: { budget: { maxTokenBudget: 80_000 } }
  } as never
  const result = resolveHarnessConfig('paper', appConfig, request)
  assert.equal(result.budget.maxTokenBudget, 80_000)
})

test('resolveHarnessConfig: 优先级 default < userGlobal < preset < request', () => {
  // default maxTokenBudget=60000
  // preset.paper maxTokenBudget=60000
  // userGlobal 设 50000
  // request 设 80000
  const appConfig = { agent: { budget: { maxTokenBudget: 50_000 } } } as never
  const request = {
    sessionId: 's',
    content: '',
    harnessOverrides: { budget: { maxTokenBudget: 80_000 } }
  } as never
  const result = resolveHarnessConfig('paper', appConfig, request)
  assert.equal(result.budget.maxTokenBudget, 80_000)

  // 无 request 覆盖时,paper 预设 maxTokenBudget=60000 覆盖 userGlobal=50000
  // (spec §3.6 优先级:preset > userGlobal)
  const result2 = resolveHarnessConfig('paper', appConfig, { sessionId: 's', content: '' } as never)
  assert.equal(result2.budget.maxTokenBudget, 60_000)
})
