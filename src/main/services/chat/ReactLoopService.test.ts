import test from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import { ReactLoopService } from './ReactLoopService.ts'
import { StreamHandler } from './StreamHandler.ts'
import type { StopController } from './StopController.ts'
import type { ChatRequest, StreamEvent } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'
import type { Logger } from '@main/services/logger'
import type { MCPService } from '@main/services/mcp'
import type { MCPToolCallResult } from '@shared/types/mcp'

type StreamChunk = OpenAI.Chat.Completions.ChatCompletionChunk
type StreamingParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

interface HarnessOptions {
  streams: AsyncIterable<StreamChunk>[]
  toolResult?: MCPToolCallResult
  abortController?: AbortController
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
    getAllTools: () => [],
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
      options.toolResult ?? { success: true, content: { ok: true } }
  } as unknown as MCPService

  const createClient = (): OpenAI =>
    ({
      chat: {
        completions: {
          create: async (params: StreamingParams) => {
            createParams.push(params)
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
      ({
        base_url: 'http://localhost',
        api_key: 'key',
        model_name: 'model'
      }) as LLMConfig
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

  assert.equal(result.success, true)
  assert.equal(result.finalContent, '最终回答')
  assert.equal(harness.createParams.length, 13)
  assert.equal(harness.events.filter((event) => event.type === 'tool_call').length, 12)
  assert.equal(
    harness.createParams.every((params) => Array.isArray(params.tools)),
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

  assert.equal(result.success, true)
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
  assert.equal(harness.createParams.length, 2)
  assert.equal(
    harness.createParams.every((params) => Array.isArray(params.tools)),
    true
  )
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
