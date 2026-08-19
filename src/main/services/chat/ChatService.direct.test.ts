import test from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import { ChatService } from './ChatService.ts'
import { StreamHandler } from './StreamHandler.ts'
import { StopController } from './StopController.ts'
import { ModelRetryHandler } from './ModelRetryHandler.ts'
import type { Logger } from '@main/services/logger'
import type { ChatRequest, StreamEvent, TokenUsage } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'

type StreamChunk = OpenAI.Chat.Completions.ChatCompletionChunk
type StreamingParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

interface DirectHarnessOptions {
  /** 模型流式响应队列(按请求顺序消费) */
  streams?: AsyncIterable<StreamChunk>[]
  /** 预置错误队列(优先于 streams 消费) */
  errors?: unknown[]
  /** 已加载的 LLM 配置;不传则走 validateAndGetLLMConfig 返回 null 分支 */
  llmConfig?: LLMConfig
  /** 自定义 AbortController(用于模拟用户中止) */
  abortController?: AbortController
  /** 自定义 createStreamForParams(覆盖队列逻辑) */
  createStreamForParams?: (params: StreamingParams) => AsyncIterable<StreamChunk>
}

interface DirectHarness {
  /** 测试用 ChatService 实例(绕过重量级构造器,直接驱动 sendMessageDirect 原型方法) */
  service: InstanceType<typeof ChatService>
  /** 默认 Direct 路径请求(无工具/无知识库) */
  request: ChatRequest
  /** 收集到的 StreamEvent 序列 */
  events: StreamEvent[]
  /** 该会话的 AbortController */
  abortController: AbortController
  /** 捕获到的 createChatCompletion 请求参数 */
  createParams: StreamingParams[]
  /** stopController 引用(用于模拟停止) */
  stopController: StopController
}

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {}
} as unknown as Logger

/** 将 chunk 数组转成异步可迭代流 */
async function* createStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

/** 构造一个带 content delta 的 chunk */
function contentChunk(id: string, content: string): StreamChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'model',
    choices: [{ index: 0, delta: { content } }]
  } as unknown as StreamChunk
}

/** 构造一个带 reasoning_content delta 的 chunk */
function reasoningChunk(id: string, reasoning: string): StreamChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'model',
    choices: [{ index: 0, delta: { reasoning_content: reasoning } }]
  } as unknown as StreamChunk
}

/** 构造一个只携带 usage 的收尾 chunk */
function usageChunk(id: string, usage: TokenUsage): StreamChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'model',
    choices: [],
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens
    }
  } as unknown as StreamChunk
}

/**
 * 构造 Direct 路径测试夹具。
 *
 * 关键设计:通过 Object.create(ChatService.prototype) 绕过 ChatService 的
 * 重量级构造器(它会实例化 ReactLoopService/PlanExecuteService,触发
 * capabilityManager/preset 等全局单例的注册副作用)。sendMessageDirect
 * 只依赖 5 个协作者(stopController / streamHandler / modelRetryHandler /
 * createClient / validateAndGetLLMConfig),我们直接装配这些真实实例,
 * 仅替换两个 I/O 边界(createClient → fake OpenAI client,
 * validateAndGetLLMConfig → 返回测试配置)。
 *
 * 这样 sendMessageDirect 原型方法是真实代码,StreamHandler /
 * ModelRetryHandler / StopController 也是真实实例,夹具只替换 I/O 边界。
 */
function createDirectHarness(options: DirectHarnessOptions): DirectHarness {
  const events: StreamEvent[] = []
  const createParams: StreamingParams[] = []
  const streams = [...(options.streams ?? [])]
  const errors = [...(options.errors ?? [])]
  const abortController = options.abortController ?? new AbortController()

  // 真实 StopController:覆盖 getOrCreateAbortController,让测试注入预置 AbortController
  const stopController = new StopController()
  ;(
    stopController as unknown as { getOrCreateAbortController: () => AbortController }
  ).getOrCreateAbortController = () => abortController

  // 真实 StreamHandler:事件经 webContents.send 收集到 events
  const streamHandler = new StreamHandler()

  // 真实 ModelRetryHandler:checkStopped 走真实 stopController,delayWithAbort 走 stub
  const modelRetryHandler = new ModelRetryHandler({
    logger: noopLogger,
    checkStopped: (sessionId) => stopController.checkStopped(sessionId),
    delayWithAbort: async () => {}
  })

  // fake OpenAI client:chat.completions.create 返回队列中的 stream 或抛错
  const fakeClient = {
    chat: {
      completions: {
        create: async (params: StreamingParams): Promise<AsyncIterable<StreamChunk>> => {
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
  } as unknown as OpenAI

  // 通过原型链创建实例,绕过构造器,手动装配 sendMessageDirect 所需协作者
  const service = Object.create(ChatService.prototype) as InstanceType<typeof ChatService>
  Object.assign(service, {
    stopController,
    streamHandler,
    modelRetryHandler
  })
  // 覆盖两个 I/O 边界私有方法(运行时 TS 私有性不生效,直接赋值同名属性)
  ;(service as unknown as { createClient: (config: LLMConfig) => OpenAI }).createClient = () =>
    fakeClient
  ;(
    service as unknown as {
      validateAndGetLLMConfig: () => LLMConfig | null
    }
  ).validateAndGetLLMConfig = () => options.llmConfig ?? null

  const request: ChatRequest = {
    messages: [{ role: 'user', content: '你好' }],
    modelKey: 'model',
    sessionId: 'direct-test',
    turnId: 'turn-direct-test'
  }

  return { service, request, events, abortController, createParams, stopController }
}

/** 构造收集事件的 webContents */
function createWebContents(events: StreamEvent[]): WebContents {
  return {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => events.push(event)
  } as unknown as WebContents
}

/** 触发 sendMessageDirect(私有方法,运行时可访问) */
function callSendMessageDirect(
  service: DirectHarness['service'],
  request: ChatRequest,
  webContents: WebContents
): Promise<{ success: boolean; error?: string }> {
  const direct = (
    service as unknown as {
      sendMessageDirect: (
        request: ChatRequest,
        webContents: WebContents
      ) => Promise<{ success: boolean; error?: string }>
    }
  ).sendMessageDirect
  return direct.call(service, request, webContents)
}

// —— 场景 1:流式 content 正常输出并发 done(带 usage) ——

test('Direct 路径:流式 content 正常输出并发 done,done 携带 usage', async () => {
  const harness = createDirectHarness({
    llmConfig: {
      base_url: 'http://localhost',
      api_key: 'key',
      model_name: 'model'
    },
    streams: [
      createStream([
        contentChunk('c1', '你'),
        contentChunk('c2', '好'),
        contentChunk('c3', '!'),
        usageChunk('c4', {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        })
      ])
    ]
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, true)
  const contentEvents = harness.events.filter((e) => e.type === 'content')
  const doneEvents = harness.events.filter((e) => e.type === 'done')
  assert.equal(contentEvents.length, 3, '应发送 3 条 content 事件')
  assert.equal(
    contentEvents.map((e) => e.content).join(''),
    '你好!',
    'content 顺序拼接应等于模型输出'
  )
  assert.equal(doneEvents.length, 1, '应发送 1 条 done 事件')
  assert.equal(doneEvents[0].finalStatus, 'completed', '正常完成时 finalStatus 为 completed')
  assert.equal(doneEvents[0].usage?.prompt_tokens, 10, 'done 事件应携带 usage')
  assert.equal(doneEvents[0].usage?.completion_tokens, 5)
  assert.equal(doneEvents[0].usage?.total_tokens, 15)
})

// —— 场景 2:<think> 标签解析为 reasoning,正文走 content ——

test('Direct 路径:<think> 标签内容解析为 reasoning,正文走 content', async () => {
  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    streams: [
      createStream([
        // 思考块与正文交织,验证 splitThinkTaggedContent 状态机
        contentChunk('c1', '<think>这是推理</think>'),
        contentChunk('c2', '正文内容')
      ])
    ]
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, true)
  const reasoningEvents = harness.events.filter((e) => e.type === 'reasoning')
  const contentEvents = harness.events.filter((e) => e.type === 'content')
  assert.equal(
    reasoningEvents.map((e) => e.content).join(''),
    '这是推理',
    '<think> 内的内容应作为 reasoning 输出'
  )
  assert.equal(
    contentEvents.map((e) => e.content).join(''),
    '正文内容',
    '</think> 外的内容应作为 content 输出'
  )
})

// —— 场景 2b:reasoning_content 原生字段直传为 reasoning ——

test('Direct 路径:delta.reasoning_content 直传为 reasoning 事件', async () => {
  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    streams: [createStream([reasoningChunk('r1', '原生推理'), contentChunk('c1', '正文')])]
  })
  const webContents = createWebContents(harness.events)

  await callSendMessageDirect(harness.service, harness.request, webContents)

  const reasoningEvents = harness.events.filter((e) => e.type === 'reasoning')
  const contentEvents = harness.events.filter((e) => e.type === 'content')
  assert.equal(reasoningEvents.map((e) => e.content).join(''), '原生推理')
  assert.equal(contentEvents.map((e) => e.content).join(''), '正文')
})

// —— 场景 3:abort 中断流式输出,发 cancelled done,不发 completed ——

test('Direct 路径:abort 中断流式输出,发 cancelled done 且 success 为 true', async () => {
  // 自定义流:yield 第一个 chunk 后抛出 AbortError,模拟流中段被中止。
  // createChatCompletionWithRetry 在流消费期间遇到 AbortError 会原样抛出,
  // sendMessageDirect 的 catch 分支识别 error.name === 'AbortError' 后发 cancelled done。
  async function* abortableStream(): AsyncIterable<StreamChunk> {
    yield contentChunk('c1', '部分')
    const err = new Error('Request was stopped by user')
    err.name = 'AbortError'
    throw err
  }

  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    streams: [abortableStream()]
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, true, 'AbortError 分支返回 success: true')
  const doneEvents = harness.events.filter((e) => e.type === 'done')
  assert.equal(doneEvents.length, 1, '应发送 1 条 done')
  assert.equal(doneEvents[0].finalStatus, 'cancelled', 'abort 后 finalStatus 为 cancelled')
  assert.equal(doneEvents[0].usage, undefined, 'abort 时 done 不带 usage')
  // 中断前的 content 增量不回滚
  const contentEvents = harness.events.filter((e) => e.type === 'content')
  assert.equal(contentEvents.length, 1, '中断前的 content 仍保留')
})

// —— 场景 4:模型 API 错误发 error 事件,返回 success: false ——

test('Direct 路径:模型 API 错误发 error 事件并返回失败', async () => {
  const apiError: unknown = Object.assign(new Error('模型服务内部错误'), { status: 500 })
  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    // 500 属于可重试状态码(ModelRetryHandler RETRYABLE_MODEL_STATUS_CODES 含 5xx),
    // 会重试最多 3 次;delayWithAbort 已 stub 为 noop,提供 3 个相同错误耗尽重试。
    errors: [apiError, apiError, apiError]
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, false, '模型错误应返回 success: false')
  assert.equal(result.error, '模型服务内部错误', '返回值携带归一化错误消息')
  const errorEvents = harness.events.filter((e) => e.type === 'error')
  assert.equal(errorEvents.length, 1, '应发送 1 条 error 事件')
  assert.equal(errorEvents[0].error, '模型服务内部错误')
  assert.equal(errorEvents[0].finalStatus, 'failed', 'error 事件 finalStatus 为 failed')
  const doneEvents = harness.events.filter((e) => e.type === 'done')
  assert.equal(doneEvents.length, 0, '错误分支不发 done')
})

// —— 场景 5:配置验证失败(无 llmConfig)直接返回失败,不发流式事件 ——

test('Direct 路径:配置验证失败时直接返回失败,不创建客户端', async () => {
  const harness = createDirectHarness({
    // 不传 llmConfig → validateAndGetLLMConfig 返回 null
    streams: []
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, false)
  assert.equal(result.error, '配置验证失败')
  assert.equal(harness.events.length, 0, '配置失败分支不发任何 StreamEvent')
  assert.equal(harness.createParams.length, 0, '配置失败时不调用 createChatCompletion')
})

// —— 场景 6:会话已停止时发 cancelled done 并返回 success ——

test('Direct 路径:请求开始时会话已被停止,发 cancelled done', async () => {
  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    streams: []
  })
  // 在调用前标记会话已停止(stopRequest 会 abort 并清理 controller)
  harness.stopController.stopRequest(harness.request.sessionId)
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(result.success, true)
  const doneEvents = harness.events.filter((e) => e.type === 'done')
  assert.equal(doneEvents.length, 1)
  assert.equal(doneEvents[0].finalStatus, 'cancelled', '已停止会话发 cancelled done')
  assert.equal(harness.createParams.length, 0, '已停止时不调用模型')
})

// —— 场景 7:请求参数注入 stream 与 stream_options.include_usage ——

test('Direct 路径:请求参数携带 stream:true 与 include_usage', async () => {
  const harness = createDirectHarness({
    llmConfig: { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    streams: [createStream([contentChunk('c1', 'ok')])]
  })
  const webContents = createWebContents(harness.events)

  await callSendMessageDirect(harness.service, harness.request, webContents)

  assert.equal(harness.createParams.length, 1, '应发起 1 次模型请求')
  const params = harness.createParams[0]
  assert.equal(params.model, 'model', '应使用 llmConfig.model_name')
  assert.equal(params.stream, true, 'Direct 路径强制 stream:true')
  assert.equal(
    params.stream_options?.include_usage,
    true,
    '应携带 stream_options.include_usage 以接收 usage'
  )
})

// —— 场景 8:OpenAI 官方 API 上 Prompt Cache 参数不被支持时降级重试 ——
//
// 覆盖 B0-1 Step 3 要求的"prompt cache 降级(hasPromptCacheParameters → 失败时 strip 重试)"路径。
// 该降级逻辑位于 ModelRetryHandler.createChatCompletionWithRetry,夹具装配的是真实
// ModelRetryHandler 实例,因此可端到端验证整条链路:
//   1. base_url 指向 api.openai.com → applyPromptCacheOptions 注入 prompt_cache_key /
//      prompt_cache_retention
//   2. 首次模型调用抛出 isPromptCacheParameterUnsupportedError 命中的错误
//   3. ModelRetryHandler 自动 stripPromptCacheOptions 后重试
//   4. 重试(无缓存参数)成功 → 流式输出正常完成
// createStreamForParams 根据入参是否携带 prompt_cache_key 区分首次与重试两次调用。

test('Direct 路径:OpenAI 官方 API 上 Prompt Cache 参数不被支持时降级 strip 重试', async () => {
  const successStream = createStream([contentChunk('ok', '降级后成功')])

  const harness = createDirectHarness({
    llmConfig: {
      base_url: 'https://api.openai.com/v1',
      api_key: 'key',
      model_name: 'gpt-4o-mini'
    },
    createStreamForParams: (params) => {
      // 首次调用携带 prompt_cache_key(由 applyPromptCacheOptions 注入),
      // 抛出 isPromptCacheParameterUnsupportedError 命中的错误触发降级;
      // 重试调用参数已被 strip,返回成功流。
      if ('prompt_cache_key' in params && params.prompt_cache_key) {
        throw Object.assign(new Error("unknown parameter: 'prompt_cache_key' is unsupported"), {
          status: 400
        })
      }
      return successStream
    }
  })
  const webContents = createWebContents(harness.events)

  const result = await callSendMessageDirect(harness.service, harness.request, webContents)

  // 重试发生:create 被调用 2 次(首次带缓存参数失败,二次 strip 后成功)
  assert.equal(harness.createParams.length, 2, '应发生 1 次降级重试,共 2 次模型请求')
  // 首次入参携带缓存参数
  assert.ok(
    'prompt_cache_key' in harness.createParams[0] &&
      Boolean(harness.createParams[0].prompt_cache_key),
    '首次请求应携带 prompt_cache_key'
  )
  // 重试入参已被 strip
  assert.ok(
    !('prompt_cache_key' in harness.createParams[1] && harness.createParams[1].prompt_cache_key),
    '重试请求应移除 prompt_cache_key'
  )
  // 最终结果成功
  assert.equal(result.success, true, '降级重试成功后返回 success: true')
  const contentEvents = harness.events.filter((e) => e.type === 'content')
  assert.equal(contentEvents.map((e) => e.content).join(''), '降级后成功', '应输出重试流的内容')
  const doneEvents = harness.events.filter((e) => e.type === 'done')
  assert.equal(doneEvents.length, 1, '应发送 1 条 done 事件')
  assert.equal(doneEvents[0].finalStatus, 'completed', '正常完成时 finalStatus 为 completed')
})
