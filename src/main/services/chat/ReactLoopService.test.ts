import test from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import { ReactLoopService, extractOriginalQuery } from './ReactLoopService.ts'
import { StreamHandler } from './StreamHandler.ts'
import type { StopController } from './StopController.ts'
import type { ChatRequest, StreamEvent } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'
import type { Logger } from '@main/services/logger'
import type { MCPService } from '@main/services/mcp'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { capabilityManager } from './tools/CapabilityManager.ts'
import { paperContextSearchToolService } from '../paper/PaperContextSearchToolService.ts'
import { knowledgeToolService } from '../knowledge/KnowledgeToolService.ts'

type StreamChunk = OpenAI.Chat.Completions.ChatCompletionChunk
type StreamingParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

interface HarnessOptions {
  streams: AsyncIterable<StreamChunk>[]
  createStreamForParams?: (params: StreamingParams) => AsyncIterable<StreamChunk>
  toolResult?: MCPToolCallResult
  callTool?: () => Promise<MCPToolCallResult>
  abortController?: AbortController
  errors?: unknown[]
  llmConfig?: LLMConfig
}

interface Harness {
  service: ReactLoopService
  request: ChatRequest
  events: StreamEvent[]
  createParams: StreamingParams[]
  abortController: AbortController
}

async function* createStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

function createToolCallStream(index: number): AsyncIterable<StreamChunk> {
  return createNamedToolCallStream(index, 'mock__lookup')
}

function createReasoningToolCallStream(
  index: number,
  reasoningContent: string
): AsyncIterable<StreamChunk> {
  return createStream([
    {
      id: `chunk-reasoning-${index}`,
      object: 'chat.completion.chunk',
      created: index,
      model: 'model',
      choices: [{ index: 0, delta: { reasoning_content: reasoningContent } }]
    } as unknown as StreamChunk,
    {
      id: `chunk-tool-${index}`,
      object: 'chat.completion.chunk',
      created: index,
      model: 'model',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call-${index}`,
                type: 'function',
                function: {
                  name: 'mock__lookup',
                  arguments: '{}'
                }
              }
            ]
          }
        }
      ]
    } as StreamChunk
  ])
}

function createNamedToolCallStream(index: number, name: string): AsyncIterable<StreamChunk> {
  return createStream([
    {
      id: `chunk-tool-${index}`,
      object: 'chat.completion.chunk',
      created: index,
      model: 'model',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call-${index}`,
                type: 'function',
                function: {
                  name,
                  arguments: '{}'
                }
              }
            ]
          }
        }
      ]
    } as StreamChunk
  ])
}

function createContentStream(content: string): AsyncIterable<StreamChunk> {
  return createStream([
    {
      id: 'chunk-content',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'model',
      choices: [
        {
          index: 0,
          delta: { content }
        }
      ]
    } as StreamChunk
  ])
}

function createHarness(options: HarnessOptions): Harness {
  const events: StreamEvent[] = []
  const createParams: StreamingParams[] = []
  const streams = [...options.streams]
  const errors = [...(options.errors ?? [])]
  const abortController = options.abortController ?? new AbortController()

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
  } as unknown as Logger

  const stopController = {
    isStopped: () => false,
    getOrCreateAbortController: () => abortController,
    checkStopped: () => {
      if (abortController.signal.aborted) {
        const error = new Error('Request was stopped by user')
        error.name = 'AbortError'
        throw error
      }
    },
    delayWithAbort: async () => {},
    withTimeoutAndStopCheck: async <T>(promise: Promise<T>): Promise<T> => promise,
    deleteAbortController: () => {},
    clearStoppedSession: () => {},
    deletePendingUserInteraction: () => {},
    setSessionKnowledgeBases: () => {}
  } as unknown as StopController

  const mcpService = {
    getAllTools: () => [
      {
        serverName: 'mock',
        name: 'lookup',
        description: '查询资料',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ],
    getConnectedServerNames: () => ['mock'],
    getTools: () => [
      {
        serverName: 'mock',
        name: 'lookup',
        description: '查询资料',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ],
    callTool: async (): Promise<MCPToolCallResult> =>
      options.callTool
        ? options.callTool()
        : (options.toolResult ?? { success: true, content: { ok: true } })
  } as unknown as MCPService

  const createClient = (): OpenAI =>
    ({
      chat: {
        completions: {
          create: async (params: StreamingParams) => {
            createParams.push(params)
            if (options.createStreamForParams) {
              return options.createStreamForParams(params)
            }
            const error = errors.shift()
            if (error) {
              throw error
            }
            const stream = streams.shift()
            if (!stream) {
              throw new Error('测试流已耗尽')
            }
            return stream
          }
        }
      }
    }) as unknown as OpenAI

  const service = new ReactLoopService({
    logger,
    mcpService,
    stopController,
    streamHandler: new StreamHandler(),
    createClient,
    validateAndGetLLMConfig: () =>
      options.llmConfig ??
      ({
        base_url: 'http://localhost',
        api_key: 'key',
        model_name: 'model'
      } as LLMConfig)
  })

  const request: ChatRequest = {
    messages: [{ role: 'user', content: '连续查询资料后总结' }],
    modelKey: 'model',
    sessionId: 'react-loop-test',
    turnId: 'turn-react-loop-test',
    selectedTools: [
      {
        serverName: 'mock',
        toolName: 'lookup',
        description: '查询资料',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ]
  }

  return { service, request, events, createParams, abortController }
}

function createWebContents(events: StreamEvent[]): WebContents {
  return {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => events.push(event)
  } as unknown as WebContents
}

test('默认 ReAct 上限为 30，不会在第 10 次工具调用后静默结束', async () => {
  const toolStreams = Array.from({ length: 12 }, (_, index) => createToolCallStream(index))
  const harness = createHarness({
    streams: [...toolStreams, createContentStream('最终回答')]
  })

  const result = await harness.service.sendMessageWithReact(
    harness.request,
    createWebContents(harness.events)
  )

  assert.equal(result.success, true, result.error)
  assert.equal(result.finalContent, '最终回答')
  assert.equal(harness.createParams.length, 13)
  assert.equal(harness.events.filter((event) => event.type === 'tool_call').length, 12)
  assert.equal(
    harness.createParams.every((params) => Array.isArray(params.tools)),
    true
  )
  assert.equal(
    harness.createParams.every(
      (params) =>
        (params as StreamingParams & { prompt_cache_key?: string }).prompt_cache_key === undefined
    ),
    true
  )
})

test('达到显式 ReAct 上限后追加一次无工具收尾回复', async () => {
  const harness = createHarness({
    streams: [createToolCallStream(0), createToolCallStream(1), createContentStream('上限收尾')]
  })
  const request: ChatRequest = { ...harness.request, maxReactIterations: 2 }

  const result = await harness.service.sendMessageWithReact(
    request,
    createWebContents(harness.events)
  )

  assert.equal(result.success, true, result.error)
  assert.equal(result.finalContent, '上限收尾')
  assert.equal(harness.createParams.length, 3)
  assert.equal(harness.createParams[2].tools, undefined)
  assert.match(String(harness.createParams[2].messages.at(-1)?.content), /不要再调用工具/)
})

test('模型正常给出最终回复时不额外触发收尾调用', async () => {
  const harness = createHarness({
    streams: [createToolCallStream(0), createContentStream('正常完成')]
  })
  const request: ChatRequest = { ...harness.request, maxReactIterations: 5 }

  const result = await harness.service.sendMessageWithReact(
    request,
    createWebContents(harness.events)
  )

  assert.equal(result.success, true)
  assert.equal(result.finalContent, '正常完成')
  assert.deepEqual(
    result.modelTranscript?.map((message) => message.role),
    ['assistant', 'tool', 'assistant']
  )
  assert.equal(result.modelTranscript?.[0].tool_calls?.[0]?.id, 'call-0')
  assert.equal(result.modelTranscript?.[1].tool_call_id, 'call-0')
  assert.equal(harness.createParams.length, 2)
  assert.equal(
    harness.createParams.every((params) => Array.isArray(params.tools)),
    true
  )
})

test('ReAct 工具调用将原生 reasoning_content 回传并保存到 modelTranscript', async () => {
  const harness = createHarness({
    streams: [createReasoningToolCallStream(0, '工具调用前思考'), createContentStream('完成')]
  })

  const result = await harness.service.sendMessageWithReact(
    harness.request,
    createWebContents(harness.events)
  )

  const secondRequestAssistant = harness.createParams[1].messages.find(
    (message) => message.role === 'assistant'
  ) as unknown as { reasoning_content?: string }

  assert.equal(result.success, true, result.error)
  assert.equal(secondRequestAssistant.reasoning_content, '工具调用前思考')
  assert.equal(result.modelTranscript?.[0].reasoning_content, '工具调用前思考')
})

test('ReAct 必须等待工具结果后才开始下一轮模型请求', async () => {
  let resolveToolResult: ((result: MCPToolCallResult) => void) | undefined
  let notifyToolStarted: (() => void) | undefined
  const toolStarted = new Promise<void>((resolve) => {
    notifyToolStarted = resolve
  })
  const pendingToolResult = new Promise<MCPToolCallResult>((resolve) => {
    resolveToolResult = resolve
  })
  const harness = createHarness({
    streams: [createToolCallStream(0), createContentStream('工具完成后回答')],
    callTool: async () => {
      notifyToolStarted?.()
      return pendingToolResult
    }
  })

  const pendingResult = harness.service.sendMessageWithReact(
    harness.request,
    createWebContents(harness.events)
  )

  await toolStarted
  assert.equal(harness.createParams.length, 1)
  assert.equal(
    harness.events.some((event) => event.type === 'tool_result'),
    false
  )

  resolveToolResult?.({ success: true, content: { ok: true } })
  const result = await pendingResult

  assert.equal(result.success, true, result.error)
  assert.equal(harness.createParams.length, 2)

  const toolResultIndex = harness.events.findIndex((event) => event.type === 'tool_result')
  const nextIterationIndex = harness.events.findIndex(
    (event) => event.type === 'react_iteration_start' && event.content === '1'
  )
  assert.ok(toolResultIndex >= 0)
  assert.ok(nextIterationIndex > toolResultIndex)
})

test('等待用户交互时不触发上限收尾回复', async () => {
  const harness = createHarness({
    streams: [createToolCallStream(0)],
    toolResult: {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            question: '请选择',
            options: [{ label: '继续', value: 'continue' }]
          })
        }
      ]
    }
  })
  const request: ChatRequest = { ...harness.request, maxReactIterations: 1 }

  const result = await harness.service.sendMessageWithReact(
    request,
    createWebContents(harness.events)
  )

  assert.equal(result.success, true)
  assert.equal(result.finalContent, undefined)
  assert.equal(harness.createParams.length, 1)
  assert.equal(
    harness.events.some((event) => event.type === 'user_interaction'),
    true
  )
})

test('用户中止时不触发上限收尾回复', async () => {
  const abortController = new AbortController()
  abortController.abort()
  const harness = createHarness({
    streams: [createContentStream('不应使用')],
    abortController
  })

  const result = await harness.service.sendMessageWithReact(
    harness.request,
    createWebContents(harness.events)
  )

  assert.equal(result.success, true)
  assert.equal(harness.createParams.length, 0)
  assert.equal(harness.events.at(-1)?.type, 'done')
  assert.equal(harness.events.at(-1)?.finalStatus, 'cancelled')
})

test('未知 OpenAI-compatible 提供商不发送专有 Prompt Cache 参数', async () => {
  const harness = createHarness({
    streams: [createContentStream('降级完成')],
    llmConfig: {
      base_url: 'http://unsupported-cache.local',
      api_key: 'key',
      model_name: 'model-unsupported-cache'
    }
  })

  const result = await harness.service.sendMessageWithReact(
    harness.request,
    createWebContents(harness.events)
  )

  const firstParams = harness.createParams[0] as StreamingParams & { prompt_cache_key?: string }

  assert.equal(result.success, true)
  assert.equal(harness.createParams.length, 1)
  assert.equal(firstParams.prompt_cache_key, undefined)
})

// ===== extractOriginalQuery =====

test('extractOriginalQuery 从最新消息中找到 user 消息', () => {
  const messages = [
    { role: 'user', content: '第一个问题' },
    { role: 'assistant', content: '回答' },
    { role: 'user', content: '第二个问题' }
  ]
  assert.equal(extractOriginalQuery(messages), '第二个问题')
})

test('extractOriginalQuery 没有 user 消息时返回空字符串', () => {
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'assistant', content: '回答' }
  ]
  assert.equal(extractOriginalQuery(messages), '')
})

test('extractOriginalQuery 空数组返回空字符串', () => {
  assert.equal(extractOriginalQuery([]), '')
})

test('extractOriginalQuery user 消息 content 为 null 时跳过', () => {
  const messages = [
    { role: 'user', content: null },
    { role: 'user', content: '有效问题' }
  ]
  assert.equal(extractOriginalQuery(messages), '有效问题')
})

test('extractOriginalQuery user 消息 content 为数组时跳过', () => {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: '多模态' }] },
    { role: 'user', content: '纯文本问题' }
  ]
  assert.equal(extractOriginalQuery(messages), '纯文本问题')
})

// ===== CapabilityComposer 集成 =====

test('paper 会话通过 capabilityManager 初始化能力状态', async () => {
  // 清理状态确保隔离
  capabilityManager.clearSession('react-loop-paper')

  const toolStreams = [createContentStream('论文解读结果')]
  const harness = createHarness({
    streams: toolStreams
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-paper',
    sessionType: 'paper',
    paperId: 'paper-001',
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const capState = capabilityManager.getCapabilities('react-loop-paper')
  assert.ok(capState, 'capabilityManager 应有该会话的能力状态')
  assert.equal(capState!.presetId, 'chat.paper', 'paper 会话应使用 chat.paper preset')
  assert.deepEqual(capState!.activeCapabilities, ['paper'], 'paper 会话默认应仅激活 paper')
})

test('default 会话通过 capabilityManager 初始化能力状态', async () => {
  capabilityManager.clearSession('react-loop-default-cap')

  const harness = createHarness({
    streams: [createContentStream('普通回答')]
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-default-cap',
    sessionType: 'default',
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const capState = capabilityManager.getCapabilities('react-loop-default-cap')
  assert.ok(capState, 'capabilityManager 应有该会话的能力状态')
  assert.equal(capState!.presetId, 'chat.default', 'default 会话应使用 chat.default preset')
  assert.deepEqual(capState!.activeCapabilities, [], 'default 会话应无默认激活能力')
})

test('enableLabTools 动态添加 lab 能力', async () => {
  capabilityManager.clearSession('react-loop-lab-enable')

  const harness = createHarness({
    streams: [createContentStream('lab 回答')]
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-lab-enable',
    sessionType: 'default',
    enableLabTools: true,
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const capState = capabilityManager.getCapabilities('react-loop-lab-enable')
  assert.ok(capState, 'capabilityManager 应有该会话的能力状态')
  assert.equal(capState!.presetId, 'chat.default', '预设仍为 chat.default')
  assert.deepEqual(
    capState!.activeCapabilities,
    ['lab'],
    'enableLabTools=true 时 default 会话应仅激活 lab'
  )
})

test('并发 ReAct 请求使用独立工具和提示词运行时快照', async () => {
  capabilityManager.clearSession('react-loop-concurrent-mcp')
  capabilityManager.clearSession('react-loop-concurrent-lab')

  const toolsByQuery = new Map<string, string[]>()
  const harness = createHarness({
    streams: [],
    createStreamForParams: (params) => {
      const latestUserMessage = [...params.messages]
        .reverse()
        .find((message) => message.role === 'user')
      const query =
        latestUserMessage && typeof latestUserMessage.content === 'string'
          ? latestUserMessage.content
          : ''
      const toolNames = (params.tools ?? []).flatMap((tool) =>
        tool.type === 'function' ? [tool.function.name] : []
      )
      toolsByQuery.set(query, toolNames)
      return createContentStream(`${query} 完成`)
    }
  })
  const mcpRequest: ChatRequest = {
    ...harness.request,
    messages: [{ role: 'user', content: '并发 MCP 请求' }],
    sessionId: 'react-loop-concurrent-mcp',
    turnId: 'turn-react-loop-concurrent-mcp'
  }
  const labRequest: ChatRequest = {
    ...harness.request,
    messages: [{ role: 'user', content: '并发 Lab 请求' }],
    sessionId: 'react-loop-concurrent-lab',
    turnId: 'turn-react-loop-concurrent-lab',
    selectedTools: undefined,
    enableLabTools: true,
    activeLabDiscipline: 'computer',
    activeLabId: 'lab-concurrent'
  }

  const [mcpResult, labResult] = await Promise.all([
    harness.service.sendMessageWithReact(mcpRequest, createWebContents(harness.events)),
    harness.service.sendMessageWithReact(labRequest, createWebContents(harness.events))
  ])

  assert.equal(mcpResult.success, true, mcpResult.error)
  assert.equal(labResult.success, true, labResult.error)

  const mcpTools = toolsByQuery.get('并发 MCP 请求') ?? []
  const labTools = toolsByQuery.get('并发 Lab 请求') ?? []
  assert.ok(mcpTools.includes('mock__lookup'))
  assert.equal(
    mcpTools.some((name) => name.startsWith('lab__')),
    false
  )
  assert.ok(labTools.some((name) => name.startsWith('lab__')))
  assert.equal(labTools.includes('mock__lookup'), false)
})

// ===== capability__suggest 虚拟工具注册 =====

test('存在可建议能力时工具列表中包含 capability__suggest', async () => {
  capabilityManager.clearSession('react-loop-suggest-tool')

  const harness = createHarness({
    streams: [createContentStream('普通回答')]
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-suggest-tool',
    sessionType: 'default',
    paperId: 'paper-001',
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const tools = harness.createParams[0]?.tools as Array<{ function: { name: string } }> | undefined
  assert.ok(tools, '应传入 tools')
  const hasSuggestTool = tools!.some((t) => t.function.name === 'capability__suggest')
  assert.equal(hasSuggestTool, true, '应包含 capability__suggest 虚拟工具')
})

test('全部能力已激活时不应包含 capability__suggest 工具', async () => {
  capabilityManager.clearSession('react-loop-no-suggest')

  const harness = createHarness({
    streams: [createContentStream('普通回答')]
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-no-suggest',
    sessionType: 'paper',
    paperId: 'paper-001',
    enableLabTools: true,
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const tools = harness.createParams[0]?.tools as Array<{ function: { name: string } }> | undefined
  const hasSuggestTool = tools?.some((t) => t.function.name === 'capability__suggest') ?? false
  assert.equal(hasSuggestTool, false, '不应包含 capability__suggest 虚拟工具')
})

// ===== capability__suggest 调用时发送 capability_suggestion 事件 =====

function createSuggestToolCallStream(): AsyncIterable<StreamChunk> {
  return createStream([
    {
      id: 'chunk-suggest',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'model',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-suggest',
                type: 'function',
                function: {
                  name: 'capability__suggest',
                  arguments: JSON.stringify({
                    capabilityId: 'lab',
                    reason: '需要代码执行来分析结果'
                  })
                }
              }
            ]
          }
        }
      ]
    } as StreamChunk
  ])
}

test('模型调用 capability__suggest 时发送 capability_suggestion 流事件', async () => {
  capabilityManager.clearSession('react-loop-suggest-event')

  const harness = createHarness({
    streams: [createSuggestToolCallStream()]
  })

  const request: ChatRequest = {
    ...harness.request,
    sessionId: 'react-loop-suggest-event',
    sessionType: 'paper',
    paperId: 'paper-001',
    selectedTools: undefined
  }

  await harness.service.sendMessageWithReact(request, createWebContents(harness.events))

  const suggestEvent = harness.events.find((e) => e.type === 'capability_suggestion')
  assert.ok(suggestEvent, '应发送 capability_suggestion 流事件')
  assert.equal(suggestEvent!.capabilitySuggestion?.capabilities?.[0]?.id, 'lab')
  assert.match(suggestEvent!.capabilitySuggestion?.capabilities?.[0]?.reason ?? '', /需要代码执行/)
})

test('选择知识库后注册 knowledge 工具，但论文结果不足时不自动搜索', async () => {
  capabilityManager.clearSession('react-loop-on-demand-knowledge')

  const originalPaperSearch = paperContextSearchToolService.search
  const originalKnowledgeGetTools = knowledgeToolService.getTools
  const originalKnowledgeCallTool = knowledgeToolService.callTool

  paperContextSearchToolService.search = async () => ({
    success: true,
    content: '短结果'
  })
  knowledgeToolService.getTools = async () => [
    {
      serverName: 'knowledge',
      name: 'knowledge__search',
      description: '搜索知识库',
      inputSchema: { type: 'object', properties: {}, required: [] }
    }
  ]
  knowledgeToolService.callTool = async () => ({
    success: true,
    content: '[来源: doc1]\n知识库补充内容'
  })

  try {
    const harness = createHarness({
      streams: [
        createNamedToolCallStream(0, 'paper__search_context'),
        createContentStream('综合回答')
      ]
    })

    const request: ChatRequest = {
      ...harness.request,
      sessionId: 'react-loop-on-demand-knowledge',
      sessionType: 'paper',
      paperId: 'paper-001',
      selectedTools: undefined
    }

    const result = await harness.service.sendMessageWithReact(
      request,
      createWebContents(harness.events),
      undefined,
      [{ id: 'kb-001', name: '测试知识库', description: '', documentCount: 1 }]
    )

    assert.equal(result.success, true)
    assert.equal(result.finalContent, '综合回答')
    assert.equal(harness.createParams.length, 2)
    assert.ok(
      harness.createParams[0].tools?.some(
        (tool) => tool.type === 'function' && tool.function.name === 'knowledge__search'
      )
    )

    const secondMessages = harness.createParams[1].messages
    const assistantMessage = secondMessages.find((message) => message.role === 'assistant') as
      | OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam
      | undefined
    assert.ok(assistantMessage?.tool_calls)

    const toolCallIds = assistantMessage.tool_calls.map((toolCall) => toolCall.id)
    const toolMessages = secondMessages.filter((message) => message.role === 'tool') as Array<{
      role: 'tool'
      tool_call_id: string
    }>

    assert.deepEqual(
      toolCallIds,
      toolMessages.map((message) => message.tool_call_id)
    )
    assert.deepEqual(toolCallIds, ['call-0'])
    assert.equal(
      harness.events.some((event) => event.type === 'knowledge_search'),
      false
    )

    const capState = capabilityManager.getCapabilities('react-loop-on-demand-knowledge')
    assert.ok(capState?.activeCapabilities.includes('knowledge'))
  } finally {
    paperContextSearchToolService.search = originalPaperSearch
    knowledgeToolService.getTools = originalKnowledgeGetTools
    knowledgeToolService.callTool = originalKnowledgeCallTool
  }
})
