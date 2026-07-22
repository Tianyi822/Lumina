// src/main/services/chat/harness/config/defaultConfig.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_HARNESS_CONFIG } from './defaultConfig'

test('DEFAULT_HARNESS_CONFIG 预算默认值(spec §3.3)', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.maxIterations, 30)
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.maxPlanStepIterations, 5)
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.maxTokenBudget, 60_000)
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.maxToolCallCount, 40)
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.maxRepeatedCalls, 3)
  assert.equal(DEFAULT_HARNESS_CONFIG.budget.budgetAction, 'finalize')
})

test('DEFAULT_HARNESS_CONFIG 路由默认值', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.router.planExecuteComplexityThreshold, 7)
  assert.equal(DEFAULT_HARNESS_CONFIG.router.enableHeuristic, true)
})

test('DEFAULT_HARNESS_CONFIG 工具选择默认值', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.toolSelection.enableSubsetFilter, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.toolSelection.enableFewShot, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.toolSelection.defaultToolChoice, 'auto')
})

test('DEFAULT_HARNESS_CONFIG 中间件开关默认全开', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.middleware.enableDuplicateDetector, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.middleware.enableArgValidator, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.middleware.enableDependencyAnalyzer, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.middleware.enableTraceRecorder, true)
})

test('DEFAULT_HARNESS_CONFIG 工具执行默认值', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.toolExecution.defaultTimeoutMs, 60_000)
  assert.equal(DEFAULT_HARNESS_CONFIG.toolExecution.labTimeoutMs, 180_000)
  assert.equal(DEFAULT_HARNESS_CONFIG.toolExecution.maxConcurrency, 3)
})

test('DEFAULT_HARNESS_CONFIG trace 默认值', () => {
  assert.equal(DEFAULT_HARNESS_CONFIG.trace.persistToDisk, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.trace.redactSecrets, true)
  assert.equal(DEFAULT_HARNESS_CONFIG.trace.maxFileRetentionDays, 7)
})
