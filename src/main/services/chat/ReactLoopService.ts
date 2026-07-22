import OpenAI from 'openai'
import type { WebContents } from 'electron'
import type {
  ChatRequest,
  ChatResult,
  ChatMessage,
  ChatToolExecutionResult,
  KnowledgeSearchResult
} from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import type { LLMConfig } from '../../types/config'
import { promptBuilder } from './PromptBuilder'
import { getFewShotExamples } from './prompts/fewShotExamples'
import { formatMessagesWithKnowledge } from './message'
import { ModelRetryHandler } from './ModelRetryHandler'
import { MCPToolAdapter, UnifiedToolExecutor, UnifiedToolRegistry } from './tools'
import { ToolOrchestrator } from './tools/ToolOrchestrator'
import { ToolResultEnricher } from './tools/ToolResultEnricher'
import { ToolResultMerger } from './tools/ToolResultMerger'
import type { PipelineContext, ToolPipeline } from './tools/PipelineTypes'
import type { ReactLoopServiceOptions } from './chatInternal'
import { StreamProcessor } from './StreamProcessor'
import { CapabilityComposer } from './tools/orchestration/CapabilityComposer'
import { capabilityRegistry } from './tools/capabilities/CapabilityRegistry'
import { registerBuiltinCapabilities } from './tools/capabilities/registerBuiltinCapabilities'
import { capabilityManager } from './tools/CapabilityManager'
import { presetRegistry } from './tools/presets/PresetRegistry'
import { CHAT_PAPER_PRESET, CHAT_DEFAULT_PRESET } from './tools/presets/builtinPresets'
import { sshTerminalService } from '../lab/ssh/SshTerminalService'
import type { TokenUsage } from '../../types/chat'
import {
  addTokenUsage,
  applyPromptCacheOptions,
  createEmptyTokenUsage,
  recordPromptCacheDiagnostics
} from './PromptCacheOptimizer'

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

/**
 * 构建 capability composer 上下文（纯函数，便于单测）
 * 从 ChatRequest 提取实验室学科/绑定等字段，缺失时默认 null
 */
export function buildComposerContext(
  request: Pick<
    ChatRequest,
    | 'paperId'
    | 'enableLabTools'
    | 'enablePaperWebSearch'
    | 'activeLabDiscipline'
    | 'activeLabId'
    | 'selectedTools'
  >,
  selectedKnowledgeBases?: KnowledgeBaseReference[],
  mcpService?: unknown
): Record<string, unknown> {
  return {
    paperId: request.paperId,
    enableLabTools: request.enableLabTools,
    enablePaperWebSearch: request.enablePaperWebSearch,
    selectedKnowledgeBases,
    selectedTools: request.selectedTools,
    mcpService,
    labDiscipline: request.activeLabDiscipline ?? null,
    labId: request.activeLabId ?? null
  }
}

/** ReAct 循环运行时选项 */
interface ReactLoopRuntimeOptions {
  abortController?: AbortController
  preserveAbortController?: boolean
  suppressFinalEvents?: boolean
}

/** ReAct 单次请求的运行时上下文，缓存了工具注册表、编排器、管道等可变状态 */
interface ReactRequestRuntime {
  toolRegistry: UnifiedToolRegistry
  toolExecutor: UnifiedToolExecutor
  toolOrchestrator: ToolOrchestrator
  pipeline: ToolPipeline
  request: ChatRequest
  originalQuery: string
  tools: OpenAI.Chat.Completions.ChatCompletionTool[]
  suggestableCapabilities: Array<{ id: string; displayName: string; description: string }>
  suggestableCapabilityMap: Map<string, { displayName: string; description: string }>
}

// ReAct 循环默认最大迭代次数
const DEFAULT_REACT_MAX_ITERATIONS = 30
// ReAct 循环最小迭代次数
const MIN_REACT_MAX_ITERATIONS = 1
// ReAct 循环默认 Token 预算上限（累计 total_tokens）
const DEFAULT_TOKEN_BUDGET = 60000
const REACT_MAX_ITERATIONS_FINAL_PROMPT =
  '本轮 ReAct 工具推理已达到最大迭代次数。请不要再调用工具，基于以上工具结果给出当前可完成的最终回答；如果任务仍未完全完成，请明确说明已完成内容、限制原因和建议的下一步。'
// 模型在达到迭代上限后未返回内容时的兜底回复
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
  private readonly mcpAdapter: MCPToolAdapter | null
  private readonly streamProcessor: StreamProcessor
  private readonly capabilityComposer: CapabilityComposer

  constructor(options: ReactLoopServiceOptions) {
    // 保存依赖注入的服务实例
    this.logger = options.logger
    this.stopController = options.stopController
    this.streamHandler = options.streamHandler
    this.createClient = options.createClient
    this.validateAndGetLLMConfig = options.validateAndGetLLMConfig

    // 初始化模型重试处理器，注入停止检查和延迟中止逻辑
    this.modelRetryHandler = new ModelRetryHandler({
      logger: this.logger,
      checkStopped: (sessionId) => this.stopController.checkStopped(sessionId),
      delayWithAbort: (ms, sessionId, signal) =>
        this.stopController.delayWithAbort(ms, sessionId, signal)
    })

    // 若提供了 MCP 服务则创建 MCP 工具适配器
    this.mcpAdapter = options.mcpService ? new MCPToolAdapter(options.mcpService) : null

    this.streamProcessor = new StreamProcessor(this.streamHandler)

    // 注册内置能力和默认预设
    registerBuiltinCapabilities()
    presetRegistry.register(CHAT_PAPER_PRESET)
    presetRegistry.register(CHAT_DEFAULT_PRESET)
    // 初始化能力组合器，用于动态编排可用工具
    this.capabilityComposer = new CapabilityComposer(capabilityRegistry)
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
    // 规范化最大迭代次数，确保在有效范围内
    const maxReactIterations = this.normalizeMaxReactIterations(request.maxReactIterations)
    // 解析 Token 预算上限，默认 60000；用于在模型陷入循环时强制收尾
    const tokenBudget = this.normalizeTokenBudget(request.tokenBudget)

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

    // 获取或创建中止控制器（允许外部传入以共享生命周期）
    const abortController =
      runtimeOptions.abortController ?? this.stopController.getOrCreateAbortController(sessionId)
    // 标记是否由内部创建控制器，以便在 finally 中决定是否清理
    const ownsAbortController = !runtimeOptions.abortController

    try {
      const client = this.createClient(llmConfig)

      const reactRuntime = await this.buildRequestRuntime(
        request,
        selectedKnowledgeBases,
        sessionId
      )

      // 保留知识库会话绑定（策略的 configureAdapter 已设置适配器，此处补充 stopController 状态）
      if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0 && sessionId) {
        this.stopController.setSessionKnowledgeBases(
          sessionId,
          selectedKnowledgeBases.map((kb) => kb.id)
        )
      }

      const systemPrompt = await promptBuilder.buildSystemPrompt(
        true,
        reactRuntime.toolRegistry.getAllToolReferences(),
        {
          pipeline: reactRuntime.pipeline,
          suggestableCapabilities: reactRuntime.suggestableCapabilities,
          fewShotExamples: getFewShotExamples(request.sessionType)
        }
      )
      // 构建对话消息列表（系统提示 + 用户历史消息 + 知识库结果）
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...formatMessagesWithKnowledge(messages, knowledgeResults)
      ]
      // 记录模型完整对话转录，用于返回给调用方
      const modelTranscript: ChatMessage[] = []

      // 初始化 Token 用量统计和循环状态
      const totalUsage = this.createInitialTokenUsage()
      let toolIterations = 0
      let modelCalls = 0
      let totalToolCallCount = 0
      const toolErrors: string[] = []
      const toolResults: ChatToolExecutionResult[] = []
      let finalContent: string | undefined

      // ReAct 推理主循环：迭代调用模型，直到达到上限或模型给出最终答案
      while (toolIterations < maxReactIterations) {
        // 每次迭代前检查是否被用户手动中止
        if (abortController.signal.aborted) {
          this.logger.info('ReAct 循环被中止', 'main', { sessionId, toolIterations })
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          throw error
        }

        // 执行单次 ReAct 迭代：调用模型 → 处理工具调用 → 追加结果到对话
        const result = await this.executeReactIteration({
          client,
          llmConfig,
          sessionId,
          webContents,
          request,
          reactRuntime,
          conversationMessages,
          modelTranscript,
          totalUsage,
          iterations: toolIterations,
          maxReactIterations,
          abortController,
          turnId
        })
        modelCalls++
        totalToolCallCount += result.toolCallCount

        // 模型直接给出最终答案（无工具调用），跳出循环
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

        // 记录本轮工具执行错误和结果
        if (result.toolErrors.length > 0) {
          toolErrors.push(...result.toolErrors)
        }
        if (result.toolResults.length > 0) {
          toolResults.push(...result.toolResults)
        }
        toolIterations++

        // 达到迭代上限时，注入强制收尾提示让模型生成无工具回复
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
            request,
            conversationMessages,
            modelTranscript,
            totalUsage,
            iterations: toolIterations,
            abortController,
            turnId
          })
          modelCalls++
          finalContent = finalResult.finalContent
          break
        }

        // Token 预算熔断：累计 token 超过阈值时强制收尾，避免模型循环消耗
        if (totalUsage.total_tokens >= tokenBudget) {
          this.logger.warn('ReAct 循环 Token 预算耗尽，进入无工具收尾回复', 'main', {
            sessionId,
            tokenBudget,
            toolIterations,
            totalTokens: totalUsage.total_tokens
          })

          const finalResult = await this.executeFinalReactResponse({
            client,
            llmConfig,
            sessionId,
            webContents,
            request,
            conversationMessages,
            modelTranscript,
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

      // 清理待处理的用户交互标记
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

      return {
        success: true,
        toolErrors,
        finalContent,
        toolResults,
        usage: totalUsage,
        modelTranscript
      }
    } catch (error) {
      return this.handleReactError(error, webContents, sessionId, turnId, runtimeOptions)
    } finally {
      // 清理中止控制器和停止状态（避免内存泄漏）
      if (ownsAbortController && !runtimeOptions.preserveAbortController) {
        this.stopController.deleteAbortController(sessionId)
      }
      if (!runtimeOptions.preserveAbortController) {
        this.stopController.clearStoppedSession(sessionId)
      }
      this.stopController.deletePendingUserInteraction(sessionId)
      // 清理本次请求绑定的模型 PTY 会话（spec §7.1，防止资源泄漏）
      const boundLabId = request.activeLabId ?? null
      if (boundLabId) {
        try {
          sshTerminalService.closeLabTerminals(boundLabId, 'ReAct 循环结束')
        } catch {
          // 清理失败不影响主流程
        }
      }
    }
  }

  /**
   * 通过 CapabilityComposer 构建工具注册表
   */
  /**
   * 根据请求参数和已选知识库，构建 ReAct 运行时上下文
   * 包括：能力注册、工具预设组合、工具注册表初始化
   */
  private async buildRequestRuntime(
    request: ChatRequest,
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    sessionId?: string
  ): Promise<ReactRequestRuntime> {
    const sid = sessionId ?? ''
    const sessionType = request.sessionType ?? 'default'

    // 获取或初始化会话的能力状态
    let capState = capabilityManager.getCapabilities(sid)
    if (!capState) {
      capState = capabilityManager.initCapabilitiesForSessionType(sid, sessionType)
    }

    // 根据请求参数动态启用对应的能力（实验室、论文搜索、MCP、知识库）
    if (request.enableLabTools && !capState.activeCapabilities.includes('lab')) {
      capabilityManager.addCapability(sid, 'lab')
    }
    if (
      request.enablePaperWebSearch &&
      request.paperId &&
      !capState.activeCapabilities.includes('paper_web')
    ) {
      capabilityManager.addCapability(sid, 'paper_web')
    }
    if (
      request.selectedTools &&
      request.selectedTools.length > 0 &&
      !capState.activeCapabilities.includes('mcp')
    ) {
      capabilityManager.addCapability(sid, 'mcp')
    }
    if (
      selectedKnowledgeBases &&
      selectedKnowledgeBases.length > 0 &&
      !capState.activeCapabilities.includes('knowledge')
    ) {
      capabilityManager.addCapability(sid, 'knowledge')
    }

    capState = capabilityManager.getCapabilities(sid)!

    const preset = presetRegistry.get(capState.presetId)
    const composition = preset?.defaultComposition ?? { stages: [] }

    const composerContext = buildComposerContext(
      request,
      selectedKnowledgeBases,
      this.mcpAdapter ? this.mcpAdapter.getMcpService() : undefined
    )

    // 使用能力组合器将已激活的能力编排为工具管道
    const composed = await this.capabilityComposer.compose(
      capState.activeCapabilities,
      composition,
      composerContext
    )

    // 获取当前可建议但未启用的能力（用于 capability__suggest 工具）
    const suggestable = this.capabilityComposer.getSuggestableCapabilities(
      capState.activeCapabilities,
      composerContext
    )
    const suggestableCapabilities = suggestable
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        description: u.description
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const suggestableCapabilityMap = new Map(
      suggestable.map((u) => [u.id, { displayName: u.displayName, description: u.description }])
    )

    // 如果有可建议的能力，创建一个特殊工具让模型能主动建议用户启用
    let capabilitySuggestTool: OpenAI.Chat.Completions.ChatCompletionTool | undefined
    if (suggestable.length > 0) {
      capabilitySuggestTool = {
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
    }

    // 构建工具注册表、管道和工具列表（含能力建议工具）
    const toolRegistry = composed?.toolRegistry ?? new UnifiedToolRegistry()
    const pipeline = composed?.pipeline ?? { stages: [] }
    const tools = toolRegistry.buildOpenAITools()
    if (capabilitySuggestTool) {
      tools.push(capabilitySuggestTool)
    }

    // 创建统一工具执行器，将停止检查、超时、流事件等功能注入
    const toolExecutor = new UnifiedToolExecutor({
      logger: this.logger,
      registry: toolRegistry,
      checkStopped: (activeSessionId) => this.stopController.checkStopped(activeSessionId),
      withTimeoutAndStopCheck: (promise, activeSessionId, timeoutMs, operationName) =>
        this.stopController.withTimeoutAndStopCheck(
          promise,
          activeSessionId,
          timeoutMs,
          operationName
        ),
      sendStreamEvent: (webContents, event) =>
        this.streamHandler.sendStreamEvent(webContents, event),
      pendingUserInteraction: new Set<string>()
    })
    const toolOrchestrator = new ToolOrchestrator({
      registry: toolRegistry,
      enricher: new ToolResultEnricher(),
      merger: new ToolResultMerger(),
      executeToolCalls: async (toolCalls, wc, activeSessionId, msgs, tid) =>
        toolExecutor.executeToolCalls(
          toolCalls,
          wc,
          activeSessionId,
          msgs as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tid
        ),
      sendStreamEvent: (wc, event) => this.streamHandler.sendStreamEvent(wc, event)
    })

    // 如果组合结果为空，说明当前没有激活任何能力（仅用于调试日志）
    if (!composed) {
      this.logger.info('CapabilityComposer: 无可用工具', 'main', { sessionId: sid })
    }

    this.logger.info('工具注册完成（通过 CapabilityComposer）', 'main', {
      sessionId: sid,
      toolCount: toolRegistry.size,
      activeCapabilities: capState.activeCapabilities
    })

    return {
      toolRegistry,
      toolExecutor,
      toolOrchestrator,
      pipeline,
      request,
      originalQuery: extractOriginalQuery(request.messages),
      tools,
      suggestableCapabilities,
      suggestableCapabilityMap
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
    request: ChatRequest
    reactRuntime: ReactRequestRuntime
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    modelTranscript: ChatMessage[]
    totalUsage: TokenUsage
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
      request,
      reactRuntime,
      conversationMessages,
      modelTranscript,
      totalUsage,
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

    const scene = `react_iteration_${iterations + 1}`
    const requestParams = applyPromptCacheOptions(
      {
        model: llmConfig.model_name,
        messages: conversationMessages,
        tools: reactRuntime.tools.length > 0 ? reactRuntime.tools : undefined,
        tool_choice: reactRuntime.tools.length > 0 ? 'auto' : undefined,
        stream: true,
        stream_options: { include_usage: true }
      },
      { llmConfig, request, toolSignature: reactRuntime.tools }
    )

    // 调用模型（带重试和自动降级逻辑）
    const response = await this.modelRetryHandler.createChatCompletionWithRetry(
      client,
      requestParams,
      abortController,
      sessionId,
      scene
    )

    const { state, totalUsage: iterationUsage } = await this.streamProcessor.processStream(
      response,
      webContents,
      sessionId,
      turnId
    )

    addTokenUsage(totalUsage, iterationUsage)
    recordPromptCacheDiagnostics(
      { llmConfig, request, mode: 'react', scene },
      requestParams,
      iterationUsage,
      this.logger
    )

    if (!state.hasToolCalls || state.toolCalls.size === 0) {
      if (state.assistantContent) {
        modelTranscript.push({ role: 'assistant', content: state.assistantContent })
      }
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

    // 处理能力建议工具调用：解析参数并通知前端
    if (hasSuggestCall) {
      const suggestCall = toolCallsArray.find((tc) => tc.function.name === 'capability__suggest')!
      try {
        const args = JSON.parse(suggestCall.function.arguments) as {
          capabilityId: string
          reason: string
        }
        const capMeta = reactRuntime.suggestableCapabilityMap.get(args.capabilityId)
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

      // 如果模型只调用了 suggest 工具而没有其他实际工具调用，本轮结束
      if (nonSuggestToolCalls.length === 0) {
        return { shouldBreak: true, toolErrors: [], toolResults: [], toolCallCount: 0 }
      }
    }

    // 构建管道上下文并调用编排器执行工具
    const pipelineContext: PipelineContext = {
      sessionId,
      request: reactRuntime.request,
      modelToolCalls: nonSuggestToolCalls,
      stageResults: new Map(),
      originalQuery: reactRuntime.originalQuery
    }

    const orchestrationResult = await reactRuntime.toolOrchestrator.orchestrate(
      nonSuggestToolCalls,
      reactRuntime.pipeline,
      pipelineContext,
      webContents,
      sessionId,
      turnId
    )

    // 将模型发出的工具调用追加到对话历史
    const executedToolCalls = orchestrationResult.executedToolCalls
    if (executedToolCalls.length > 0) {
      const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
        reasoning_content?: string
      } = {
        role: 'assistant',
        content: state.assistantContent || null,
        tool_calls: executedToolCalls
      }
      if (state.assistantApiReasoningContent) {
        assistantMessage.reasoning_content = state.assistantApiReasoningContent
      }

      conversationMessages.push(
        assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam
      )
      modelTranscript.push({
        role: 'assistant',
        content: state.assistantContent || null,
        tool_calls: executedToolCalls,
        reasoning_content: state.assistantApiReasoningContent || undefined
      })
    }

    // 将工具结果追加到对话历史（编排器不直接修改 messages）
    const executedToolCallIds = new Set(executedToolCalls.map((toolCall) => toolCall.id))
    for (const result of orchestrationResult.results) {
      if (!executedToolCallIds.has(result.toolCallId)) continue
      conversationMessages.push({
        role: 'tool' as const,
        tool_call_id: result.toolCallId,
        content: result.content
      })
      modelTranscript.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: result.content
      })
    }

    // 检查是否有工具需要用户交互（如确认执行），需要则暂停循环等待用户确认
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
        toolCallCount: executedToolCalls.length
      }
    }

    return {
      shouldBreak: false,
      toolErrors: toolExecution.errors,
      toolResults: toolExecution.results,
      toolCallCount: executedToolCalls.length
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
    request: ChatRequest
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    modelTranscript: ChatMessage[]
    totalUsage: TokenUsage
    iterations: number
    abortController: AbortController
    turnId?: string
  }): Promise<{ finalContent: string }> {
    const {
      client,
      llmConfig,
      sessionId,
      webContents,
      request,
      conversationMessages,
      modelTranscript,
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
    modelTranscript.push({ role: 'user', content: REACT_MAX_ITERATIONS_FINAL_PROMPT })

    const requestParams = applyPromptCacheOptions(
      {
        model: llmConfig.model_name,
        messages: conversationMessages,
        stream: true,
        stream_options: { include_usage: true }
      },
      { llmConfig, request }
    )

    const response = await this.modelRetryHandler.createChatCompletionWithRetry(
      client,
      requestParams,
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

    addTokenUsage(totalUsage, finalUsage)
    recordPromptCacheDiagnostics(
      { llmConfig, request, mode: 'react_finalization', scene: 'react_finalization' },
      requestParams,
      finalUsage,
      this.logger
    )

    const finalContent = state.assistantContent.trim() || REACT_EMPTY_FINAL_FALLBACK
    modelTranscript.push({ role: 'assistant', content: finalContent })
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
  private createInitialTokenUsage(): TokenUsage {
    return createEmptyTokenUsage()
  }

  /**
   * 规范化 ReAct 最大迭代次数，确保在有效范围内
   */
  private normalizeMaxReactIterations(maxReactIterations?: number): number {
    if (typeof maxReactIterations !== 'number' || !Number.isFinite(maxReactIterations)) {
      return DEFAULT_REACT_MAX_ITERATIONS
    }

    return Math.max(MIN_REACT_MAX_ITERATIONS, Math.floor(maxReactIterations))
  }

  /**
   * 规范化 Token 预算上限，非有效数值时回退到默认预算
   */
  private normalizeTokenBudget(tokenBudget?: number): number {
    if (typeof tokenBudget !== 'number' || !Number.isFinite(tokenBudget) || tokenBudget <= 0) {
      return DEFAULT_TOKEN_BUDGET
    }

    return Math.floor(tokenBudget)
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
