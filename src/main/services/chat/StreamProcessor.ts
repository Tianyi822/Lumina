import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { StreamAccumulatorState } from './chatInternal'
import { createThinkParserState, flushThinkParserState, splitThinkTaggedContent } from './message'
import type { StreamHandler } from './StreamHandler'
import type { TokenUsage } from '../../types/chat'
import { addTokenUsage, createEmptyTokenUsage, extractTokenUsage } from './PromptCacheOptimizer'

/**
 * 流式响应处理结果
 */
export interface StreamProcessResult {
  state: StreamAccumulatorState
  totalUsage: TokenUsage
}

/**
 * 流式响应处理器
 * 负责处理 ReAct 迭代中的流式响应
 */
export class StreamProcessor {
  private readonly streamHandler: StreamHandler

  constructor(streamHandler: StreamHandler) {
    this.streamHandler = streamHandler
  }

  /**
   * 处理完整的流式响应
   */
  async processStream(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): Promise<StreamProcessResult> {
    const state: StreamAccumulatorState = {
      assistantContent: '',
      assistantReasoningContent: '',
      assistantApiReasoningContent: '',
      toolCalls: new Map(),
      hasToolCalls: false
    }
    // 初始化  标签解析状态，用于处理行内推理标记
    const thinkParserState = createThinkParserState()
    const totalUsage = createEmptyTokenUsage()

    // 逐块处理流式响应
    for await (const chunk of stream) {
      this.processChunk(chunk, state, thinkParserState, totalUsage, webContents, sessionId, turnId)
    }

    // 流结束后刷新  标签解析器中残留的内容
    this.flushThinkParser(thinkParserState, state, webContents, sessionId, turnId)

    return { state, totalUsage }
  }

  /**
   * 处理单个 chunk
   */
  private processChunk(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    state: StreamAccumulatorState,
    thinkParserState: ReturnType<typeof createThinkParserState>,
    totalUsage: TokenUsage,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): void {
    // 累积 Token 用量
    if (chunk.usage) {
      addTokenUsage(totalUsage, extractTokenUsage(chunk.usage))
    }

    const choice = chunk.choices?.[0]
    if (!choice) return

    // 解析流式 delta 中的内容、推理内容和工具调用
    const delta = choice.delta as {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }

    // 处理 API 原生推理内容（如 DeepSeek 的 reasoning_content 字段）
    if (delta.reasoning_content) {
      state.assistantReasoningContent += delta.reasoning_content
      state.assistantApiReasoningContent += delta.reasoning_content
      this.streamHandler.sendReasoning(webContents, sessionId, delta.reasoning_content, turnId)
    }

    // 处理普通文本内容（同时解析  标签）
    if (delta.content) {
      const { reasoningDelta, contentDelta } = splitThinkTaggedContent(
        delta.content,
        thinkParserState
      )

      if (reasoningDelta) {
        state.assistantReasoningContent += reasoningDelta
        this.streamHandler.sendReasoning(webContents, sessionId, reasoningDelta, turnId)
      }

      if (contentDelta) {
        state.assistantContent += contentDelta
        this.streamHandler.sendContent(webContents, sessionId, contentDelta, turnId)
      }
    }

    // 处理工具调用（流式 delta 中按 index 合并）
    if (delta.tool_calls) {
      state.hasToolCalls = true
      for (const tc of delta.tool_calls) {
        if (!state.toolCalls.has(tc.index)) {
          state.toolCalls.set(tc.index, {
            id: tc.id || '',
            type: 'function',
            function: { name: '', arguments: '' }
          })
        }
        const existing = state.toolCalls.get(tc.index)!
        // 流式片段合并：每次 id/name/arguments 可能分布在多个 chunk 中
        if (tc.id) existing.id = tc.id
        if (tc.function?.name) existing.function.name += tc.function.name
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
      }
    }
  }

  /**
   * 刷新 think parser 状态
   */
  private flushThinkParser(
    thinkParserState: ReturnType<typeof createThinkParserState>,
    state: StreamAccumulatorState,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): void {
    const { reasoningDelta: remainingReasoningDelta, contentDelta: remainingContentDelta } =
      flushThinkParserState(thinkParserState)

    if (remainingReasoningDelta) {
      state.assistantReasoningContent += remainingReasoningDelta
      this.streamHandler.sendReasoning(webContents, sessionId, remainingReasoningDelta, turnId)
    }

    if (remainingContentDelta) {
      state.assistantContent += remainingContentDelta
      this.streamHandler.sendContent(webContents, sessionId, remainingContentDelta, turnId)
    }
  }
}
