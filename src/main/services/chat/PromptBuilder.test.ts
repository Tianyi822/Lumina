import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'

test('PromptBuilder 不再注入完整 Skill 指令', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    false
  )

  assert.doesNotMatch(prompt, /自动匹配的 Skill 指令/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 有 Skill 工具时只注入渐进读取指南', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    true,
    [
      {
        serverName: 'skill',
        toolName: 'list',
        description: '列出 Skill 摘要',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ]
  )

  assert.match(prompt, /Skill 工具使用指南/)
  assert.match(prompt, /skill__list/)
  assert.match(prompt, /skill__read/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})
