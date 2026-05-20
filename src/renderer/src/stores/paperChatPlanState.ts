import type {
  Message,
  PlanExecutionStatus,
  PlanStep,
  PlanStepStatus,
  ReActIteration,
  StreamEvent
} from '@renderer/types'
import type { ValueRef } from './paperChatReactIteration'

function createValueRef<T>(value: T): ValueRef<T> {
  return { value }
}

/** Plan 步骤内的 ReAct 迭代阶段 */
export interface PlanStepIteration {
  /** 步骤内阶段编号（1-based） */
  localPhaseNumber: number
  /** 步骤编号（1-based） */
  stepNumber: number
  /** 迭代中的工具调用摘要 */
  toolSummary?: string
  /** 迭代状态 */
  status: 'thinking' | 'calling_tools' | 'processing' | 'complete'
}

export interface PaperChatPlanState {
  sessionId: string
  turnId: string
  status: PlanExecutionStatus
  steps: PlanStep[]
  currentStepIndex: number
  error?: string
  summary?: string
  updatedAt: string
  stepIterations: Record<number, PlanStepIteration[]>
  globalPhaseCounter: number
}

export interface PlanStateManager {
  planStates: ValueRef<Map<string, PaperChatPlanState>>
  clonePlanSteps: (steps: PlanStep[]) => PlanStep[]
  normalizePlanStepStatus: (status: PlanStepStatus | string) => PlanStepStatus
  setPlanState: (sessionId: string, state: PaperChatPlanState) => void
  deletePlanState: (sessionId: string) => void
  getSessionPlanState: (sessionId: string) => PaperChatPlanState | null
  beginPlanning: (sessionId: string, turnId: string) => void
  resetPlanState: (sessionId: string) => void
  failPlanState: (sessionId: string, error: string) => void
  getWritablePlanState: (sessionId: string, turnId?: string) => PaperChatPlanState | null
  handlePlanStatusEvent: (sessionId: string, event: StreamEvent) => void
  handlePlanGeneratedEvent: (sessionId: string, event: StreamEvent) => void
  handlePlanStepUpdateEvent: (
    sessionId: string,
    event: StreamEvent,
    streamingMessage: Message | undefined,
    currentIterationIndex: ValueRef<Map<string, number>>
  ) => void
  isTerminalPlanStepStatus: (status: PlanStepStatus) => boolean
  finalizeMessageIterationsForPlanStep: (
    message: Message,
    sessionId: string,
    stepIndex: number,
    status: PlanStepStatus,
    currentIterationIndex: ValueRef<Map<string, number>>,
    error?: string
  ) => void
  appendPlanStepIteration: (sessionId: string, iterationStatus?: string) => void
  updatePlanStepIterationToolCall: (sessionId: string, toolName: string) => void
  finalizePlanState: (sessionId: string, event: StreamEvent) => void
}

/** 创建 Plan 状态管理器 */
export function usePlanStateManager(): PlanStateManager {
  const planStates = createValueRef<Map<string, PaperChatPlanState>>(new Map())

  function clonePlanSteps(steps: PlanStep[]): PlanStep[] {
    return steps.map((step) => ({
      ...step,
      status: normalizePlanStepStatus(step.status),
      attempt: step.attempt,
      maxAttempts: step.maxAttempts
    }))
  }

  function normalizePlanStepStatus(status: PlanStepStatus | string): PlanStepStatus {
    if (status === 'in_progress') return 'running'
    if (status === 'completed') return 'success'
    return status as PlanStepStatus
  }

  function setPlanState(sessionId: string, state: PaperChatPlanState): void {
    const next = new Map(planStates.value)
    next.set(sessionId, state)
    planStates.value = next
  }

  function deletePlanState(sessionId: string): void {
    if (!planStates.value.has(sessionId)) {
      return
    }
    const next = new Map(planStates.value)
    next.delete(sessionId)
    planStates.value = next
  }

  function getSessionPlanState(sessionId: string): PaperChatPlanState | null {
    return planStates.value.get(sessionId) ?? null
  }

  function beginPlanning(sessionId: string, turnId: string): void {
    setPlanState(sessionId, {
      sessionId,
      turnId,
      status: 'planning',
      steps: [],
      currentStepIndex: -1,
      updatedAt: new Date().toISOString(),
      stepIterations: {},
      globalPhaseCounter: 0
    })
  }

  function resetPlanState(sessionId: string): void {
    deletePlanState(sessionId)
  }

  function failPlanState(sessionId: string, error: string): void {
    const existing = planStates.value.get(sessionId)
    if (!existing) return
    setPlanState(sessionId, {
      ...existing,
      status: 'failed',
      error,
      updatedAt: new Date().toISOString()
    })
  }

  function getWritablePlanState(sessionId: string, turnId?: string): PaperChatPlanState | null {
    const existing = planStates.value.get(sessionId)
    if (!existing) {
      if (!turnId) return null
      return {
        sessionId,
        turnId,
        status: 'planning',
        steps: [],
        currentStepIndex: -1,
        updatedAt: new Date().toISOString(),
        stepIterations: {},
        globalPhaseCounter: 0
      }
    }

    if (turnId && existing.turnId !== turnId) {
      return null
    }

    // 深拷贝 stepIterations
    const stepIterationsCopy: Record<number, PlanStepIteration[]> = {}
    for (const [key, iters] of Object.entries(existing.stepIterations ?? {})) {
      stepIterationsCopy[Number(key)] = iters.map((iter) => ({ ...iter }))
    }

    return {
      ...existing,
      steps: clonePlanSteps(existing.steps),
      stepIterations: stepIterationsCopy,
      globalPhaseCounter: existing.globalPhaseCounter ?? 0
    }
  }

  function handlePlanStatusEvent(sessionId: string, event: StreamEvent): void {
    if (!event.planStatus) return
    const turnId = event.turnId || planStates.value.get(sessionId)?.turnId
    if (!turnId) return

    if (event.planStatus.status === 'idle') {
      deletePlanState(sessionId)
      return
    }

    const state = getWritablePlanState(sessionId, turnId)
    if (!state) return

    state.status = event.planStatus.status
    state.error = event.planStatus.error
    if (event.planStatus.summary) {
      state.summary = event.planStatus.summary
    }
    state.updatedAt = new Date().toISOString()
    setPlanState(sessionId, state)
  }

  function handlePlanGeneratedEvent(sessionId: string, event: StreamEvent): void {
    if (!event.plan) return
    const turnId = event.turnId || planStates.value.get(sessionId)?.turnId
    if (!turnId) return

    const state = getWritablePlanState(sessionId, turnId)
    if (!state) return

    state.status = 'planned'
    state.steps = clonePlanSteps(event.plan.steps)
    state.currentStepIndex = state.steps.findIndex((step) => step.status === 'running')
    state.updatedAt = new Date().toISOString()
    setPlanState(sessionId, state)
  }

  function handlePlanStepUpdateEvent(
    sessionId: string,
    event: StreamEvent,
    streamingMessage: Message | undefined,
    currentIterationIndex: ValueRef<Map<string, number>>
  ): void {
    if (!event.planStepUpdate) return
    const turnId = event.turnId || planStates.value.get(sessionId)?.turnId
    if (!turnId) return

    const state = getWritablePlanState(sessionId, turnId)
    if (!state) return

    const { index, status, summary, error, attempt, maxAttempts } = event.planStepUpdate
    const step = state.steps[index]
    if (!step) return

    step.status = normalizePlanStepStatus(status)
    if (summary !== undefined) step.summary = summary
    if (error !== undefined) {
      step.error = error
    } else if (step.status === 'running' || step.status === 'success') {
      step.error = undefined
    }
    if (attempt !== undefined) step.attempt = attempt
    if (maxAttempts !== undefined) step.maxAttempts = maxAttempts
    if (step.status === 'running') {
      state.currentStepIndex = index
      state.status = 'running'
    }
    if (step.status === 'failed') {
      state.error = error || step.error
    }
    // 步骤变为终态时，将该步骤的所有活跃迭代标记为 complete
    if (isTerminalPlanStepStatus(step.status)) {
      const stepIters = state.stepIterations[index]
      if (stepIters) {
        for (const iter of stepIters) {
          if (iter.status !== 'complete') {
            iter.status = 'complete'
          }
        }
      }
      if (streamingMessage) {
        finalizeMessageIterationsForPlanStep(
          streamingMessage,
          sessionId,
          index,
          step.status,
          currentIterationIndex,
          error || step.error
        )
      }
    }
    state.updatedAt = new Date().toISOString()
    setPlanState(sessionId, state)
  }

  function isTerminalPlanStepStatus(status: PlanStepStatus): boolean {
    return (
      status === 'success' || status === 'failed' || status === 'skipped' || status === 'cancelled'
    )
  }

  function finalizeMessageIterationsForPlanStep(
    message: Message,
    sessionId: string,
    stepIndex: number,
    status: PlanStepStatus,
    currentIterationIndex: ValueRef<Map<string, number>>,
    error?: string
  ): void {
    const taskNumber = stepIndex + 1
    const iterations = message.reactIterations?.filter(
      (iteration) => iteration.taskNumber === taskNumber
    )

    if (!iterations || iterations.length === 0) {
      return
    }

    for (const iteration of iterations) {
      iteration.isActive = false
      iteration.status = 'complete'

      if (status === 'failed' && !iterationHasToolResult(iteration)) {
        iteration.content = buildPlanStepFailureContent(error || '步骤执行失败')
      }
    }

    const currentIndex = currentIterationIndex.value.get(sessionId)
    const currentIteration =
      currentIndex !== undefined ? message.reactIterations?.[currentIndex] : undefined
    if (currentIteration?.taskNumber === taskNumber) {
      currentIterationIndex.value.delete(sessionId)
    }
  }

  function iterationHasToolResult(iteration: ReActIteration): boolean {
    return iteration.steps.some((step) => step.type === 'tool_result')
  }

  function buildPlanStepFailureContent(error: string): string {
    return `**执行失败**\n\n${error}`
  }

  /**
   * Plan 模式下：将新的 ReAct 迭代关联到当前执行的步骤
   */
  function appendPlanStepIteration(sessionId: string, iterationStatus?: string): void {
    const existing = planStates.value.get(sessionId)
    if (!existing) return
    if (existing.status !== 'running') return
    if (existing.currentStepIndex < 0) return

    const stepIndex = existing.currentStepIndex
    const stepNumber = stepIndex + 1
    const stepIters = existing.stepIterations[stepIndex] ?? []
    const localPhaseNumber = stepIters.length + 1
    const globalPhaseCounter = existing.globalPhaseCounter + 1

    const newIteration: PlanStepIteration = {
      localPhaseNumber,
      stepNumber,
      status: (iterationStatus as PlanStepIteration['status']) || 'thinking'
    }

    stepIters.push(newIteration)

    // 直接修改并设置新 Map 以触发响应性
    const next = new Map(planStates.value)
    next.set(sessionId, {
      ...existing,
      stepIterations: { ...existing.stepIterations, [stepIndex]: stepIters },
      globalPhaseCounter
    })
    planStates.value = next
  }

  /**
   * Plan 模式下：更新当前步骤最新迭代的工具调用摘要
   */
  function updatePlanStepIterationToolCall(sessionId: string, toolName: string): void {
    const existing = planStates.value.get(sessionId)
    if (!existing) return
    if (existing.status !== 'running') return
    if (existing.currentStepIndex < 0) return

    const stepIndex = existing.currentStepIndex
    const stepIters = existing.stepIterations[stepIndex]
    if (!stepIters || stepIters.length === 0) return

    const lastIter = stepIters[stepIters.length - 1]
    if (lastIter.status === 'thinking') {
      lastIter.status = 'calling_tools'
    }
    // 追加工具名到摘要
    const currentSummary = lastIter.toolSummary ?? ''
    lastIter.toolSummary = currentSummary ? `${currentSummary}, ${toolName}` : toolName

    const next = new Map(planStates.value)
    next.set(sessionId, { ...existing })
    planStates.value = next
  }

  function finalizePlanState(sessionId: string, event: StreamEvent): void {
    const existing = planStates.value.get(sessionId)
    if (!existing) return
    if (event.turnId && existing.turnId !== event.turnId) return

    const state = { ...existing, steps: clonePlanSteps(existing.steps) }
    if (event.finalStatus) {
      state.status = event.finalStatus
    } else if (event.type === 'error') {
      state.status = 'failed'
    } else if (
      state.status === 'planning' ||
      state.status === 'planned' ||
      state.status === 'running'
    ) {
      state.status = 'completed'
    }
    if (event.error) {
      state.error = event.error
    }
    const failedStep = state.steps.find((step) => step.status === 'failed')
    if (failedStep) {
      if (state.status === 'completed') {
        state.status = 'failed'
      }
      if (state.status === 'failed' && !state.error) {
        state.error = failedStep.error || '部分步骤执行失败'
      }
    }
    // 终态时将所有活跃迭代标记为 complete
    for (const iters of Object.values(state.stepIterations ?? {})) {
      for (const iter of iters) {
        if (iter.status !== 'complete') {
          iter.status = 'complete'
        }
      }
    }
    state.updatedAt = new Date().toISOString()
    setPlanState(sessionId, state)
  }

  return {
    planStates,
    clonePlanSteps,
    normalizePlanStepStatus,
    setPlanState,
    deletePlanState,
    getSessionPlanState,
    beginPlanning,
    resetPlanState,
    failPlanState,
    getWritablePlanState,
    handlePlanStatusEvent,
    handlePlanGeneratedEvent,
    handlePlanStepUpdateEvent,
    isTerminalPlanStepStatus,
    finalizeMessageIterationsForPlanStep,
    appendPlanStepIteration,
    updatePlanStepIterationToolCall,
    finalizePlanState
  }
}
