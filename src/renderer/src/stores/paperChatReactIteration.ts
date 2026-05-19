import type { Message, ReActIteration, ReActStep, StreamEvent } from '@renderer/types'

export interface ValueRef<T> {
  value: T
}

function createValueRef<T>(value: T): ValueRef<T> {
  return { value }
}

export interface ReactIterationManager {
  currentIterationIndex: ValueRef<Map<string, number>>
  getCurrentIteration: (message: Message, sessionId: string) => ReActIteration | null
  hasIterationContent: (iteration: ReActIteration) => boolean
  createIteration: (
    message: Message,
    sessionId: string,
    iterationNum?: number,
    status?: 'thinking' | 'calling_tools' | 'processing'
  ) => ReActIteration
  ensureCurrentIteration: (message: Message, sessionId: string) => ReActIteration
  appendToolStep: (message: Message, sessionId: string, step: ReActStep) => void
  finalizeIterations: (message: Message, sessionId: string) => void
  findToolOwnerMessage: (messages: Message[], toolCallId: string) => Message | undefined
  upsertToolMessage: (
    messages: Message[],
    toolResult: NonNullable<StreamEvent['toolResult']>
  ) => void
  updateToolResultStep: (
    message: Message,
    toolResult: NonNullable<StreamEvent['toolResult']>
  ) => boolean
  deleteIterationIndex: (sessionId: string) => void
}

/** 创建 ReAct 迭代管理器 */
export function useReactIterationManager(): ReactIterationManager {
  // 每个会话当前活跃的迭代索引（用于 ReAct 迭代分组）
  const currentIterationIndex = createValueRef<Map<string, number>>(new Map())

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
    return (
      iteration.reasoning.trim().length > 0 ||
      iteration.steps.length > 0 ||
      (iteration.content?.trim().length ?? 0) > 0
    )
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

  function deleteIterationIndex(sessionId: string): void {
    currentIterationIndex.value.delete(sessionId)
  }

  return {
    currentIterationIndex,
    getCurrentIteration,
    hasIterationContent,
    createIteration,
    ensureCurrentIteration,
    appendToolStep,
    finalizeIterations,
    findToolOwnerMessage,
    upsertToolMessage,
    updateToolResultStep,
    deleteIterationIndex
  }
}
