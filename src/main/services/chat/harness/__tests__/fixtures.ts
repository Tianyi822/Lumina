// src/main/services/chat/harness/__tests__/fixtures.ts
/**
 * Harness 测试夹具。后续所有中间件/引擎测试用此构造 ctx。
 */
import type { HarnessContext, HarnessState, SessionType, EngineKind } from '../HarnessContext'
import { DEFAULT_HARNESS_CONFIG } from '../config/defaultConfig'
import { TraceRecorder } from '../trace/TraceRecorder'

interface TestContextOverrides {
  requestId?: string
  sessionId?: string
  sessionType?: SessionType
  userMessage?: string
  paperId?: string
  isSharedPaperSession?: boolean
  state?: Partial<HarnessState>
}

/**
 * 构造测试用 HarnessContext。
 * - trace 为内存版 TraceRecorder,通过 trace.getEvents() 断言
 * - config 默认使用 DEFAULT_HARNESS_CONFIG(三层默认值的第 1 层)
 */
export function createTestContext(overrides: TestContextOverrides = {}): HarnessContext {
  const defaultState: HarnessState = {
    engineKind: 'react' as EngineKind,
    iteration: 0,
    tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    toolCallCount: 0,
    toolCallHistory: [],
    iterationHistory: [],
    abortController: new AbortController(),
    budget: {
      iterationsRemaining: 30,
      tokensRemaining: 60_000,
      toolCallsRemaining: 40
    },
    flags: {
      budgetExhausted: false,
      forcedFinalize: false,
      duplicateBlocked: false,
      userInteractionPending: false
    },
    ...overrides.state
  }

  const trace = new TraceRecorder({
    requestId: overrides.requestId ?? 'test-req-1',
    sessionId: overrides.sessionId ?? 'test-sess-1',
    sessionType: overrides.sessionType ?? 'default',
    paperId: overrides.paperId
  })

  return {
    requestId: overrides.requestId ?? 'test-req-1',
    sessionId: overrides.sessionId ?? 'test-sess-1',
    sessionType: overrides.sessionType ?? 'default',
    userMessage: overrides.userMessage ?? '',
    conversationMessages: [],
    paperId: overrides.paperId,
    isSharedPaperSession: overrides.isSharedPaperSession ?? false,
    config: DEFAULT_HARNESS_CONFIG,
    state: defaultState,
    trace,
    meta: {}
  }
}
