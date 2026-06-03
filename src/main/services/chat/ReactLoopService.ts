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
  MCPToolAdapter,
  UnifiedToolExecutor,
  UnifiedToolRegistry
} from './tools'
import { ToolOrchestrator } from './tools/ToolOrchestrator'
import { ToolResultEnricher } from './tools/ToolResultEnricher'
import { ToolResultMerger } from './tools/ToolResultMerger'
import type {
  PipelineContext,
  ToolPipeline
} from './tools/PipelineTypes'
import type { ReactLoopServiceOptions } from './chatInternal'
import { StreamProcessor } from './StreamProcessor'
import { CapabilityComposer } from './tools/orchestration/CapabilityComposer'
import { capabilityRegistry } from './tools/capabilities/CapabilityRegistry'
import { registerBuiltinCapabilities } from './tools/capabilities/registerBuiltinCapabilities'
import { capabilityManager } from './tools/CapabilityManager'
import { presetRegistry } from './tools/presets/PresetRegistry'
import { CHAT_PAPER_PRESET, CHAT_DEFAULT_PRESET } from './tools/presets/builtinPresets'

/**
 * 从消息列表中提取最近一条用户的文本输入作为原始查询
 * 用于管道编排中的 auto-trigger 查询构造
 */
export function extractOriginalQuery(
  messages: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user' && typeof msg.content === 'string') {
      return msg.content
    }
  }
  return ''
}

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
  private readonly mcpAdapter: MCPToolAdapter | null
  private readonly streamProcessor: StreamProcessor
  private readonly toolOrchestrator: ToolOrchestrator
  private readonly capabilityComposer: CapabilityComposer
  private currentPipeline?: ToolPipeline
  private currentOriginalQuery?: string
  private currentRequest?: ChatRequest
  private capabilitySuggestTool?: OpenAI.Chat.Completions.ChatCompletionTool
  private suggestableCapabilityMap?: Map<string, { displayName: string; description: string }>

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

    registerBuiltinCapabilities()
    presetRegistry.register(CHAT_PAPER_PRESET)
    presetRegistry.register(CHAT_DEFAULT_PRESET)
    this.capabilityComposer = new CapabilityComposer(capabilityRegistry)

    const enricher = new ToolResultEnricher()
    const merger = new ToolResultMerger()
    this.toolOrchestrator = new ToolOrchestrator({
      registry: this.toolRegistry,
      enricher,
      merger,
      executeToolCalls: async (toolCalls, wc, sid, msgs, tid) =>
        this.unifiedToolExecutor.executeToolCalls(
          toolCalls,
          wc,
          sid,
          msgs as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tid
        ),
      sendStreamEvent: (wc, event) => this.streamHandler.sendStreamEvent(wc, event)
    })
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

      await this.buildToolRegistryWithComposer(request, selectedKnowledgeBases, sessionId)

      // 保留知识库会话绑定（策略的 configureAdapter 已设置适配器，此处补充 stopController 状态）
      if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0 && sessionId) {
        this.stopController.setSessionKnowledgeBases(
          sessionId,
          selectedKnowledgeBases.map((kb) => kb.id)
        )
      }

      // pipeline 已在 buildToolRegistryWithComposer 中设置
      this.currentOriginalQuery = extractOriginalQuery(request.messages)

      const tools = this.toolRegistry.buildOpenAITools()
      if (this.capabilitySuggestTool) {
        tools.push(this.capabilitySuggestTool)
      }

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
   * 通过 CapabilityComposer 构建工具注册表
   */
  private async buildToolRegistryWithComposer(
    request: ChatRequest,
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    sessionId?: string
  ): Promise<MCPToolReference[]> {
    const sid = sessionId ?? ''
    const sessionType = request.sessionType ?? 'default'

    let capState = capabilityManager.getCapabilities(sid)
    if (!capState) {
      capState = capabilityManager.initCapabilitiesForSessionType(sid, sessionType)
    }

    if (request.enableLabTools && !capState.activeCapabilities.includes('lab')) {
      capabilityManager.addCapability(sid, 'lab')
    }
    if (request.enablePaperWebSearch && request.paperId && !capState.activeCapabilities.includes('paper_web')) {
      capabilityManager.addCapability(sid, 'paper_web')
    }
    if (request.selectedTools && request.selectedTools.length > 0 && !capState.activeCapabilities.includes('mcp')) {
      capabilityManager.addCapability(sid, 'mcp')
    }

    capState = capabilityManager.getCapabilities(sid)!

    const preset = presetRegistry.get(capState.presetId)
    const composition = preset?.defaultComposition ?? { stages: [] }

    const composerContext = {
      paperId: request.paperId,
      enableLabTools: request.enableLabTools,
      enablePaperWebSearch: request.enablePaperWebSearch,
      selectedKnowledgeBases,
      selectedTools: request.selectedTools,
      mcpService: this.mcpAdapter ? this.mcpAdapter.getMcpService() : undefined
    }

    const composed = await this.capabilityComposer.compose(
      capState.activeCapabilities,
      composition,
      composerContext
    )

    this.toolRegistry.clear()

    const suggestable = this.capabilityComposer.getSuggestableCapabilities(
      capState.activeCapabilities,
      composerContext
    )
    promptBuilder.setSuggestableCapabilities(
      suggestable.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        description: u.description
      }))
    )

    this.suggestableCapabilityMap = new Map(
      suggestable.map((u) => [u.id, { displayName: u.displayName, description: u.description }])
    )

    if (suggestable.length > 0) {
      this.capabilitySuggestTool = {
        type: 'function' as const,
        function: {
          name: 'capability__suggest',
          description: '建议用户激活一个当前未启用的能力',
          parameters: {
            type: 'object',
            properties: {
              capabilityId: { type: 'string', description: '建议的能力 ID' },
              reason: { type: 'string', description: '为什么建议开启（展示给用户）' }
            },
            required: ['capabilityId', 'reason']
          }
        }
      }
    } else {
      this.capabilitySuggestTool = undefined
    }

    if (!composed) {
      this.currentPipeline = { stages: [] }
      this.currentRequest = request
      promptBuilder.setPipeline(this.currentPipeline)
      this.logger.info('CapabilityComposer: 无可用工具', 'main', { sessionId: sid })
      return []
    }

    for (const tool of composed.toolRegistry.getAllTools()) {
      const refs: MCPToolReference[] = [
        {
          serverName: tool.serverName,
          toolName: tool.functionDef.name,
          description: tool.functionDef.description,
          inputSchema: tool.functionDef.parameters
        }
      ]
      this.toolRegistry.registerBatch(refs, tool.adapter, tool.category)
    }

    this.currentPipeline = composed.pipeline
    this.currentRequest = request
    promptBuilder.setPipeline(composed.pipeline)

    this.logger.info('工具注册完成（通过 CapabilityComposer）', 'main', {
      sessionId: sid,
      toolCount: this.toolRegistry.size,
      activeCapabilities: capState.activeCapabilities
    })

    return this.toolRegistry.getAllToolReferences()
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

    const nonSuggestToolCalls = toolCallsArray.filter(
      (tc) => tc.function.name !== 'capability__suggest'
    )
    const hasSuggestCall = nonSuggestToolCalls.length < toolCallsArray.length

    if (hasSuggestCall) {
      const suggestCall = toolCallsArray.find((tc) => tc.function.name === 'capability__suggest')!
      try {
        const args = JSON.parse(suggestCall.function.arguments) as {
          capabilityId: string
          reason: string
        }
        const capMeta = this.suggestableCapabilityMap?.get(args.capabilityId)
        this.logger.info('模型建议开启能力', 'main', {
          sessionId,
          capabilityId: args.capabilityId,
          reason: args.reason
        })
        this.streamHandler.sendStreamEvent(webContents, {
          type: 'capability_suggestion',
          sessionId,
          turnId,
          capabilitySuggestion: {
            capabilities: [
              {
                id: args.capabilityId,
                displayName: capMeta?.displayName ?? args.capabilityId,
                description: capMeta?.description ?? '',
                reason: args.reason
              }
            ]
          }
        })
      } catch {
        // 解析失败，忽略
      }

      if (nonSuggestToolCalls.length === 0) {
        return { shouldBreak: true, toolErrors: [], toolResults: [], toolCallCount: 0 }
      }
    }

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

    const pipelineContext: PipelineContext = {
      sessionId,
      request: this.currentRequest ?? ({} as ChatRequest),
      modelToolCalls: toolCallsArray,
      stageResults: new Map(),
      originalQuery: this.currentOriginalQuery ?? ''
    }

    const orchestrationResult = await this.toolOrchestrator.orchestrate(
      toolCallsArray,
      this.currentPipeline ?? { stages: [] },
      pipelineContext,
      webContents,
      sessionId,
      turnId
    )

    // 将工具结果追加到对话历史（编排器不直接修改 messages）
    for (const result of orchestrationResult.results) {
      conversationMessages.push({
        role: 'tool' as const,
        tool_call_id: result.toolCallId,
        content: result.content
      })
    }

    const toolExecution = {
      needUserInteraction: orchestrationResult.needUserInteraction,
      failedToolCount: orchestrationResult.results.filter((r) => !r.success).length,
      errors: orchestrationResult.results.filter((r) => r.error).map((r) => r.error!),
      results: orchestrationResult.results
    }

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
