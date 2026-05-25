import OpenAI from 'openai'
import type { WebContents } from 'electron'
import type {
  ChatRequest,
  ChatResult,
  ChatToolExecutionResult,
  KnowledgeSearchResult,
  MCPToolReference
} from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import type { LLMConfig } from '../../types/config'
import { promptBuilder } from './PromptBuilder'
import { formatMessagesWithKnowledge } from './message'
import { ModelRetryHandler } from './ModelRetryHandler'
import {
  KnowledgeToolAdapter,
  MCPToolAdapter,
  PaperContextToolAdapter,
  LabToolAdapter,
  UnifiedToolExecutor,
  UnifiedToolRegistry
} from './tools'
import type { ReactLoopServiceOptions } from './chatInternal'
import { StreamProcessor } from './StreamProcessor'
import { paperWebSearchService, PaperWebSearchToolAdapter } from '../paper-web-search'

interface ReactLoopRuntimeOptions {
  abortController?: AbortController
  preserveAbortController?: boolean
  suppressFinalEvents?: boolean
}

const DEFAULT_REACT_MAX_ITERATIONS = 30
const MIN_REACT_MAX_ITERATIONS = 1
const REACT_MAX_ITERATIONS_FINAL_PROMPT =
  '本轮 ReAct 工具推理已达到最大迭代次数。请不要再调用工具，基于以上工具结果给出当前可完成的最终回答；如果任务仍未完全完成，请明确说明已完成内容、限制原因和建议的下一步。'
const REACT_EMPTY_FINAL_FALLBACK =
  '已达到工具推理轮次上限，但模型没有返回收尾内容。请缩小问题范围或继续追问，我会基于当前工具结果继续处理。'

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
  private readonly unifiedToolExecutor: UnifiedToolExecutor
  private readonly toolRegistry: UnifiedToolRegistry
  private readonly labAdapter: LabToolAdapter
  private readonly paperContextAdapter: PaperContextToolAdapter
  private readonly paperWebSearchAdapter: PaperWebSearchToolAdapter
  private readonly knowledgeAdapter: KnowledgeToolAdapter
  private readonly mcpAdapter: MCPToolAdapter | null
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

    this.toolRegistry = new UnifiedToolRegistry()
    this.labAdapter = new LabToolAdapter()
    this.paperContextAdapter = new PaperContextToolAdapter()
    this.paperWebSearchAdapter = new PaperWebSearchToolAdapter(paperWebSearchService)
    this.knowledgeAdapter = new KnowledgeToolAdapter()
    this.mcpAdapter = options.mcpService ? new MCPToolAdapter(options.mcpService) : null

    const pendingUserInteraction = new Set<string>()
    this.unifiedToolExecutor = new UnifiedToolExecutor({
      logger: this.logger,
      registry: this.toolRegistry,
      checkStopped: (sessionId) => this.stopController.checkStopped(sessionId),
      withTimeoutAndStopCheck: (promise, sessionId, timeoutMs, operationName) =>
        this.stopController.withTimeoutAndStopCheck(promise, sessionId, timeoutMs, operationName),
      sendStreamEvent: (webContents, event) =>
        this.streamHandler.sendStreamEvent(webContents, event),
      pendingUserInteraction
    })

    this.streamProcessor = new StreamProcessor(this.streamHandler)
  }

  /**
   * 使用 ReAct 模式发送消息
   */
  async sendMessageWithReact(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[],
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    runtimeOptions: ReactLoopRuntimeOptions = {}
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId, turnId } = request
    const maxReactIterations = this.normalizeMaxReactIterations(request.maxReactIterations)

    this.logger.info('开始发送聊天消息（ReAct 模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length,
      toolCount: request.selectedTools?.length,
      selectedToolNames: request.selectedTools?.map((t) => `${t.serverName}/${t.toolName}`),
      enableLabTools: request.enableLabTools,
      maxReactIterations
    })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents, turnId)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.stopController.isStopped(sessionId)) {
      if (!runtimeOptions.suppressFinalEvents) {
        this.streamHandler.sendDone(webContents, sessionId, undefined, turnId, 'cancelled')
      }
      return { success: true }
    }

    const abortController =
      runtimeOptions.abortController ?? this.stopController.getOrCreateAbortController(sessionId)
    const ownsAbortController = !runtimeOptions.abortController

    try {
      const client = this.createClient(llmConfig)

      await this.buildToolRegistry(request, selectedKnowledgeBases, sessionId)

      const tools = this.toolRegistry.buildOpenAITools()

      const allToolRefs = this.toolRegistry.getAllToolReferences()
      const systemPrompt = await promptBuilder.buildSystemPrompt(llmConfig, true, allToolRefs)
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...formatMessagesWithKnowledge(messages, knowledgeResults)
      ]

      const totalUsage = this.createInitialTokenUsage()
      let toolIterations = 0
      let modelCalls = 0
      let totalToolCallCount = 0
      const toolErrors: string[] = []
      const toolResults: ChatToolExecutionResult[] = []
      let finalContent: string | undefined

      while (toolIterations < maxReactIterations) {
        if (abortController.signal.aborted) {
          this.logger.info('ReAct 循环被中止', 'main', { sessionId, toolIterations })
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          throw error
        }

        const result = await this.executeReactIteration({
          client,
          llmConfig,
          sessionId,
          webContents,
          conversationMessages,
          totalUsage,
          tools,
          iterations: toolIterations,
          maxReactIterations,
          abortController,
          turnId
        })
        modelCalls++
        totalToolCallCount += result.toolCallCount

        if (result.shouldBreak) {
          if (result.toolErrors.length > 0) {
            toolErrors.push(...result.toolErrors)
          }
          if (result.toolResults.length > 0) {
            toolResults.push(...result.toolResults)
          }
          if (result.finalContent) {
            finalContent = result.finalContent
          }
          break
        }

        if (result.toolErrors.length > 0) {
          toolErrors.push(...result.toolErrors)
        }
        if (result.toolResults.length > 0) {
          toolResults.push(...result.toolResults)
        }
        toolIterations++

        if (toolIterations >= maxReactIterations) {
          this.logger.warn('ReAct 工具迭代达到上限，进入无工具收尾回复', 'main', {
            sessionId,
            maxReactIterations,
            toolIterations,
            totalToolCallCount
          })

          const finalResult = await this.executeFinalReactResponse({
            client,
            llmConfig,
            sessionId,
            webContents,
            conversationMessages,
            totalUsage,
            iterations: toolIterations,
            abortController,
            turnId
          })
          modelCalls++
          finalContent = finalResult.finalContent
          break
        }
      }

      this.stopController.deletePendingUserInteraction(sessionId)
      if (!runtimeOptions.suppressFinalEvents) {
        this.streamHandler.sendDone(webContents, sessionId, totalUsage, turnId, 'completed')
      }

      this.logger.info('ReAct 聊天消息发送完成', 'main', {
        sessionId,
        toolIterations,
        modelCalls,
        totalToolCallCount,
        usage: totalUsage
      })

      return { success: true, toolErrors, finalContent, toolResults, usage: totalUsage }
    } catch (error) {
      return this.handleReactError(error, webContents, sessionId, turnId, runtimeOptions)
    } finally {
      if (ownsAbortController && !runtimeOptions.preserveAbortController) {
        this.stopController.deleteAbortController(sessionId)
      }
      if (!runtimeOptions.preserveAbortController) {
        this.stopController.clearStoppedSession(sessionId)
      }
      this.stopController.deletePendingUserInteraction(sessionId)
    }
  }

  /**
   * 按请求刷新统一工具注册表
   */
  private async buildToolRegistry(
    request: ChatRequest,
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    sessionId?: string
  ): Promise<MCPToolReference[]> {
    const { selectedTools, enableLabTools } = request

    this.toolRegistry.unregisterByCategory('lab')
    this.toolRegistry.unregisterByCategory('knowledge')
    this.toolRegistry.unregisterByCategory('mcp')
    this.toolRegistry.unregisterByCategory('paper')
    this.toolRegistry.unregisterByCategory('paper_web')

    if (selectedTools && selectedTools.length > 0 && this.mcpAdapter) {
      this.toolRegistry.registerBatch(selectedTools, this.mcpAdapter, 'mcp')
    }

    if (enableLabTools) {
      const labTools = this.labAdapter.getTools()
      this.toolRegistry.registerBatch(labTools, this.labAdapter, 'lab')

      this.logger.info('已添加实验室工具到工具列表', 'main', {
        sessionId,
        labToolCount: labTools.length,
        totalToolCount: this.toolRegistry.size
      })
    }

    if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0 && sessionId) {
      const kbIds = selectedKnowledgeBases.map((kb) => kb.id)
      this.stopController.setSessionKnowledgeBases(sessionId, kbIds)

      this.knowledgeAdapter.setKnowledgeBaseIds(kbIds)
      const knowledgeTools = this.knowledgeAdapter.getTools()
      this.toolRegistry.registerBatch(knowledgeTools, this.knowledgeAdapter, 'knowledge')

      this.logger.info('已添加知识库工具到工具列表', 'main', {
        sessionId,
        knowledgeToolCount: knowledgeTools.length,
        totalToolCount: this.toolRegistry.size,
        selectedKnowledgeBases: selectedKnowledgeBases.map((kb) => kb.name)
      })
    }

    if (request.sessionType === 'paper' && request.paperId) {
      this.paperContextAdapter.setPaperId(request.paperId)
      const paperTools = this.paperContextAdapter.getTools()
      this.toolRegistry.registerBatch(paperTools, this.paperContextAdapter, 'paper')

      this.logger.info('已添加论文上下文工具到工具列表', 'main', {
        sessionId,
        paperId: request.paperId,
        paperToolCount: paperTools.length,
        totalToolCount: this.toolRegistry.size
      })
    } else {
      this.paperContextAdapter.setPaperId(undefined)
    }

    if (request.enablePaperWebSearch && request.sessionType === 'paper' && sessionId) {
      const paperContext = this.buildPaperSearchContext(request)
      this.paperWebSearchAdapter.setPaperContext(paperContext)
      const paperWebTools = this.paperWebSearchAdapter.getTools()
      this.toolRegistry.registerBatch(paperWebTools, this.paperWebSearchAdapter, 'paper_web')

      this.logger.info('已添加论文联网搜索工具到工具列表', 'main', {
        sessionId,
        paperWebToolCount: paperWebTools.length,
        totalToolCount: this.toolRegistry.size
      })
    }

    return this.toolRegistry.getAllToolReferences()
  }

  /**
   * 构建论文搜索上下文
   */
  private buildPaperSearchContext(
    request: ChatRequest
  ): import('@shared/types/paper-web-search').PaperWebSearchContext {
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')

    return {
      paperId: request.paperId || '',
      fileName: '',
      paperTitle: undefined,
      paperAuthors: undefined,
      paperKeywords: undefined,
      selectedQuote: undefined,
      selectedQuoteContext: undefined,
      userQuestion: typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '',
      referenceHints: undefined
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
    turnId?: string
  }): Promise<{
    shouldBreak: boolean
    toolErrors: string[]
    toolResults: ChatToolExecutionResult[]
    toolCallCount: number
    finalContent?: string
  }> {
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
      abortController,
      turnId
    } = params

    this.streamHandler.sendReactIterationStart(
      webContents,
      sessionId,
      iterations,
      'thinking',
      turnId
    )

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
        stream_options: { include_usage: true }
      },
      abortController,
      sessionId,
      `react_iteration_${iterations + 1}`
    )

    const { state, totalUsage: iterationUsage } = await this.streamProcessor.processStream(
      response,
      webContents,
      sessionId,
      turnId
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
      return {
        shouldBreak: true,
        toolErrors: [],
        toolResults: [],
        toolCallCount: 0,
        finalContent: state.assistantContent || undefined
      }
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

    const toolExecution = await this.unifiedToolExecutor.executeToolCalls(
      toolCallsArray,
      webContents,
      sessionId,
      conversationMessages,
      turnId
    )

    if (toolExecution.needUserInteraction) {
      this.logger.info('ReAct 循环暂停，等待用户交互', 'main', { sessionId, iterations })
      return {
        shouldBreak: true,
        toolErrors: toolExecution.errors,
        toolResults: toolExecution.results,
        toolCallCount: toolCallsArray.length
      }
    }

    return {
      shouldBreak: false,
      toolErrors: toolExecution.errors,
      toolResults: toolExecution.results,
      toolCallCount: toolCallsArray.length
    }
  }

  /**
   * 达到工具迭代上限后，强制模型基于已有结果给出无工具最终回复
   */
  private async executeFinalReactResponse(params: {
    client: OpenAI
    llmConfig: LLMConfig
    sessionId: string
    webContents: WebContents
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    iterations: number
    abortController: AbortController
    turnId?: string
  }): Promise<{ finalContent: string }> {
    const {
      client,
      llmConfig,
      sessionId,
      webContents,
      conversationMessages,
      totalUsage,
      iterations,
      abortController,
      turnId
    } = params

    this.streamHandler.sendReactIterationStart(
      webContents,
      sessionId,
      iterations,
      'processing',
      turnId
    )

    conversationMessages.push({
      role: 'user',
      content: REACT_MAX_ITERATIONS_FINAL_PROMPT
    })

    const response = await this.modelRetryHandler.createChatCompletionWithRetry(
      client,
      {
        model: llmConfig.model_name,
        messages: conversationMessages,
        stream: true,
        stream_options: { include_usage: true }
      },
      abortController,
      sessionId,
      'react_finalization'
    )

    const { state, totalUsage: finalUsage } = await this.streamProcessor.processStream(
      response,
      webContents,
      sessionId,
      turnId
    )

    totalUsage.prompt_tokens += finalUsage.prompt_tokens
    totalUsage.completion_tokens += finalUsage.completion_tokens
    totalUsage.total_tokens += finalUsage.total_tokens

    const finalContent = state.assistantContent.trim() || REACT_EMPTY_FINAL_FALLBACK
    if (state.assistantContent.trim().length === 0) {
      this.streamHandler.sendContent(webContents, sessionId, finalContent, turnId)
    }

    this.logger.info('ReAct 无工具收尾回复完成', 'main', {
      sessionId,
      iterations,
      hadContent: finalContent.length > 0
    })

    return { finalContent }
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

  private normalizeMaxReactIterations(maxReactIterations?: number): number {
    if (typeof maxReactIterations !== 'number' || !Number.isFinite(maxReactIterations)) {
      return DEFAULT_REACT_MAX_ITERATIONS
    }

    return Math.max(MIN_REACT_MAX_ITERATIONS, Math.floor(maxReactIterations))
  }

  /**
   * 处理 ReAct 循环错误
   */
  private handleReactError(
    error: unknown,
    webContents: WebContents,
    sessionId: string,
    turnId?: string,
    runtimeOptions: ReactLoopRuntimeOptions = {}
  ): ChatResult {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.info('用户中止了 ReAct 请求', 'main', { sessionId })
      if (!runtimeOptions.suppressFinalEvents) {
        this.streamHandler.sendDone(webContents, sessionId, undefined, turnId, 'cancelled')
        return { success: true }
      }
      return { success: false, error: error.message }
    }

    const errorMessage = this.modelRetryHandler.normalizeModelError(error)
    this.logger.error('ReAct 聊天请求失败', 'main', {
      sessionId,
      error: this.modelRetryHandler.getModelErrorMessage(error),
      normalizedError: errorMessage,
      status: this.modelRetryHandler.getModelErrorStatus(error)
    })
    if (!runtimeOptions.suppressFinalEvents) {
      this.streamHandler.sendError(webContents, sessionId, errorMessage, turnId, 'failed')
    }
    return { success: false, error: errorMessage }
  }
}
