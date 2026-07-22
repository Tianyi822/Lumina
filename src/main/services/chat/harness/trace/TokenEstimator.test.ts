// src/main/services/chat/harness/trace/TokenEstimator.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TokenEstimator } from './TokenEstimator'

test('estimatePreCall: 按 chars/3.5 粗估(中英文混合经验值)', () => {
  const est = new TokenEstimator()
  // 350 字符 ≈ 100 token
  const messages = [{ role: 'user', content: 'a'.repeat(350) }] as never
  const estimate = est.estimatePreCall(messages, [])
  assert.equal(estimate, 100)
})

test('estimatePreCall: 工具 schema 也计入', () => {
  const est = new TokenEstimator()
  const tools = [{ name: 'lab__execute', description: 'x'.repeat(350), parameters: {} }]
  const estimate = est.estimatePreCall([], tools as never)
  assert.ok(estimate > 0)
})

test('estimatePreCall: 空输入返回 0', () => {
  const est = new TokenEstimator()
  assert.equal(est.estimatePreCall([], []), 0)
})

test('reconcilePostCall: 用实际 usage 校准后续估算', () => {
  const est = new TokenEstimator()
  const messages = [{ role: 'user', content: 'a'.repeat(350) }] as never
  const estimated = est.estimatePreCall(messages, [])
  // 假设实际是 200(估算偏低)
  est.reconcilePostCall(estimated, 200)

  // 再次估算同样输入,应被校准放大
  const reEstimated = est.estimatePreCall(messages, [])
  assert.ok(reEstimated >= 150, `期望校准后 ≥150,实际 ${reEstimated}`)
})

test('reconcilePostCall: 校准比率有上下界(避免极端值)', () => {
  const est = new TokenEstimator()
  // 估算 100,实际 100000(极端偏高)
  est.reconcilePostCall(100, 100_000)
  const messages = [{ role: 'user', content: 'a'.repeat(350) }] as never
  const reEstimated = est.estimatePreCall(messages, [])
  // 不应放大到荒谬程度(校准比率被钳制)
  assert.ok(reEstimated < 10_000, `期望钳制后 <10000,实际 ${reEstimated}`)
})
