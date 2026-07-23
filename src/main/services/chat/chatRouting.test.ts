import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldUsePlanExecute, scoreComplexity } from './chatRouting.ts'

// —— 显式开关:enablePlanMode 最高优先级(仅在 paper 会话生效) ——

test('enablePlanMode=true 始终走 Plan-Execute(显式覆盖)', () => {
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper', enablePlanMode: true }), true)
})

// —— 启发式评分:未显式指定 enablePlanMode 时按内容复杂度自动路由 ——

test('enablePlanMode 未设 + 简单问题 → false', () => {
  assert.equal(
    shouldUsePlanExecute({
      sessionType: 'paper',
      content: '这篇论文的标题是什么'
    }),
    false
  )
})

test('enablePlanMode 未设 + 复杂问题(多步+对比) → true', () => {
  assert.equal(
    shouldUsePlanExecute({
      sessionType: 'paper',
      content: '请分析这篇论文的方法,然后对比相关工作,最后总结优缺点'
    }),
    true
  )
})

test('非 paper 会话 → false(即使复杂)', () => {
  assert.equal(
    shouldUsePlanExecute({
      sessionType: 'knowledge',
      content: '请分析、对比、总结所有文档'
    }),
    false
  )
})

// —— 评分函数可独立测试 ——

test('评分函数可独立测试', () => {
  const score = scoreComplexity('请分析这篇论文的方法,然后对比相关工作')
  assert.ok(score.total >= 4, '多步+对比应得高分')
  assert.ok(score.breakdown.length > 0)
})

test('评分函数:无 content 时得 0', () => {
  const score = scoreComplexity('')
  assert.equal(score.total, 0)
  assert.equal(score.breakdown.length, 0)
})

test('评分函数:纯简单关键词得 0(负分被钳制为 0)', () => {
  const score = scoreComplexity('是什么')
  assert.equal(score.total, 0)
})

test('评分函数:长度维度单独计分', () => {
  const long = 'x'.repeat(550)
  const score = scoreComplexity(long)
  const lengthDim = score.breakdown.find((b) => b.dimension === 'length')
  assert.ok(lengthDim, '长度 >500 应记录 length 维度')
  assert.equal(lengthDim?.score, 2)
})
