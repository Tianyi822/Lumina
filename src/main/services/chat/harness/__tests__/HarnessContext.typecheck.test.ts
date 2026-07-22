// src/main/services/chat/harness/__tests__/HarnessContext.typecheck.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { HarnessContext, ToolCallRecord, BudgetState, EngineKind } from '../HarnessContext'
import { TraceRecorder } from '../trace/TraceRecorder'

test('HarnessContext 类型可导入且结构正确', () => {
  // 构造一个最小 ctx 验证类型(运行时不执行真实逻辑)
  const ctx = {
    requestId: 'r1',
    sessionId: 's1',
    sessionType: 'paper',
    userMessage: 'hello',
    conversationMessages: [],
    paperId: 'p1',
    isSharedPaperSession: false,
    config: {} as never,
    state: {
      engineKind: 'react' as EngineKind,
      iteration: 0,
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      toolCallCount: 0,
      toolCallHistory: [] as ToolCallRecord[],
      iterationHistory: [],
      abortController: new AbortController(),
      budget: {} as BudgetState,
      flags: {
        budgetExhausted: false,
        forcedFinalize: false,
        duplicateBlocked: false,
        userInteractionPending: false
      }
    },
    trace: new TraceRecorder({
      requestId: 'r1',
      sessionId: 's1',
      sessionType: 'paper',
      paperId: 'p1'
    }),
    meta: {}
  } satisfies HarnessContext

  assert.equal(ctx.sessionType, 'paper')
  assert.equal(ctx.state.iteration, 0)
})
