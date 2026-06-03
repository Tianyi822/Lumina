import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'
import type { ToolPipeline } from './tools/PipelineTypes'
import type { CapabilityUnit } from './tools/capabilities/CapabilityUnit'

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

// ===== buildCapabilitySuggestionPrompt =====

test('buildCapabilitySuggestionPrompt 空建议列表返回空字符串', () => {
  const builder = new PromptBuilder()
  const prompt = builder.buildCapabilitySuggestionPrompt([])

  assert.equal(prompt, '')
})

test('buildCapabilitySuggestionPrompt 生成能力建议提示词', () => {
  const builder = new PromptBuilder()
  const suggestable: CapabilityUnit[] = [
    {
      id: 'lab',
      displayName: '实验室工具',
      description: '提供命令行执行和代码运行能力',
      tags: ['lab', 'execution'],
      createAdapter: () => null,
      describeTools: () => []
    }
  ]

  const prompt = builder.buildCapabilitySuggestionPrompt(suggestable)

  assert.match(prompt, /实验室工具/)
  assert.match(prompt, /lab/)
  assert.match(prompt, /命令行执行/)
})

test('buildCapabilitySuggestionPrompt 多个能力都包含在提示词中', () => {
  const builder = new PromptBuilder()
  const suggestable: CapabilityUnit[] = [
    {
      id: 'paper_web',
      displayName: '论文联网搜索',
      description: '搜索学术资料补充论文信息',
      tags: ['paper', 'search'],
      createAdapter: () => null,
      describeTools: () => []
    },
    {
      id: 'lab',
      displayName: '实验室工具',
      description: '提供命令行执行和代码运行能力',
      tags: ['lab', 'execution'],
      createAdapter: () => null,
      describeTools: () => []
    }
  ]

  const prompt = builder.buildCapabilitySuggestionPrompt(suggestable)

  assert.match(prompt, /论文联网搜索/)
  assert.match(prompt, /paper_web/)
  assert.match(prompt, /实验室工具/)
  assert.match(prompt, /lab/)
})

// ===== setSuggestableCapabilities + buildSystemPrompt 集成 =====

test('setSuggestableCapabilities 空列表不应在系统提示词中注入建议引导', async () => {
  const builder = new PromptBuilder()

  builder.setSuggestableCapabilities([])

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.doesNotMatch(prompt, /可建议的能力/)
  assert.doesNotMatch(prompt, /capability__suggest/)
})

test('setSuggestableCapabilities 非空列表应在系统提示词中注入能力建议引导', async () => {
  const builder = new PromptBuilder()

  builder.setSuggestableCapabilities([
    { id: 'lab', displayName: '实验室工具', description: '执行代码' }
  ])

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.match(prompt, /可建议的能力/)
  assert.match(prompt, /实验室工具/)
  assert.match(prompt, /执行代码/)
})

test('setSuggestableCapabilities 随后设空后不注入建议引导', async () => {
  const builder = new PromptBuilder()

  builder.setSuggestableCapabilities([
    { id: 'lab', displayName: '实验室工具', description: '执行代码' }
  ])
  builder.setSuggestableCapabilities([])

  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'test-model' },
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }]
  )

  assert.doesNotMatch(prompt, /可建议的能力/)
})
