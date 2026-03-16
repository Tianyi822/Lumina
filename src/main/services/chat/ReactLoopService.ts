import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import type { ChatRequest, ChatResult, KnowledgeSearchResult } from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import type { LLMConfig } from '../../types/config'
import { promptBuilder } from './PromptBuilder'
import { formatMessagesWithKnowledge } from './message'
import { ModelRetryHandler } from './ModelRetryHandler'
import { ToolExecutor } from './tools'
import type { ReactLoopServiceOptions } from './chatInternal'
import { ToolListBuilder } from './ToolListBuilder'
import { StreamProcessor } from './StreamProcessor'

/**
 * ReAct 循环服务
 * 处理 ReAct 模式的聊天请求，支持工具调用和迭代推理
 */
export class ReactLoopService {
  private readonly logger: ReactLoopServiceOptions['logger']
  private readonly stopController: ReactLoopServiceOptions['stopController']
  private readonly streamHandler: ReactLoopServiceOptions['streamHandler']
  private readonly createClient: ReactLoopServiceOptions['createClient']
  private readonly validateAndGetLLMConfig: ReactLoopServiceOptions['validateAndGetLLMConfig']
  private readonly modelRetryHandler: ModelRetryHandler
  private readonly toolExecutor: ToolExecutor
  private readonly toolListBuilder: ToolListBuilder
  private readonly streamProcessor: StreamProcessor

  constructor(options: ReactLoopServiceOptions) {
    this.logger = options.logger
    this.stopController = options.stopController
    this.streamHandler = options.streamHandler
    this.createClient = options.createClient
    this.validateAndGetLLMConfig = options.validateAndGetLLMConfig

    this.modelRetryHandler = new ModelRetryHandler({
      logger: this.logger,
      checkStopped: (sessionId) => this.stopController.checkStopped(sessionId),
      delayWithAbort: (ms, sessionId, signal) =>
        this.stopController.delayWithAbort(ms, sessionId, signal)
    })

    this.toolExecutor = new ToolExecutor({
      logger: this.logger,
      mcpService: options.mcpService,
      toolScheduler: options.toolScheduler,
      checkStopped: (sessionId) => this.stopController.checkStopped(sessionId),
      withTimeoutAndStopCheck: (promise, sessionId, timeoutMs, operationName) =>
        this.stopController.withTimeoutAndStopCheck(promise, sessionId, timeoutMs, operationName),
      sendStreamEvent: (webContents, event) =>
        this.streamHandler.sendStreamEvent(webContents, event),
      pendingUserInteraction: new Set(),
      getSelectedKnowledgeBaseIds: (sessionId) =>
        this.stopController.getSelectedKnowledgeBaseIds(sessionId)
    })

    this.toolListBuilder = new ToolListBuilder(this.logger, this.stopController)
    this.streamProcessor = new StreamProcessor(this.streamHandler)
  }

  /**
   * 判断当前请求是否需要暴露 PPT 模板工具
   */
  shouldExposePresentationTools(request: ChatRequest): boolean {
    return this.toolListBuilder.shouldExposePresentationTools(request)
  }

  /**
   * 使用 ReAct 模式发送消息
   */
  async sendMessageWithReact(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[],
    selectedKnowledgeBases?: KnowledgeBaseReference[]
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId, maxReactIterations = 10 } = request
    const enablePresentationTools = this.shouldExposePresentationTools(request)

    this.logger.info('开始发送聊天消息（ReAct 模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length,
      toolCount: request.selectedTools?.length,
      selectedToolNames: request.selectedTools?.map((t) => `${t.serverName}/${t.toolName}`),
      enableSandboxTools: request.enableSandboxTools,
      exposePresentationTools: enablePresentationTools
    })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.stopController.isStopped(sessionId)) {
      this.streamHandler.sendDone(webContents, sessionId)
      return { success: true }
    }

    const abortController = this.stopController.getOrCreateAbortController(sessionId)

    try {
      const client = this.createClient(llmConfig)

      const config = configManager.getConfig()
      if (config) {
        promptBuilder.updatePromptConfig(config.promptConfig || null)
      }

      const allTools = this.toolListBuilder.buildToolList(
        request,
        selectedKnowledgeBases,
        sessionId,
        enablePresentationTools
      )

      const tools = this.toolExecutor.buildOpenAITools(allTools)

      const systemPrompt = await promptBuilder.buildSystemPrompt(
        llmConfig,
        true,
        allTools,
        knowledgeResults
      )
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...formatMessagesWithKnowledge(messages, knowledgeResults)
      ]

      const totalUsage = this.createInitialTokenUsage()
      let iterations = 0

      while (iterations < maxReactIterations) {
        if (abortController.signal.aborted) {
          this.logger.info('ReAct 循环被中止', 'main', { sessionId, iterations })
          break
        }

        const result = await this.executeReactIteration({
          client,
          llmConfig,
          sessionId,
          webContents,
          conversationMessages,
          totalUsage,
          tools,
          iterations,
          maxReactIterations,
          abortController
        })

        if (result.shouldBreak) {
          break
        }

        iterations++
      }

      this.stopController.deletePendingUserInteraction(sessionId)
      this.streamHandler.sendDone(webContents, sessionId, totalUsage)

      this.logger.info('ReAct 聊天消息发送完成', 'main', {
        sessionId,
        iterations,
        usage: totalUsage
      })

      return { success: true }
    } catch (error) {
      return this.handleReactError(error, webContents, sessionId)
    } finally {
      this.stopController.deleteAbortController(sessionId)
      this.stopController.clearStoppedSession(sessionId)
      this.stopController.deletePendingUserInteraction(sessionId)
    }
  }

  /**
   * 执行单次 ReAct 迭代
   */
  private async executeReactIteration(params: {
    client: OpenAI
    llmConfig: LLMConfig
    sessionId: string
    webContents: WebContents
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    tools: OpenAI.Chat.Completions.ChatCompletionTool[]
    iterations: number
    maxReactIterations: number
    abortController: AbortController
  }): Promise<{ shouldBreak: boolean }> {
    const {
      client,
      llmConfig,
      sessionId,
      webContents,
      conversationMessages,
      totalUsage,
      tools,
      iterations,
      maxReactIterations,
      abortController
    } = params

    this.streamHandler.sendReactIterationStart(webContents, sessionId, iterations)

    if (iterations === 0 || iterations === maxReactIterations - 1 || (iterations + 1) % 5 === 0) {
      this.logger.debug(`ReAct 迭代 ${iterations + 1}/${maxReactIterations}`, 'main', {
        sessionId,
        messageCount: conversationMessages.length
      })
    }

    const response = await this.modelRetryHandler.createChatCompletionWithRetry(
      client,
      {
        model: llmConfig.model_name,
        messages: conversationMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
        temperature: llmConfig.temperature,
        max_tokens: llmConfig.max_tokens,
        stream_options: { include_usage: true }
      },
      abortController,
      sessionId,
      `react_iteration_${iterations + 1}`
    )

    const { state, totalUsage: iterationUsage } = await this.streamProcessor.processStream(
      response,
      webContents,
      sessionId
    )

    totalUsage.prompt_tokens += iterationUsage.prompt_tokens
    totalUsage.completion_tokens += iterationUsage.completion_tokens
    totalUsage.total_tokens += iterationUsage.total_tokens

    if (!state.hasToolCalls || state.toolCalls.size === 0) {
      this.logger.info('ReAct 循环完成，模型已给出最终答案', 'main', {
        sessionId,
        iterations: iterations + 1,
        hadContent: state.assistantContent.length > 0
      })
      return { shouldBreak: true }
    }

    this.logger.info('模型请求调用工具', 'main', {
      sessionId,
      iteration: iterations + 1,
      toolCallCount: state.toolCalls.size,
      toolCallNames: Array.from(state.toolCalls.values()).map((tc) => tc.function.name)
    })

    const toolCallsArray = Array.from(state.toolCalls.values())
    const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam & {
      reasoning_content?: string
    } = {
      role: 'assistant',
      content: state.assistantContent || null,
      tool_calls: toolCallsArray
    }

    if (state.assistantReasoningContent) {
      assistantMessage.reasoning_content = state.assistantReasoningContent
    }

    conversationMessages.push(
      assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam
    )

    const needUserInteraction = await this.toolExecutor.executeToolCallsWithScheduler(
      toolCallsArray,
      webContents,
      sessionId,
      conversationMessages
    )

    if (needUserInteraction) {
      this.logger.info('ReAct 循环暂停，等待用户交互', 'main', { sessionId, iterations })
      return { shouldBreak: true }
    }

    return { shouldBreak: false }
  }

  /**
   * 创建初始 Token 使用统计
   */
  private createInitialTokenUsage(): {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  } {
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  }

  /**
   * 处理 ReAct 循环错误
   */
  private handleReactError(
    error: unknown,
    webContents: WebContents,
    sessionId: string
  ): ChatResult {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.info('用户中止了 ReAct 请求', 'main', { sessionId })
      this.streamHandler.sendDone(webContents, sessionId)
      return { success: true }
    }

    const errorMessage = this.modelRetryHandler.normalizeModelError(error)
    this.logger.error('ReAct 聊天请求失败', 'main', {
      sessionId,
      error: this.modelRetryHandler.getModelErrorMessage(error),
      normalizedError: errorMessage,
      status: this.modelRetryHandler.getModelErrorStatus(error)
    })
    this.streamHandler.sendError(webContents, sessionId, errorMessage)
    return { success: false, error: errorMessage }
  }
}
