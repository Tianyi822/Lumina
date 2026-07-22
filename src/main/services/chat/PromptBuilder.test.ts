import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'
import type { ToolPipeline } from './tools/PipelineTypes'
import type { CapabilityUnit } from './tools/capabilities/CapabilityUnit'
import type { MCPToolReference } from '../../types/chat'

test('PromptBuilder 不再注入 Skill 指令', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(false)

  assert.doesNotMatch(prompt, /自动匹配的 Skill 指令/)
  assert.doesNotMatch(prompt, /Skill 工具使用指南/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 不会为名为 skill 的 MCP 服务注入内置指南', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(true, [
    {
      serverName: 'skill',
      toolName: 'list',
      description: '列出 Skill 摘要',
      inputSchema: { type: 'object', properties: {}, required: [] }
    }
  ])

  assert.doesNotMatch(prompt, /Skill 工具使用指南/)
  assert.doesNotMatch(prompt, /skill__read/)
  assert.doesNotMatch(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 为论文联网搜索注入主动搜索指南', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(true, [
    {
      serverName: 'paper_web',
      toolName: 'search',
      description: '搜索学术资料',
      inputSchema: { type: 'object', properties: {}, required: [] }
    }
  ])

  assert.match(prompt, /主动搜索/)
  assert.match(prompt, /无需等待用户明确说“搜索”/)
  assert.match(prompt, /应主动搜索的场景/)
})

test('PromptBuilder 禁止将知识库作为当前论文检索不足时的自动兜底', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(true, [
    {
      serverName: 'paper',
      toolName: 'search_context',
      description: '检索当前论文',
      inputSchema: {}
    },
    {
      serverName: 'knowledge',
      toolName: 'search',
      description: '检索知识库',
      inputSchema: {}
    }
  ])

  assert.match(prompt, /不是当前论文检索失败后的自动兜底/)
  assert.match(prompt, /不要自动改用知识库搜索/)
  assert.match(prompt, /用户只询问当前论文内容/)
})

// ===== pipeline + buildSystemPrompt =====

test('多 stage 管道上下文应生成协调指南', async () => {
  const builder = new PromptBuilder()
  const pipeline: ToolPipeline = {
    stages: [
      { category: 'paper', execution: 'required' },
      { category: 'knowledge', execution: 'conditional' }
    ],
    mergeStrategy: 'smart_merge'
  }

  const prompt = await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    { pipeline }
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

  const prompt = await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    { pipeline }
  )

  assert.doesNotMatch(prompt, /工具使用协调策略/)
})

test('未传入管道时不应生成协调指南', async () => {
  const builder = new PromptBuilder()

  const prompt = await builder.buildSystemPrompt(true, [
    { serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }
  ])

  assert.doesNotMatch(prompt, /工具使用协调策略/)
})

test('buildPlanSystemPrompt 对同一组工具生成稳定摘要顺序', () => {
  const builder = new PromptBuilder()
  const tools: MCPToolReference[] = [
    {
      serverName: 'paper',
      toolName: 'summarize',
      description: '总结论文',
      inputSchema: {}
    },
    {
      serverName: 'knowledge',
      toolName: 'search',
      description: '检索知识库',
      inputSchema: {}
    },
    {
      serverName: 'paper',
      toolName: 'search_context',
      description: '检索论文上下文',
      inputSchema: {}
    }
  ]

  const prompt = builder.buildPlanSystemPrompt(tools)
  const reorderedPrompt = builder.buildPlanSystemPrompt([tools[2], tools[0], tools[1]])

  assert.equal(prompt, reorderedPrompt)
  assert.ok(prompt.indexOf('**knowledge**') < prompt.indexOf('**paper**'))
  assert.ok(prompt.indexOf('- search_context:') < prompt.indexOf('- summarize:'))
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

// ===== suggestableCapabilities + buildSystemPrompt 集成 =====

test('空建议列表不应在系统提示词中注入建议引导', async () => {
  const builder = new PromptBuilder()

  const prompt = await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    { suggestableCapabilities: [] }
  )

  assert.doesNotMatch(prompt, /可建议的能力/)
  assert.doesNotMatch(prompt, /capability__suggest/)
})

test('非空建议列表应在系统提示词中注入能力建议引导', async () => {
  const builder = new PromptBuilder()

  const prompt = await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    {
      suggestableCapabilities: [{ id: 'lab', displayName: '实验室工具', description: '执行代码' }]
    }
  )

  assert.match(prompt, /可建议的能力/)
  assert.match(prompt, /实验室工具/)
  assert.match(prompt, /执行代码/)
})

test('每次构建使用独立的建议能力上下文', async () => {
  const builder = new PromptBuilder()

  await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    {
      suggestableCapabilities: [{ id: 'lab', displayName: '实验室工具', description: '执行代码' }]
    }
  )

  const prompt = await builder.buildSystemPrompt(true, [
    { serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }
  ])

  assert.doesNotMatch(prompt, /可建议的能力/)
})

// ===== few-shot 示例注入 =====

test('few-shot 示例段在有工具时注入', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(true, [], {
    fewShotExamples: [
      {
        userQuery: '帮我找这篇论文的方法部分',
        reasoning: '需要搜索论文内容',
        toolCalls: [{ name: 'paper__search_context', args: { query: '方法' } }],
        answer: '论文方法部分在第3章...'
      }
    ]
  })

  assert.match(prompt, /## 示例/)
  assert.match(prompt, /paper__search_context/)
})

test('few-shot 空列表不注入', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(true, [], { fewShotExamples: [] })

  assert.doesNotMatch(prompt, /## 示例/)
})

test('few-shot 不影响其他段顺序', async () => {
  // 验证 few-shot 段在所有现有段之后
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    true,
    [{ serverName: 'paper', toolName: 'search_context', description: '', inputSchema: {} }],
    {
      fewShotExamples: [
        {
          userQuery: '解释这段方法',
          reasoning: '先检索论文原文',
          toolCalls: [{ name: 'paper__search_context', args: { query: '方法' } }],
          answer: '该方法是...'
        }
      ]
    }
  )

  const fewShotPos = prompt.indexOf('## 示例')
  const lastExistingPos = Math.max(
    prompt.lastIndexOf('核心指令'),
    prompt.lastIndexOf('ReAct'),
    prompt.lastIndexOf('论文内容检索工具')
  )

  assert.ok(fewShotPos > lastExistingPos, 'few-shot 应在现有段之后')
})
