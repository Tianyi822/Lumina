import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { StreamAccumulatorState } from './chatInternal'
import { createThinkParserState, flushThinkParserState, splitThinkTaggedContent } from './message'
import type { StreamHandler } from './StreamHandler'

/**
 * 流式响应处理结果
 */
export interface StreamProcessResult {
  state: StreamAccumulatorState
  totalUsage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
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
      toolCalls: new Map(),
      hasToolCalls: false
    }
    const thinkParserState = createThinkParserState()
    const totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }

    for await (const chunk of stream) {
      this.processChunk(chunk, state, thinkParserState, totalUsage, webContents, sessionId, turnId)
    }

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
    totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): void {
    if (chunk.usage) {
      totalUsage.prompt_tokens += chunk.usage.prompt_tokens
      totalUsage.completion_tokens += chunk.usage.completion_tokens
      totalUsage.total_tokens += chunk.usage.total_tokens
    }

    const choice = chunk.choices?.[0]
    if (!choice) return

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

    if (delta.reasoning_content) {
      state.assistantReasoningContent += delta.reasoning_content
      this.streamHandler.sendReasoning(webContents, sessionId, delta.reasoning_content, turnId)
    }

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
