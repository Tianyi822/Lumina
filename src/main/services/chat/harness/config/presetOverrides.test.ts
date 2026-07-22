// src/main/services/chat/harness/config/presetOverrides.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PRESET_OVERRIDES } from './presetOverrides'
import { translateLegacyFlags } from './requestOverrides'

test('paper 预设倾向 finalize,token 60k(spec §3.4)', () => {
  const paper = PRESET_OVERRIDES.paper
  assert.equal(paper.budget?.budgetAction, 'finalize')
  assert.equal(paper.budget?.maxTokenBudget, 60_000)
  assert.equal(paper.toolSelection?.enableFewShot, true)
})

test('lab 预设倾向 abort,token 100k,调用数 60', () => {
  const lab = PRESET_OVERRIDES.lab
  assert.equal(lab.budget?.budgetAction, 'abort')
  assert.equal(lab.budget?.maxTokenBudget, 100_000)
  assert.equal(lab.budget?.maxToolCallCount, 60)
  assert.equal(lab.toolExecution?.labTimeoutMs, 180_000)
})

test('knowledge 预算小,调用数 20', () => {
  const kb = PRESET_OVERRIDES.knowledge
  assert.equal(kb.budget?.maxTokenBudget, 30_000)
  assert.equal(kb.budget?.maxToolCallCount, 20)
})

test('default 预设为空(全继承默认)', () => {
  assert.deepEqual(PRESET_OVERRIDES.default, {})
})

test('translateLegacyFlags: enablePlanMode=true 翻译为 forceEngine plan_execute', () => {
  const result = translateLegacyFlags({ enablePlanMode: true })
  assert.equal(result.router?.forceEngine, 'plan_execute')
})

test('translateLegacyFlags: 无 legacy 标志返回空对象', () => {
  const result = translateLegacyFlags({})
  assert.deepEqual(result, {})
})
