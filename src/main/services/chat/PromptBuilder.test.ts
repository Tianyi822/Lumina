import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'
import type { ToolPipeline } from './tools/PipelineTypes'

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

// ===== setPipeline + buildSystemPrompt =====

test('setPipeline 设置多 stage 管道后 buildSystemPrompt 应包含协调指南', async () => {
  const builder = new PromptBuilder()
  const pipeline: ToolPipeline = {
    stages: [
      { category: 'paper', execution: 'required' },
      { category: 'knowledge', execution: 'conditional' }
    ],
    mergeStrategy: 'smart_merge'
  }

  builder.setPipeline(pipeline)

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.match(prompt, /工具使用协调策略/)
  assert.match(prompt, /首先/)
  assert.match(prompt, /不足/)
})

test('单 stage 管道不应生成协调指南', async () => {
  const builder = new PromptBuilder()
  const pipeline: ToolPipeline = {
    stages: [{ category: 'paper', execution: 'required' }],
    mergeStrategy: 'none'
  }

  builder.setPipeline(pipeline)

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.doesNotMatch(prompt, /工具使用协调策略/)
})

test('setPipeline(undefined) 清除管道，不应生成协调指南', async () => {
  const builder = new PromptBuilder()
  const pipeline: ToolPipeline = {
    stages: [
      { category: 'paper', execution: 'required' },
      { category: 'knowledge', execution: 'conditional' }
    ],
    mergeStrategy: 'smart_merge'
  }

  builder.setPipeline(pipeline)
  builder.setPipeline(undefined)

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.doesNotMatch(prompt, /工具使用协调策略/)
})
