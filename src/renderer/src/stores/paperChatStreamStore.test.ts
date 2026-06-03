import test from 'node:test'
import assert from 'node:assert/strict'
import { usePaperChatStreamStore, type PaperChatStreamState } from './paperChatStreamStore'
import { derivePaperChatStepContent } from '@renderer/components/paper/chat/message/paperChatReactStepContent'
import type { Message, StreamEvent } from '@renderer/types'

const sessionId = 'paper-session-test'
const turnId = 'assistant-turn-test'

function setupWindowApi(): void {
  Object.assign(globalThis, {
    window: {
      api: {
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {}
        },
        chat: {
          onStream: () => () => {},
          stop: async () => ({ success: true })
        },
        session: {
          load: async () => null,
          save: async () => ({ success: true })
        }
      }
    }
  })
}

function createStreamingMessages(): Message[] {
  return [
    {
      id: turnId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date().toISOString(),
      reactSteps: [],
      reactIterations: []
    }
  ]
}

function dispatch(store: PaperChatStreamState, event: StreamEvent, messages: Message[]): void {
  store.handleStreamEvent({ sessionId, turnId, ...event }, sessionId, messages)
}

function setupPlan(store: PaperChatStreamState, messages: Message[]): void {
  store.beginPlanning(sessionId, turnId)
  dispatch(
    store,
    {
      type: 'plan_generated',
      plan: {
        steps: [
          {
            index: 0,
            title: '写入项目文件',
            description: '创建项目文件',
            status: 'pending'
          }
        ]
      }
    },
    messages
  )
  dispatch(
    store,
    {
      type: 'plan_step_update',
      planStepUpdate: {
        index: 0,
        status: 'running'
      }
    },
    messages
  )
  dispatch(store, { type: 'react_iteration_start', content: '0', status: 'thinking' }, messages)
}

test.beforeEach(() => {
  setupWindowApi()
  usePaperChatStreamStore.getState().resetAllState()
})

test('tool_result 失败后不生成重复阶段摘要', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()
  setupPlan(store, messages)

  dispatch(
    store,
    {
      type: 'tool_call',
      toolCall: {
        id: 'tool-1',
        name: 'write_project_files',
        serverName: 'lab',
        arguments: {}
      }
    },
    messages
  )
  dispatch(
    store,
    {
      type: 'tool_result',
      toolResult: {
        id: 'tool-1',
        name: 'write_project_files',
        success: false,
        error: '写入文件失败'
      }
    },
    messages
  )

  const iteration = messages[0].reactIterations?.[0]
  assert.ok(iteration)

  const result = derivePaperChatStepContent(
    [
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'error',
        error: iteration.steps.find((step) => step.toolResult)?.toolResult?.error
      }
    ],
    '依赖安装成功'
  )

  assert.equal(result, null)
  assert.match(
    iteration.steps.find((step) => step.toolResult)?.toolResult?.error ?? '',
    /写入文件失败/
  )
})

test('plan_step_update failed 且没有工具结果时填充阶段失败内容', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()
  setupPlan(store, messages)

  dispatch(
    store,
    {
      type: 'plan_step_update',
      planStepUpdate: {
        index: 0,
        status: 'failed',
        error: '步骤执行超时'
      }
    },
    messages
  )

  const iteration = messages[0].reactIterations?.[0]
  assert.equal(iteration?.isActive, false)
  assert.equal(iteration?.status, 'complete')
  assert.match(iteration?.content ?? '', /执行失败/)
  assert.match(iteration?.content ?? '', /步骤执行超时/)
})

test('步骤终态后的后续 content 不再追加到该阶段', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()
  setupPlan(store, messages)

  dispatch(store, { type: 'content', content: '阶段正文' }, messages)
  dispatch(
    store,
    {
      type: 'plan_step_update',
      planStepUpdate: {
        index: 0,
        status: 'success',
        summary: '步骤完成'
      }
    },
    messages
  )
  dispatch(
    store,
    {
      type: 'plan_status',
      planStatus: {
        status: 'completed',
        summary: '最终总结'
      }
    },
    messages
  )
  dispatch(store, { type: 'content', content: '最终总结' }, messages)

  assert.equal(messages[0].content, '最终总结')
  assert.equal(messages[0].reactIterations?.[0]?.content, '阶段正文')
  assert.equal(messages[0].reactIterations?.[0]?.isActive, false)
})

test('非 Plan ReAct 正文只进入最终气泡，不进入步骤内容', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()

  dispatch(store, { type: 'react_iteration_start', content: '0', status: 'thinking' }, messages)
  dispatch(store, { type: 'content', content: '最终回答' }, messages)

  assert.equal(messages[0].content, '最终回答')
  assert.equal(messages[0].reactIterations?.[0]?.content, undefined)
})

// ===== capability_suggestion 事件处理 =====

test('capability_suggestion 事件设置能力建议状态', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()

  const suggestEvent: StreamEvent = {
    type: 'capability_suggestion',
    sessionId,
    turnId,
    capabilitySuggestion: {
      capabilities: [
        {
          id: 'lab',
          displayName: '实验室工具',
          description: '代码执行和容器操作',
          reason: '需要代码执行来分析实验结果'
        }
      ]
    }
  }

  dispatch(store, suggestEvent, messages)

  const state = usePaperChatStreamStore.getState()
  assert.equal(state.showCapabilitySuggestion, true)
  assert.ok(state.capabilitySuggestion)
  assert.equal(state.capabilitySuggestion!.capabilities[0].id, 'lab')
  assert.equal(state.capabilitySuggestion!.capabilities[0].reason, '需要代码执行来分析实验结果')
})

test('capability_suggestion 事件无 capabilitySuggestion 数据不改变状态', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()

  // 先清除之前的状态
  store.hideCapabilitySuggestion()

  dispatch(store, { type: 'capability_suggestion', sessionId, turnId }, messages)

  const state = usePaperChatStreamStore.getState()
  assert.equal(state.showCapabilitySuggestion, false)
  assert.equal(state.capabilitySuggestion, null)
})

test('hideCapabilitySuggestion 清除能力建议状态', () => {
  const store = usePaperChatStreamStore.getState()
  const messages = createStreamingMessages()

  dispatch(store, {
    type: 'capability_suggestion',
    sessionId,
    turnId,
    capabilitySuggestion: {
      capabilities: [{ id: 'lab', displayName: '实验室工具', description: '代码执行' }]
    }
  }, messages)

  store.hideCapabilitySuggestion()
  const state = usePaperChatStreamStore.getState()
  assert.equal(state.showCapabilitySuggestion, false)
  assert.equal(state.capabilitySuggestion, null)
})
