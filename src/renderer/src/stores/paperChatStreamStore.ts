// 聊天流状态 Store
// 管理聊天流状态，包括多会话并发、流式事件处理

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Message,
  PlanExecutionStatus,
  PlanStep,
  PlanStepStatus,
  ReActIteration,
  ReActStep,
  StreamEvent,
  UserInteractionRequest
} from '@renderer/types'
import { usePaperChatMessageCacheStore } from './paperChatMessageCacheStore'

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

export const usePaperChatStreamStore = defineStore('paperChatStream', () => {
  // ==================== Dependencies ====================

  const paperChatMessageCache = usePaperChatMessageCacheStore()

  // ==================== State ====================

  // 是否正在发送消息（全局状态，用于当前会话）
  const isSending = ref(false)

  // 会话级别的发送状态（用于多会话并发管理）
  const sessionSendingStates = ref<Map<string, boolean>>(new Map())

  // 发送前的消息快照（用于错误回滚）
  const messagesSnapshots = ref<Map<string, Message[]>>(new Map())

  // 当前正在流式响应的会话ID
  const streamingSessionId = ref<string | null>(null)

  // 流式监听器清理函数
  const cleanupStreamListenerFn = ref<(() => void) | null>(null)

  // 用户交互选项状态
  const showUserInteraction = ref(false)
  const userInteractionInfo = ref<UserInteractionRequest | null>(null)

  // 每个会话当前活跃的迭代索引（用于 ReAct 迭代分组）
  const currentIterationIndex = ref<Map<string, number>>(new Map())

  // 每个会话当前轮次的规划 / todo 状态
  const planStates = ref<Map<string, PaperChatPlanState>>(new Map())

  // ==================== Getters ====================

  // 获取当前正在流式响应的会话数量
  const streamingSessionCount = computed(() => {
    let count = 0
    for (const [, isSending] of sessionSendingStates.value.entries()) {
      if (isSending) count++
    }
    return count
  })

  // 获取所有正在发送的会话 ID 列表
  const activeSessionIds = computed(() => {
    const ids: string[] = []
    for (const [sessionId, sending] of sessionSendingStates.value.entries()) {
      if (sending) ids.push(sessionId)
    }
    return ids
  })

  // ==================== Helpers ====================

  /**
   * 获取当前迭代对象
   * 从 currentIterationIndex Map 获取索引，返回消息的当前活跃迭代
   */
  function getCurrentIteration(message: Message, sessionId: string): ReActIteration | null {
    const index = currentIterationIndex.value.get(sessionId)
    if (index === undefined || !message.reactIterations) return null
    return message.reactIterations[index] || null
  }

  /**
   * 检查迭代是否包含可展示内容
   */
  function hasIterationContent(iteration: ReActIteration): boolean {
    return iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
  }

  /**
   * 创建新的迭代分组，并将上一轮标记为完成
   */
  function createIteration(
    message: Message,
    sessionId: string,
    iterationNum?: number,
    status?: 'thinking' | 'calling_tools' | 'processing'
  ): ReActIteration {
    if (!message.reactIterations) {
      message.reactIterations = []
    }

    const prevIndex = currentIterationIndex.value.get(sessionId)
    if (prevIndex !== undefined && message.reactIterations[prevIndex]) {
      message.reactIterations[prevIndex].isActive = false
    }

    const nextIterationNum = iterationNum ?? message.reactIterations.length
    const newIteration: ReActIteration = {
      iteration: nextIterationNum,
      reasoning: '',
      steps: [],
      isActive: true,
      status: status || 'thinking'
    }

    message.reactIterations.push(newIteration)
    currentIterationIndex.value.set(sessionId, message.reactIterations.length - 1)

    return newIteration
  }

  /**
   * 确保当前会话存在活跃迭代
   * 兼容未显式发送 react_iteration_start 的旧事件流
   */
  function ensureCurrentIteration(message: Message, sessionId: string): ReActIteration {
    const currentIteration = getCurrentIteration(message, sessionId)
    if (currentIteration) {
      return currentIteration
    }

    return createIteration(message, sessionId)
  }

  /**
   * 将工具步骤同时追加到兼容字段和阶段分组
   */
  function appendToolStep(message: Message, sessionId: string, step: ReActStep): void {
    if (!message.reactSteps) {
      message.reactSteps = []
    }
    message.reactSteps.push(step)

    const currentIteration = ensureCurrentIteration(message, sessionId)
    currentIteration.steps.push(step)
  }

  /**
   * 结束当前会话的 ReAct 分组并清理空阶段
   */
  function finalizeIterations(message: Message, sessionId: string): void {
    const currentIteration = getCurrentIteration(message, sessionId)
    if (currentIteration) {
      currentIteration.isActive = false
    }

    if (message.reactIterations) {
      message.reactIterations = message.reactIterations.filter(hasIterationContent)
    }

    currentIterationIndex.value.delete(sessionId)
  }

  /**
   * 查找某个工具调用所属的 assistant 消息
   */
  function findToolOwnerMessage(messages: Message[], toolCallId: string): Message | undefined {
    return [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          (message.tool_calls?.some((toolCall) => toolCall.id === toolCallId) ||
            message.reactSteps?.some(
              (step) =>
                (step.type === 'tool_call' && step.toolCall?.id === toolCallId) ||
                (step.type === 'tool_result' && step.toolResult?.id === toolCallId)
            ))
      )
  }

  /**
   * 更新或创建对应的 tool 消息
   */
  function upsertToolMessage(
    messages: Message[],
    toolResult: NonNullable<StreamEvent['toolResult']>
  ): void {
    let toolContent: string
    try {
      if (toolResult.success) {
        toolContent =
          typeof toolResult.result === 'string'
            ? toolResult.result
            : JSON.stringify(toolResult.result)
      } else if (toolResult.result !== undefined) {
        toolContent = JSON.stringify({
          error: toolResult.error,
          result: toolResult.result
        })
      } else {
        toolContent = JSON.stringify({ error: toolResult.error })
      }
    } catch {
      toolContent = JSON.stringify({ raw: String(toolResult.result) })
    }

    const existingMessage = messages.find(
      (message) => message.role === 'tool' && message.tool_call_id === toolResult.id
    )

    if (existingMessage) {
      existingMessage.content = toolContent
      existingMessage.timestamp = new Date().toISOString()
      return
    }

    messages.push({
      id: `msg-${Date.now()}`,
      role: 'tool',
      content: toolContent,
      tool_call_id: toolResult.id,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 更新已存在的 tool_result 步骤
   */
  function updateToolResultStep(
    message: Message,
    toolResult: NonNullable<StreamEvent['toolResult']>
  ): boolean {
    const timestamp = new Date().toISOString()

    const existingLegacyStep = message.reactSteps?.find(
      (step) => step.type === 'tool_result' && step.toolResult?.id === toolResult.id
    )
    if (existingLegacyStep) {
      existingLegacyStep.toolResult = toolResult
      existingLegacyStep.timestamp = timestamp
    }

    let updatedIteration = false
    for (const iteration of message.reactIterations || []) {
      const existingIterationStep = iteration.steps.find(
        (step) => step.type === 'tool_result' && step.toolResult?.id === toolResult.id
      )
      if (existingIterationStep) {
        existingIterationStep.toolResult = toolResult
        existingIterationStep.timestamp = timestamp
        updatedIteration = true
      }
    }

    return Boolean(existingLegacyStep || updatedIteration)
  }

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
    streamingMessage?: Message
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

  // ==================== Actions ====================

  // 获取指定会话的发送状态
  function getSessionSendingState(sessionId: string): boolean {
    return sessionSendingStates.value.get(sessionId) || false
  }

  // 设置指定会话的发送状态
  function setSessionSendingState(
    sessionId: string,
    state: boolean,
    isCurrentSession: boolean = false
  ): void {
    sessionSendingStates.value.set(sessionId, state)

    // 如果是当前会话，同步更新全局 isSending
    if (isCurrentSession) {
      isSending.value = state
    }

    // 更新流式会话 ID
    if (state) {
      streamingSessionId.value = sessionId
      // 新的流开始时，清除之前的用户交互选项
      if (isCurrentSession) {
        hideUserInteraction()
      }
    } else if (streamingSessionId.value === sessionId) {
      streamingSessionId.value = null
    }

    window.api.logger.debug('[PaperChatStreamStore] 设置会话发送状态', {
      sessionId,
      state,
      isCurrentSession,
      streamingSessionId: streamingSessionId.value
    })
  }

  // 设置当前会话的发送状态（便捷方法）
  function setIsSending(state: boolean): void {
    isSending.value = state
  }

  // 保存消息快照
  function saveMessagesSnapshot(sessionId: string, messages: Message[]): void {
    messagesSnapshots.value.set(sessionId, JSON.parse(JSON.stringify(messages)))

    window.api.logger.debug('[PaperChatStreamStore] 保存消息快照', {
      sessionId,
      messageCount: messages.length
    })
  }

  // 获取消息快照
  function getMessagesSnapshot(sessionId: string): Message[] | null {
    return messagesSnapshots.value.get(sessionId) || null
  }

  // 清除消息快照
  function clearMessagesSnapshot(sessionId: string): void {
    messagesSnapshots.value.delete(sessionId)
  }

  // 隐藏用户交互选项
  function hideUserInteraction(): void {
    showUserInteraction.value = false
    userInteractionInfo.value = null
  }

  // 处理流式事件
  // 根据事件类型更新消息内容、推理内容、工具调用等
  function handleStreamEvent(
    event: StreamEvent,
    currentSessionId: string | null,
    currentMessages: Message[]
  ): void {
    const targetSessionId = event.sessionId || streamingSessionId.value

    if (!targetSessionId) {
      window.api.logger.warn('[PaperChatStreamStore] 无法确定目标会话', { event })
      return
    }

    const isCurrentSession = targetSessionId === currentSessionId

    // 获取目标消息列表
    let targetMessages: Message[]
    if (isCurrentSession) {
      targetMessages = currentMessages
    } else {
      // 非当前会话：从缓存获取或初始化
      const cached = paperChatMessageCache.getCachedMessagesRef(targetSessionId)
      if (cached) {
        targetMessages = cached
      } else {
        // 创建新缓存
        targetMessages = []
        targetMessages = paperChatMessageCache.cacheSession(targetSessionId, targetMessages)
      }
    }

    // 找到本轮正在流式输出的消息。带 turnId 的旧事件不能写入新一轮消息。
    const streamingMessage = targetMessages.find(
      (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
    )

    if (event.type === 'plan_status') {
      handlePlanStatusEvent(targetSessionId, event)
      return
    }

    if (event.type === 'plan_generated') {
      handlePlanGeneratedEvent(targetSessionId, event)
      return
    }

    if (event.type === 'plan_step_update') {
      handlePlanStepUpdateEvent(targetSessionId, event, streamingMessage)
      return
    }

    switch (event.type) {
      case 'content':
        if (streamingMessage && event.content) {
          streamingMessage.content = streamingMessage.content + event.content
          // 将内容同时追加到当前迭代的 content 字段
          const contentIter = getCurrentIteration(streamingMessage, targetSessionId)
          if (contentIter?.isActive) {
            contentIter.content = (contentIter.content || '') + event.content
          }
        }
        break

      case 'react_iteration_start':
        if (streamingMessage && event.content !== undefined) {
          const iterationNum = parseInt(event.content, 10)
          const newIter = createIteration(
            streamingMessage,
            targetSessionId,
            iterationNum,
            event.status as 'thinking' | 'calling_tools' | 'processing' | undefined
          )
          // Plan 模式下：将迭代关联到当前执行的步骤
          const activePlan = planStates.value.get(targetSessionId)
          if (activePlan && activePlan.status === 'running' && activePlan.currentStepIndex >= 0) {
            newIter.taskNumber = activePlan.currentStepIndex + 1
            appendPlanStepIteration(targetSessionId, event.status as string | undefined)
          }
        }
        break

      case 'reasoning':
        if (streamingMessage && event.content) {
          // 保持现有逻辑：累加到 message.reasoning（向后兼容）
          streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content

          // 新增：同时累加到当前迭代的 reasoning
          const iterForReasoning = getCurrentIteration(streamingMessage, targetSessionId)
          if (iterForReasoning) {
            iterForReasoning.reasoning += event.content
          }
        }
        break

      case 'tool_call':
        if (streamingMessage && event.toolCall) {
          // 1. 更新 assistant 消息的 tool_calls（标准格式）
          if (!streamingMessage.tool_calls) {
            streamingMessage.tool_calls = []
          }
          streamingMessage.tool_calls.push({
            id: event.toolCall.id,
            type: 'function',
            function: {
              name: `${event.toolCall.serverName}__${event.toolCall.name}`,
              arguments: JSON.stringify(event.toolCall.arguments)
            }
          })

          const toolCallStep = {
            type: 'tool_call' as const,
            toolCall: event.toolCall,
            timestamp: new Date().toISOString()
          }
          appendToolStep(streamingMessage, targetSessionId, toolCallStep)

          // 更新当前迭代状态为 calling_tools
          const currentIter = getCurrentIteration(streamingMessage, targetSessionId)
          if (currentIter && currentIter.status === 'thinking') {
            currentIter.status = 'calling_tools'
          }

          // Plan 模式下：更新步骤迭代的工具调用摘要
          updatePlanStepIterationToolCall(
            targetSessionId,
            `${event.toolCall.serverName}__${event.toolCall.name}`
          )
        }
        break

      case 'tool_result':
        if (event.toolResult) {
          const targetAssistantMessage =
            streamingMessage || findToolOwnerMessage(targetMessages, event.toolResult.id)

          const hasExistingToolMessage = targetMessages.some(
            (message) => message.role === 'tool' && message.tool_call_id === event.toolResult?.id
          )
          if (targetAssistantMessage || hasExistingToolMessage) {
            upsertToolMessage(targetMessages, event.toolResult)
          }

          if (targetAssistantMessage) {
            if (streamingMessage && targetAssistantMessage.id === streamingMessage.id) {
              const updated = updateToolResultStep(targetAssistantMessage, event.toolResult)
              if (!updated) {
                const toolResultStep = {
                  type: 'tool_result' as const,
                  toolResult: event.toolResult,
                  timestamp: new Date().toISOString()
                }
                appendToolStep(targetAssistantMessage, targetSessionId, toolResultStep)
              }
            } else if (!updateToolResultStep(targetAssistantMessage, event.toolResult)) {
              if (!targetAssistantMessage.reactSteps) {
                targetAssistantMessage.reactSteps = []
              }
              targetAssistantMessage.reactSteps.push({
                type: 'tool_result',
                toolResult: event.toolResult,
                timestamp: new Date().toISOString()
              })
            }
          }
        }
        break

      case 'knowledge_search':
        if (streamingMessage && event.knowledgeSearch) {
          // 使用 knowledgeBaseId 作为 ID，确保与 knowledge_result 的 ID 一致
          const kbSearchStep = {
            type: 'tool_call' as const,
            toolCall: {
              id: `kb-${event.knowledgeSearch.knowledgeBaseId}`,
              name: 'knowledge_search',
              serverName: event.knowledgeSearch.knowledgeBaseName,
              arguments: { query: event.knowledgeSearch.query }
            },
            timestamp: new Date().toISOString()
          }
          appendToolStep(streamingMessage, targetSessionId, kbSearchStep)
        }
        break

      case 'knowledge_result':
        if (streamingMessage && event.knowledgeResult) {
          // 使用 knowledgeBaseId 作为 ID，与 knowledge_search 的 ID 保持一致
          const kbResultStep = {
            type: 'tool_result' as const,
            toolResult: {
              id: `kb-${event.knowledgeResult.knowledgeBaseId}`,
              name: 'knowledge_search',
              success: true,
              result: {
                knowledgeBaseId: event.knowledgeResult.knowledgeBaseId,
                knowledgeBaseName: event.knowledgeResult.knowledgeBaseName,
                query: event.knowledgeResult.query,
                resultCount: event.knowledgeResult.results.length,
                results: event.knowledgeResult.results.map((r) => ({
                  fileName: r.fileName,
                  content: r.content,
                  similarity: r.similarity
                }))
              }
            },
            timestamp: new Date().toISOString()
          }
          appendToolStep(streamingMessage, targetSessionId, kbResultStep)
        }
        break

      case 'user_interaction':
        if (isCurrentSession && event.userInteraction) {
          showUserInteraction.value = true
          userInteractionInfo.value = event.userInteraction
        }
        break

      case 'done':
        handleStreamDone(event, targetSessionId, isCurrentSession, streamingMessage)
        break

      case 'error':
        handleStreamError(event, targetSessionId, isCurrentSession, targetMessages)
        break
    }
  }

  // 处理流式完成事件
  function handleStreamDone(
    event: StreamEvent,
    sessionId: string,
    isCurrentSession: boolean,
    streamingMessage?: Message
  ): void {
    if (streamingMessage) {
      streamingMessage.isStreaming = false
      if (event.usage) {
        streamingMessage.usage = event.usage
      }
      finalizeIterations(streamingMessage, sessionId)
      if (streamingMessage.planExecution) {
        streamingMessage.planExecution.isActive = false
      }
    } else {
      currentIterationIndex.value.delete(sessionId)
    }

    finalizePlanState(sessionId, event)
    // 更新会话发送状态
    sessionSendingStates.value.set(sessionId, false)

    if (isCurrentSession) {
      isSending.value = false
      streamingSessionId.value = null
      clearMessagesSnapshot(sessionId)
      // 注意：不清除 userInteraction，选项需要持续显示到用户做出选择
    } else {
      // 非当前会话：保存缓存
      if (streamingSessionId.value === sessionId) {
        streamingSessionId.value = null
      }
      paperChatMessageCache.saveCachedSession(sessionId)
    }

    window.api.logger.debug('[PaperChatStreamStore] 流式响应完成', {
      sessionId,
      isCurrentSession,
      hasUsage: !!event.usage
    })
  }

  // 处理流式错误事件
  function handleStreamError(
    event: StreamEvent,
    sessionId: string,
    isCurrentSession: boolean,
    targetMessages: Message[]
  ): void {
    const streamingMessage = targetMessages.find(
      (msg) => msg.isStreaming && (!event.turnId || msg.id === event.turnId)
    )

    if (streamingMessage) {
      streamingMessage.isStreaming = false
      if (!streamingMessage.content.trim() && event.error) {
        streamingMessage.content = `请求失败：${event.error}`
      }
      finalizeIterations(streamingMessage, sessionId)
    } else {
      currentIterationIndex.value.delete(sessionId)
    }

    finalizePlanState(sessionId, event)
    // 重置发送状态
    sessionSendingStates.value.set(sessionId, false)

    if (isCurrentSession) {
      isSending.value = false
      streamingSessionId.value = null
      clearMessagesSnapshot(sessionId)
      hideUserInteraction()
    } else {
      // 非当前会话：保留失败消息到缓存，避免后台状态丢失
      if (streamingSessionId.value === sessionId) {
        streamingSessionId.value = null
      }
      paperChatMessageCache.saveCachedSession(sessionId)
    }

    window.api.logger.error('[PaperChatStreamStore] 流式响应错误', {
      error: event.error,
      sessionId,
      isCurrentSession
    })
  }

  // 设置流式响应监听器
  function setupStreamListener(handler: (event: StreamEvent) => void): void {
    // 清理旧监听器
    cleanupStreamListener()

    cleanupStreamListenerFn.value = window.api.chat.onStream(handler)

    window.api.logger.info('[PaperChatStreamStore] 流式监听器已设置')
  }

  // 清理流式监听器
  function cleanupStreamListener(): void {
    if (cleanupStreamListenerFn.value) {
      cleanupStreamListenerFn.value()
      cleanupStreamListenerFn.value = null
      window.api.logger.info('[PaperChatStreamStore] 流式监听器已清理')
    }
  }

  // 中止当前请求
  // 立即更新本地状态，异步通知后端停止
  async function stopRequest(sessionId?: string, currentMessages?: Message[]): Promise<void> {
    const targetSessionId = sessionId || streamingSessionId.value
    if (!targetSessionId) {
      window.api.logger.warn('[PaperChatStreamStore] 没有活动的流式会话可停止')
      return
    }

    const targetMessages =
      currentMessages && currentMessages.length > 0
        ? currentMessages
        : paperChatMessageCache.getCachedMessagesRef(targetSessionId)

    const streamingMessage = targetMessages?.find((msg) => msg.isStreaming)
    if (streamingMessage) {
      streamingMessage.isStreaming = false
      finalizeIterations(streamingMessage, targetSessionId)
    } else {
      currentIterationIndex.value.delete(targetSessionId)
    }

    // 立即更新本地状态，不等待后端响应
    sessionSendingStates.value.set(targetSessionId, false)
    if (streamingSessionId.value === targetSessionId) {
      isSending.value = false
    }
    streamingSessionId.value = null
    clearMessagesSnapshot(targetSessionId)
    const existingPlan = planStates.value.get(targetSessionId)
    if (existingPlan) {
      const nextPlan = {
        ...existingPlan,
        status: 'cancelled' as PlanExecutionStatus,
        steps: clonePlanSteps(existingPlan.steps).map((step) =>
          step.status === 'pending' || step.status === 'running'
            ? { ...step, status: 'cancelled' as PlanStepStatus, error: '用户已取消' }
            : step
        ),
        error: '用户已取消',
        updatedAt: new Date().toISOString()
      }
      setPlanState(targetSessionId, nextPlan)
    }

    window.api.logger.info('[PaperChatStreamStore] 正在停止请求', { sessionId: targetSessionId })

    try {
      // 异步调用后端停止（不等待结果）
      window.api.chat.stop(targetSessionId).catch((error) => {
        window.api.logger.error('[PaperChatStreamStore] 停止请求失败', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: targetSessionId
        })
      })
    } catch (error) {
      window.api.logger.error('[PaperChatStreamStore] 停止请求异常', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: targetSessionId
      })
    }
  }

  // 重置指定会话的状态
  function resetSessionState(sessionId: string): void {
    sessionSendingStates.value.delete(sessionId)
    messagesSnapshots.value.delete(sessionId)
    currentIterationIndex.value.delete(sessionId)
    deletePlanState(sessionId)

    if (streamingSessionId.value === sessionId) {
      streamingSessionId.value = null
    }

    window.api.logger.debug('[PaperChatStreamStore] 重置会话状态', { sessionId })
  }

  // 重置所有状态
  function resetAllState(): void {
    isSending.value = false
    sessionSendingStates.value.clear()
    messagesSnapshots.value.clear()
    currentIterationIndex.value.clear()
    planStates.value = new Map()
    streamingSessionId.value = null
    cleanupStreamListener()

    window.api.logger.info('[PaperChatStreamStore] 重置所有状态')
  }

  return {
    // State
    isSending,
    sessionSendingStates,
    messagesSnapshots,
    streamingSessionId,
    showUserInteraction,
    userInteractionInfo,
    planStates,
    // Getters
    streamingSessionCount,
    activeSessionIds,
    // Actions
    getSessionSendingState,
    setSessionSendingState,
    setIsSending,
    saveMessagesSnapshot,
    getMessagesSnapshot,
    clearMessagesSnapshot,
    hideUserInteraction,
    beginPlanning,
    failPlanState,
    getSessionPlanState,
    resetPlanState,
    handleStreamEvent,
    setupStreamListener,
    cleanupStreamListener,
    stopRequest,
    resetSessionState,
    resetAllState
  }
})
