import test from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import { PlanExecuteService } from './PlanExecuteService'
import { StreamHandler } from './StreamHandler'
import type { ReactLoopService } from './ReactLoopService'
import type { StopController } from './StopController'
import type { ChatRequest, ChatResult, StreamEvent } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'
import type { Logger } from '@main/services/logger'

interface Harness {
  service: PlanExecuteService
  events: StreamEvent[]
  reactRequests: Array<{
    request: ChatRequest
    runtimeOptions: unknown
  }>
  /** 可变计数器对象,通过引用共享给 reactImpl,避免返回时被快照为 0 */
  reactCounter: { count: number }
  planMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[][]
  warnings: Array<{ message: string; context?: Record<string, unknown> }>
  abortController: AbortController
}

interface CreateHarnessOptions {
  /** LLM 返回的 plan content;默认生成有效 JSON */
  planContent?: string
  /** reactLoopService.sendMessageWithReact 的行为 */
  reactImpl?: (request: ChatRequest, runtimeOptions: unknown) => Promise<ChatResult>
  /** 步骤定义,用于生成有效的 plan JSON */
  planSteps?: Array<{ title: string; description: string }>
}

/**
 * 构建测试夹具:参考 PlanExecuteService.test.ts:21-98 的 createHarness,
 * 扩展支持空计划(无效 JSON)与 abort 级联场景。
 *
 * 关键扩展:
 * - planContent:覆盖 LLM 返回内容,用于模拟"计划 JSON 解析失败 → 空计划回退"
 * - reactImpl:覆盖 sendMessageWithReact 的具体行为,用于模拟"步骤抛 AbortError"
 */
function createHarness(options: CreateHarnessOptions = {}): Harness {
  const events: StreamEvent[] = []
  const reactRequests: Array<{ request: ChatRequest; runtimeOptions: unknown }> = []
  const reactCounter = { count: 0 }
  const planMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = []
  const warnings: Array<{ message: string; context?: Record<string, unknown> }> = []
  const abortController = new AbortController()

  const planSteps = options.planSteps ?? [
    { title: '步骤一', description: '执行第一项任务' },
    { title: '步骤二', description: '执行第二项任务' },
    { title: '步骤三', description: '执行第三项任务' }
  ]

  const planContent = options.planContent ?? JSON.stringify({ steps: planSteps })

  const logger = {
    debug: () => {},
    info: () => {},
    warn: (message: string, _source?: string, context?: Record<string, unknown>) => {
      warnings.push({ message, context })
    },
    error: () => {},
    fatal: () => {}
  } as unknown as Logger

  const stopController = {
    isStopped: () => false,
    getOrCreateAbortController: () => abortController,
    checkStopped: () => {},
    deleteAbortController: () => {},
    clearStoppedSession: () => {},
    deletePendingUserInteraction: () => {}
  } as unknown as StopController

  const defaultReactImpl = async (): Promise<ChatResult> => ({ success: true })
  const reactImpl = options.reactImpl ?? defaultReactImpl

  const reactLoopService = {
    sendMessageWithReact: async (
      request: ChatRequest,
      _webContents: WebContents,
      _knowledgeResults?: unknown,
      _selectedKnowledgeBases?: unknown,
      runtimeOptions?: unknown
    ): Promise<ChatResult> => {
      reactCounter.count += 1
      reactRequests.push({ request, runtimeOptions })
      return reactImpl(request, runtimeOptions)
    }
  } as unknown as ReactLoopService

  const createClient = (): OpenAI =>
    ({
      chat: {
        completions: {
          create: async (params: {
            messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
          }) => {
            planMessages.push(params.messages)
            return {
              choices: [
                {
                  message: {
                    content: planContent
                  }
                }
              ]
            }
          }
        }
      }
    }) as unknown as OpenAI

  const service = new PlanExecuteService({
    logger,
    stopController,
    streamHandler: new StreamHandler(),
    createClient,
    validateAndGetLLMConfig: () =>
      ({
        base_url: 'http://localhost',
        api_key: 'key',
        model_name: 'model'
      }) as LLMConfig,
    reactLoopService
  })

  return {
    service,
    events,
    reactRequests,
    reactCounter,
    planMessages,
    warnings,
    abortController
  }
}

function createWebContents(events: StreamEvent[]): WebContents {
  return {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      events.push(event)
    }
  } as unknown as WebContents
}

function createRequest(): ChatRequest {
  return {
    messages: [{ role: 'user', content: '帮我规划并完成一个任务' }],
    modelKey: 'test-model',
    sessionId: 'session-plan-fallback',
    turnId: 'turn-plan-fallback',
    sessionType: 'paper'
  }
}

test('空计划回退到普通 React 模式:LLM 返回无效 JSON 时委托 reactLoopService', async () => {
  // LLM 返回无法解析为计划 JSON 的内容 → parsePlanResponse 返回 null → generatePlan 返回空 steps
  // → sendMessageWithPlan 在 :155-175 回退到 reactLoopService.sendMessageWithReact
  const harness = createHarness({
    planContent: '这不是一段合法的 JSON,无法解析为计划'
  })

  const result = await harness.service.sendMessageWithPlan(
    createRequest(),
    createWebContents(harness.events)
  )

  // 回退到 React:sendMessageWithReact 被调用一次
  assert.equal(
    harness.reactCounter.count,
    1,
    '空计划应回退到 reactLoopService.sendMessageWithReact 一次'
  )

  // 回退时传入的 request 应保留原始消息
  const fallbackRequest = harness.reactRequests[0]?.request
  assert.ok(fallbackRequest, '回退调用必须携带 request')
  assert.equal(fallbackRequest.messages.length, 1, '回退请求应携带原始用户消息')

  // 回退前的 plan_status 应先发 idle(清空计划状态)
  const planStatuses = harness.events
    .filter((event) => event.type === 'plan_status')
    .map((event) => event.planStatus?.status)
  assert.ok(planStatuses.includes('idle'), '空计划回退前应发送 idle 状态清空前端计划视图')

  // 不应发送 plan_generated / running 等计划执行态事件
  const hasPlanGenerated = harness.events.some((event) => event.type === 'plan_generated')
  assert.equal(hasPlanGenerated, false, '空计划不应发送 plan_generated 事件')

  // 结果由 reactLoopService 决定(此处默认 success:true)
  assert.equal(result.success, true)

  // 回退时传入的 runtimeOptions 应携带共享 abortController 且 preserveAbortController:true
  const runtimeOptions = harness.reactRequests[0]?.runtimeOptions as
    | {
        abortController?: AbortController
        preserveAbortController?: boolean
      }
    | undefined
  assert.equal(
    runtimeOptions?.abortController,
    harness.abortController,
    '回退时应共享已有的 abortController'
  )
  assert.equal(
    runtimeOptions?.preserveAbortController,
    true,
    '回退时应保留 abortController 由 PlanExecute 统一清理'
  )
})

test('AbortError 步骤级联:中途抛 AbortError 时后续步骤标记 cancelled', async () => {
  // 3 个步骤:第 1 步成功,第 2 步抛 AbortError → 后续步骤(第 3 步)被标记 cancelled
  const harness = createHarness({
    planSteps: [
      { title: '第一步', description: '会成功' },
      { title: '第二步', description: '会 abort' },
      { title: '第三步', description: '应被标记 cancelled' }
    ],

    reactImpl: (_request, _opts): Promise<ChatResult> => {
      const callIndex = harness.reactCounter.count // 当前是第几次调用(1-based)
      if (callIndex === 2) {
        // 第 2 步抛 AbortError,触发 :281-300 的级联取消
        const err = new Error('用户中止')
        err.name = 'AbortError'
        throw err
      }
      return Promise.resolve({ success: true, finalContent: `步骤 ${callIndex} 完成` })
    }
  })

  const result = await harness.service.sendMessageWithPlan(
    createRequest(),
    createWebContents(harness.events)
  )

  // AbortError 应被捕获并返回 success:true(:300)
  assert.equal(result.success, true)

  // 应只执行到第 2 步(第 3 步不再调用 reactLoopService)
  assert.equal(harness.reactCounter.count, 2, '第 2 步 abort 后不应再执行第 3 步')

  // plan_status 最终应为 cancelled
  const planStatuses = harness.events
    .filter((event) => event.type === 'plan_status')
    .map((event) => event.planStatus?.status)
  assert.equal(planStatuses.at(-1), 'cancelled', 'AbortError 后 plan_status 最终应为 cancelled')

  // done 事件的 finalStatus 应为 cancelled
  const doneEvent = harness.events.find((event) => event.type === 'done')
  assert.equal(doneEvent?.finalStatus, 'cancelled')

  // 步骤状态:第 2 步之后的剩余步骤应被标记 cancelled(markRemainingStepsCancelled)
  const stepUpdates = harness.events
    .filter((event) => event.type === 'plan_step_update')
    .map((event) => event.planStepUpdate)

  // 第 3 步(index=2)应出现 cancelled 状态
  const step3Cancelled = stepUpdates.find(
    (update) => update?.index === 2 && update?.status === 'cancelled'
  )
  assert.ok(step3Cancelled, '第 3 步应被标记为 cancelled')
  assert.equal(step3Cancelled?.error, '用户已取消')

  // 第 1 步应保持 success(不应被级联取消)
  const step1Success = stepUpdates.find(
    (update) => update?.index === 0 && update?.status === 'success'
  )
  assert.ok(step1Success, '第 1 步应保持 success 不受 abort 影响')

  // cancelled 状态的步骤的错误信息应为"用户已取消"
  assert.ok(
    stepUpdates.some((update) => update?.status === 'cancelled' && update?.error === '用户已取消'),
    '级联取消步骤的 error 应为"用户已取消"'
  )
})

test('AbortError 在规划阶段抛出时也标记为 cancelled', async () => {
  // 规划阶段(createClient.chat.completions.create)抛 AbortError → 同样进入 :281-300 分支
  // 此场景下 planSteps 为空,currentStepIndex 为 -1,markRemainingStepsCancelled 不应崩溃
  const harness = createHarness({
    planContent: '占位内容,不会用到'
  })

  // 替换 createClient 使其抛 AbortError(模拟规划阶段中止)
  // 由于 createClient 在 createHarness 内闭包绑定,这里通过重新构造 service 实现
  const abortController = harness.abortController
  const reactRequests: Array<{ request: ChatRequest; runtimeOptions: unknown }> = []
  const events: StreamEvent[] = []
  const warnings: Array<{ message: string; context?: Record<string, unknown> }> = []

  const logger = {
    debug: () => {},
    info: () => {},
    warn: (message: string, _source?: string, context?: Record<string, unknown>) => {
      warnings.push({ message, context })
    },
    error: () => {},
    fatal: () => {}
  } as unknown as Logger

  const stopController = {
    isStopped: () => false,
    getOrCreateAbortController: () => abortController,
    checkStopped: () => {},
    deleteAbortController: () => {},
    clearStoppedSession: () => {},
    deletePendingUserInteraction: () => {}
  } as unknown as StopController

  const createClient = (): OpenAI =>
    ({
      chat: {
        completions: {
          create: async () => {
            const err = new Error('规划阶段中止')
            err.name = 'AbortError'
            throw err
          }
        }
      }
    }) as unknown as OpenAI

  const reactLoopService = {
    sendMessageWithReact: async (request: ChatRequest, _wc: WebContents) => {
      reactRequests.push({ request, runtimeOptions: undefined })
      return { success: true }
    }
  } as unknown as ReactLoopService

  const service = new PlanExecuteService({
    logger,
    stopController,
    streamHandler: new StreamHandler(),
    createClient,
    validateAndGetLLMConfig: () =>
      ({
        base_url: 'http://localhost',
        api_key: 'key',
        model_name: 'model'
      }) as LLMConfig,
    reactLoopService
  })

  const result = await service.sendMessageWithPlan(createRequest(), createWebContents(events))

  // AbortError 被捕获,返回 success:true
  assert.equal(result.success, true)

  // 不应回退到 reactLoopService(规划阶段就 abort,不走步骤循环)
  assert.equal(reactRequests.length, 0, '规划阶段 abort 不应回退到 reactLoopService')

  // plan_status 最终应为 cancelled
  const planStatuses = events
    .filter((event) => event.type === 'plan_status')
    .map((event) => event.planStatus?.status)
  assert.equal(planStatuses.at(-1), 'cancelled')

  // done 事件 finalStatus 为 cancelled
  const doneEvent = events.find((event) => event.type === 'done')
  assert.equal(doneEvent?.finalStatus, 'cancelled')
})
