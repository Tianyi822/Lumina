import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReactSystemPrompt, buildToolCoordinationGuide } from './reactSystemPrompt.ts'

test('内置 ReAct 提示词不再注入 few-shot 示例或模板变量', () => {
  const prompt = buildReactSystemPrompt()

  assert.doesNotMatch(prompt, /few-shot/i)
  assert.doesNotMatch(prompt, /Few-shot/)
  assert.doesNotMatch(prompt, /\{\{[^}]+}}/)
  assert.doesNotMatch(prompt, /自定义变量/)
  assert.doesNotMatch(prompt, /动态变量/)
})

test('内置 ReAct 提示词不注入当前时间且连续构建保持稳定', () => {
  const firstPrompt = buildReactSystemPrompt()
  const secondPrompt = buildReactSystemPrompt()

  assert.equal(firstPrompt, secondPrompt)
  assert.doesNotMatch(firstPrompt, /当前时间/)
})

test('内置 ReAct 提示词保留实验室创建业务规则', () => {
  const prompt = buildReactSystemPrompt()

  assert.match(prompt, /实验室管理指南/)
  assert.match(prompt, /实验室工具是可选能力/)
  assert.match(prompt, /不要为了所有实验室会话都强行输出计划/)
  assert.match(prompt, /lab__create_lab/)
  assert.match(prompt, /dockerfile_content/)
  assert.match(prompt, /compose_content/)
})

// ===== buildToolCoordinationGuide =====

test('buildToolCoordinationGuide 空 stages 返回空字符串', () => {
  const result = buildToolCoordinationGuide([])
  assert.equal(result, '')
})

test('buildToolCoordinationGuide 单个 required stage 应包含"首先"指令', () => {
  const result = buildToolCoordinationGuide([{ category: 'paper', execution: 'required' }])
  assert.ok(result.includes('首先'))
  assert.ok(result.includes('paper'))
  assert.ok(result.includes('工具使用协调策略'))
})

test('buildToolCoordinationGuide required + conditional 组合应有优先级顺序', () => {
  const result = buildToolCoordinationGuide([
    { category: 'paper', execution: 'required' },
    { category: 'knowledge', execution: 'conditional' }
  ])
  const paperIndex = result.indexOf('paper')
  const kbIndex = result.indexOf('knowledge')
  assert.ok(paperIndex < kbIndex, 'paper 应在 knowledge 之前')
  assert.ok(result.includes('不足'))
})

test('buildToolCoordinationGuide 包含来源标注提示', () => {
  const result = buildToolCoordinationGuide([
    { category: 'paper', execution: 'required' },
    { category: 'knowledge', execution: 'conditional' }
  ])
  assert.ok(result.includes('根据论文原文'))
  assert.ok(result.includes('根据知识库'))
})
