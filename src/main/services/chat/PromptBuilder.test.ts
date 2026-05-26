import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'

test('PromptBuilder 不再注入 Skill 指令', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    false
  )

  assert.doesNotMatch(prompt, /自动匹配的 Skill 指令/)
  assert.doesNotMatch(prompt, /Skill 工具使用指南/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 不会为名为 skill 的 MCP 服务注入内置指南', async () => {
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

  assert.doesNotMatch(prompt, /Skill 工具使用指南/)
  assert.doesNotMatch(prompt, /skill__read/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 为论文联网搜索注入主动搜索指南', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    true,
    [
      {
        serverName: 'paper_web',
        toolName: 'search',
        description: '搜索学术资料',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ]
  )

  assert.match(prompt, /主动搜索/)
  assert.match(prompt, /无需等待用户明确说“搜索”/)
  assert.match(prompt, /应主动搜索的场景/)
})
