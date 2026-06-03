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
  reactRequests: ChatRequest[]
  planMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[][]
  warnings: Array<{ message: string; context?: Record<string, unknown> }>
}

function createHarness(
  stepResults: ChatResult[],
  planSteps: Array<{ title: string; description: string }> = [
    { title: '检查项目', description: '读取项目文件并验证状态' }
  ]
): Harness {
  const events: StreamEvent[] = []
  const reactRequests: ChatRequest[] = []
  const planMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = []
  const warnings: Array<{ message: string; context?: Record<string, unknown> }> = []
  const abortController = new AbortController()

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

  const reactLoopService = {
    sendMessageWithReact: async (request: ChatRequest): Promise<ChatResult> => {
      reactRequests.push(request)
      return stepResults.shift() || { success: true }
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
                    content: JSON.stringify({
                      steps: planSteps
                    })
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

  return { service, events, reactRequests, planMessages, warnings }
}

function createRequest(): ChatRequest {
  return {
    messages: [{ role: 'user', content: '检查并修复项目' }],
    modelKey: 'test-model',
    sessionId: 'session-plan-test',
    turnId: 'turn-plan-test',
    enableLabTools: true,
    sessionType: 'paper'
  }
}

test('计划步骤可恢复失败后会自动重试并最终完成', async () => {
  const harness = createHarness([
    { success: true, toolErrors: ['第一次工具失败'] },
    { success: true }
  ])

  const result = await harness.service.sendMessageWithPlan(createRequest(), {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      harness.events.push(event)
    }
  } as unknown as WebContents)

  assert.equal(result.success, true)
  assert.equal(harness.reactRequests.length, 2)
  assert.match(harness.reactRequests[1].messages.at(-1)?.content || '', /第一次工具失败/)

  const stepUpdates = harness.events
    .filter((event) => event.type === 'plan_step_update')
    .map((event) => event.planStepUpdate)

  assert.ok(
    stepUpdates.some((update) => update?.status === 'running' && update.attempt === 2),
    '第二次尝试应发送 running 更新'
  )
  assert.ok(
    stepUpdates.some((update) => update?.status === 'success' && update.attempt === 2),
    '重试成功应发送 success 更新'
  )

  const doneEvent = harness.events.find((event) => event.type === 'done')
  assert.equal(doneEvent?.finalStatus, 'completed')
})

test('计划步骤会把实验室标识和预览地址传递给后续步骤', async () => {
  const harness = createHarness(
    [
      {
        success: true,
        finalContent: 'React 实验室已创建',
        toolResults: [
          {
            toolCallId: 'call-create',
            toolName: 'lab__create_frontend_lab',
            success: true,
            content: JSON.stringify([
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    lab_id: 'lab-123',
                    container_id: 'container-123',
                    preview_url: 'http://127.0.0.1:35173',
                    project_root: '/workspace',
                    reused: false
                  },
                  null,
                  2
                )
              }
            ])
          }
        ]
      },
      { success: true }
    ],
    [
      { title: '创建实验室', description: '创建 React 前端实验室' },
      { title: '写入博客文件', description: '复用已有实验室写入博客项目文件' }
    ]
  )

  const result = await harness.service.sendMessageWithPlan(createRequest(), {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      harness.events.push(event)
    }
  } as unknown as WebContents)

  assert.equal(result.success, true)
  assert.equal(harness.reactRequests.length, 2)

  const secondStepPrompt = harness.reactRequests[1].messages.at(-1)?.content || ''
  assert.match(secondStepPrompt, /lab-123/)
  assert.match(secondStepPrompt, /container-123/)
  assert.match(secondStepPrompt, /http:\/\/127\.0\.0\.1:35173/)
  assert.match(secondStepPrompt, /\/workspace/)
  assert.match(secondStepPrompt, /不要重复创建同名实验室或容器/)
})

test('计划步骤会保留非零退出码命令的 stderr 作为后续观察', async () => {
  const harness = createHarness(
    [
      {
        success: true,
        toolResults: [
          {
            toolCallId: 'call-exec',
            toolName: 'lab__exec_command',
            success: true,
            content: JSON.stringify([
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    command: 'ls -la /app',
                    exit_code: 2,
                    duration_ms: 20,
                    stdout: '',
                    stderr: "ls: cannot access '/app': No such file or directory"
                  },
                  null,
                  2
                )
              }
            ])
          }
        ]
      },
      { success: true }
    ],
    [
      { title: '探查路径', description: '检查容器中的项目目录' },
      { title: '修正路径', description: '根据前序命令结果选择正确项目根目录' }
    ]
  )

  const result = await harness.service.sendMessageWithPlan(createRequest(), {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      harness.events.push(event)
    }
  } as unknown as WebContents)

  assert.equal(result.success, true)
  assert.equal(harness.reactRequests.length, 2)

  const secondStepPrompt = harness.reactRequests[1].messages.at(-1)?.content || ''
  assert.match(secondStepPrompt, /ls -la \/app/)
  assert.match(secondStepPrompt, /exit_code/)
  assert.match(secondStepPrompt, /No such file or directory/)
})

test('生成计划前会过滤最近历史中的孤立 tool 消息', async () => {
  const harness = createHarness([{ success: true }])
  const request = createRequest()
  request.messages = [
    { role: 'user', content: '先检索一下论文' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-outside',
          type: 'function',
          function: { name: 'paper__search_context', arguments: '{"query":"first"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call-outside', content: '{"matches":["old"]}' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-inside',
          type: 'function',
          function: { name: 'paper__search_context', arguments: '{"query":"second"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call-inside', content: '{"matches":["new"]}' },
    { role: 'user', content: '现在帮我规划实验' }
  ]

  const result = await harness.service.sendMessageWithPlan(request, {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      harness.events.push(event)
    }
  } as unknown as WebContents)

  assert.equal(result.success, true)
  assert.deepEqual(
    harness.planMessages[0].map((message) => message.role),
    ['system', 'assistant', 'tool', 'user']
  )
  const assistantMessage = harness.planMessages[0][1] as { tool_calls?: Array<{ id: string }> }
  const toolMessage = harness.planMessages[0][2] as { tool_call_id?: string }

  assert.equal(assistantMessage.tool_calls?.[0]?.id, 'call-inside')
  assert.equal(toolMessage.tool_call_id, 'call-inside')
})

test('计划步骤重试后仍失败时整体状态为 failed', async () => {
  const harness = createHarness([
    { success: true, toolErrors: ['第一次工具失败'] },
    { success: true, toolErrors: ['第二次工具失败'] }
  ])

  const result = await harness.service.sendMessageWithPlan(createRequest(), {
    isDestroyed: () => false,
    send: (_channel: string, event: StreamEvent) => {
      harness.events.push(event)
    }
  } as unknown as WebContents)

  assert.equal(result.success, false)
  assert.match(result.error || '', /第二次工具失败/)

  const failedUpdate = harness.events
    .filter((event) => event.type === 'plan_step_update')
    .map((event) => event.planStepUpdate)
    .find((update) => update?.status === 'failed')

  assert.equal(failedUpdate?.attempt, 2)
  assert.equal(failedUpdate?.maxAttempts, 2)

  const planStatus = harness.events
    .filter((event) => event.type === 'plan_status')
    .map((event) => event.planStatus?.status)

  assert.equal(planStatus.at(-1), 'failed')

  const doneEvent = harness.events.find((event) => event.type === 'done')
  assert.equal(doneEvent?.finalStatus, 'failed')
  assert.ok(
    harness.warnings.some((entry) => entry.message === '计划步骤执行失败'),
    '失败尝试应写入 warn 日志'
  )
})
