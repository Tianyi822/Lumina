import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReactSystemPrompt } from './reactSystemPrompt.ts'

test('内置 ReAct 提示词不再注入 few-shot 示例或模板变量', () => {
  const prompt = buildReactSystemPrompt({ modelName: 'test-model' })

  assert.doesNotMatch(prompt, /few-shot/i)
  assert.doesNotMatch(prompt, /Few-shot/)
  assert.doesNotMatch(prompt, /\{\{[^}]+}}/)
  assert.doesNotMatch(prompt, /自定义变量/)
  assert.doesNotMatch(prompt, /动态变量/)
})

test('内置 ReAct 提示词保留沙箱创建业务规则', () => {
  const prompt = buildReactSystemPrompt()

  assert.match(prompt, /沙箱管理指南/)
  assert.match(prompt, /sandbox__create_sandbox/)
  assert.match(prompt, /dockerfile_content/)
  assert.match(prompt, /compose_content/)
})
