import OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { Logger } from '../../logger'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type {
  ChatToolExecutionResult,
  StreamEvent,
  UserInteractionRequest
} from '../../../types/chat'
import type { UnifiedToolRegistry } from './UnifiedToolRegistry'
import { toolStatsCollector } from './ToolStatsCollector'

const FORCED_SEQUENTIAL_TOOLS = new Set(['lab__ask_user'])

/**
 * 工具调用定义
 * 兼容 OpenAI 的工具调用格式
 */
export interface ToolCallDefinition {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult extends ChatToolExecutionResult {
  toolCallId: string
  toolName: string
  content: string
  success: boolean
  error?: string
}

export interface ToolExecutionSummary {
  needUserInteraction: boolean
  failedToolCount: number
  errors: string[]
  results: ToolExecutionResult[]
}

/**
 * 依赖分析结果
 */
interface DependencyAnalysis {
  independent: ToolCallDefinition[]
  sequential: ToolCallDefinition[]
}

type TimeoutAndStopRunner = <T>(
  promise: Promise<T>,
  sessionId: string,
  timeoutMs?: number,
  operationName?: string
) => Promise<T>

export interface UnifiedToolExecutorOptions {
  logger: Logger
  registry: UnifiedToolRegistry
  checkStopped: (sessionId: string) => void
  withTimeoutAndStopCheck: TimeoutAndStopRunner
  sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  pendingUserInteraction: Set<string>
  maxConcurrency?: number
}

/**
 * 统一工具执行器
 * 合并 ToolExecutor + ToolCallScheduler，通过注册表统一调度工具执行
 */
export class UnifiedToolExecutor {
  private readonly logger: Logger
  private readonly registry: UnifiedToolRegistry
  private readonly checkStopped: (sessionId: string) => void
  private readonly withTimeoutAndStopCheck: TimeoutAndStopRunner
  private readonly sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  private readonly pendingUserInteraction: Set<string>
  private readonly maxConcurrency: number

  constructor(options: UnifiedToolExecutorOptions) {
    this.logger = options.logger
    this.registry = options.registry
    this.checkStopped = options.checkStopped
    this.withTimeoutAndStopCheck = options.withTimeoutAndStopCheck
    this.sendStreamEvent = options.sendStreamEvent
    this.pendingUserInteraction = options.pendingUserInteraction
    this.maxConcurrency = options.maxConcurrency ?? 3
  }

  /**
   * 执行工具调用集合
   * 分析依赖后并行执行独立工具，再串行执行有依赖的工具
   * @returns 是否需要用户交互
   */
  async executeToolCalls(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string,
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    turnId?: string
  ): Promise<ToolExecutionSummary> {
    this.checkStopped(sessionId)

    const { independent, sequential } = this.analyzeDependencies(toolCalls)
    const results: ToolExecutionResult[] = []

    if (independent.length > 0) {
      this.logger.info('并行执行独立工具', 'main', {
        sessionId,
        count: independent.length
      })

      this.checkStopped(sessionId)

      const parallelResults = await this.executeParallel(
        independent,
        webContents,
        sessionId,
        turnId
      )

      this.checkStopped(sessionId)
      results.push(...parallelResults)

      for (const result of parallelResults) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.content
        })
      }
      const parallelErrors = this.collectToolErrors(parallelResults)
      if (parallelErrors.length > 0) {
        return {
          needUserInteraction: this.pendingUserInteraction.has(sessionId),
          failedToolCount: parallelErrors.length,
          errors: parallelErrors,
          results
        }
      }
    }

    this.checkStopped(sessionId)

    if (sequential.length > 0) {
      this.logger.info('串行执行依赖工具', 'main', {
        sessionId,
        count: sequential.length
      })

      for (const toolCall of sequential) {
        this.checkStopped(sessionId)

        const result = await this.executeSingle(toolCall, webContents, sessionId, turnId)
        results.push(result)

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content
        })

        if (this.pendingUserInteraction.has(sessionId)) {
          return {
            needUserInteraction: true,
            failedToolCount: result.success ? 0 : 1,
            errors: result.error ? [result.error] : [],
            results
          }
        }

        if (!result.success) {
          return {
            needUserInteraction: false,
            failedToolCount: 1,
            errors: result.error ? [result.error] : [],
            results
          }
        }
      }
    }

    this.checkStopped(sessionId)
    return {
      needUserInteraction: this.pendingUserInteraction.has(sessionId),
      failedToolCount: 0,
      errors: [],
      results
    }
  }

  /**
   * 分析工具调用之间的依赖关系
   * 检测哪些工具调用可以并行执行，哪些必须串行执行
   */
  analyzeDependencies(toolCalls: ToolCallDefinition[]): DependencyAnalysis {
    if (toolCalls.length <= 1) {
      return { independent: [], sequential: toolCalls }
    }

    const independent: ToolCallDefinition[] = []
    const sequential: ToolCallDefinition[] = []

    const parsedCalls = toolCalls.map((tc) => ({
      toolCall: tc,
      args: this.parseArguments(tc.function.arguments)
    }))

    for (let i = 0; i < parsedCalls.length; i++) {
      const current = parsedCalls[i]
      if (FORCED_SEQUENTIAL_TOOLS.has(current.toolCall.function.name)) {
        sequential.push(current.toolCall)
        continue
      }

      const hasDependency = this.hasDependencyOnPreviousCalls(current, parsedCalls.slice(0, i))

      if (hasDependency) {
        sequential.push(current.toolCall)
      } else {
        independent.push(current.toolCall)
      }
    }

    this.logger.debug('工具依赖分析完成', 'main', {
      total: toolCalls.length,
      independent: independent.length,
      sequential: sequential.length
    })

    return { independent, sequential }
  }

  // ========== 内部实现 ==========

  /**
   * 执行单个工具调用（统一调度入口）
   * 通过注册表查找适配器并执行
   */
  private async executeSingle(
    toolCall: ToolCallDefinition,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): Promise<ToolExecutionResult> {
    const requestedName = toolCall.function.name
    const registeredTool = this.registry.getTool(requestedName)

    if (!registeredTool) {
      const error = `未找到已注册的工具: ${requestedName}`
      this.logger.error(error, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCall.id, requestedName, error, turnId)
      return {
        toolCallId: toolCall.id,
        toolName: requestedName,
        content: JSON.stringify({ error }),
        success: false,
        error
      }
    }

    const fullName = registeredTool.fullName
    const toolName = registeredTool.functionDef.name
    const startTime = Date.now()
    let statsSuccess = false
    let statsErrorMessage: string | undefined

    try {
      const parsedArgsResult = this.parseArgumentsSafely(
        toolCall.function.arguments,
        fullName,
        webContents,
        sessionId,
        toolCall.id,
        turnId
      )
      if ('error' in parsedArgsResult) {
        statsErrorMessage = parsedArgsResult.error
        return {
          toolCallId: toolCall.id,
          toolName: fullName,
          content: JSON.stringify({ error: parsedArgsResult.error }),
          success: false,
          error: parsedArgsResult.error
        }
      }
      const args = parsedArgsResult.args

      this.logger.info('执行工具调用', 'main', {
        sessionId,
        toolName: fullName,
        category: registeredTool.category,
        args
      })

      this.sendStreamEvent(webContents, {
        type: 'tool_call',
        sessionId,
        turnId,
        toolCall: {
          id: toolCall.id,
          name: toolName,
          serverName: registeredTool.serverName,
          arguments: args
        }
      })

      this.checkStopped(sessionId)

      const timeout = registeredTool.timeoutMs
      const result = await this.withTimeoutAndStopCheck(
        registeredTool.adapter.execute(fullName, args),
        sessionId,
        timeout,
        `工具调用 ${fullName}`
      )

      this.checkStopped(sessionId)

      statsSuccess = result.success
      statsErrorMessage = result.error

      if (!result.success) {
        this.logger.warn('工具调用返回失败', 'main', {
          sessionId,
          toolName: fullName,
          toolCallId: toolCall.id,
          category: registeredTool.category,
          args,
          error: result.error || '工具调用失败'
        })
      }

      const userInteraction = this.extractUserInteractionRequest(result)
      if (userInteraction) {
        this.pendingUserInteraction.add(sessionId)
        this.sendStreamEvent(webContents, {
          type: 'user_interaction',
          sessionId,
          turnId,
          userInteraction
        })
      }

      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        turnId,
        toolResult: {
          id: toolCall.id,
          name: toolName,
          success: result.success,
          result: result.content,
          error: result.error
        }
      })

      const content = result.success
        ? JSON.stringify(result.content ?? null)
        : JSON.stringify({ error: result.error })

      return {
        toolCallId: toolCall.id,
        toolName: fullName,
        content,
        success: result.success,
        error: result.error
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        statsErrorMessage = error.message
        throw error
      }

      statsErrorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('工具调用失败', 'main', {
        sessionId,
        toolName: fullName,
        error: statsErrorMessage
      })

      this.sendErrorToolResult(
        webContents,
        sessionId,
        toolCall.id,
        fullName,
        statsErrorMessage,
        turnId
      )
      return {
        toolCallId: toolCall.id,
        toolName: fullName,
        content: JSON.stringify({ error: statsErrorMessage }),
        success: false,
        error: statsErrorMessage
      }
    } finally {
      toolStatsCollector.record({
        toolName: fullName,
        serverName: registeredTool.serverName,
        category: registeredTool.category,
        sessionId,
        durationMs: Date.now() - startTime,
        success: statsSuccess,
        errorMessage: statsErrorMessage
      })
    }
  }

  /**
   * 并行执行独立的工具调用
   */
  private async executeParallel(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): Promise<ToolExecutionResult[]> {
    if (toolCalls.length === 0) {
      return []
    }

    const results: ToolExecutionResult[] = []

    this.logger.info('开始并行执行工具', 'main', {
      sessionId,
      count: toolCalls.length
    })

    const batchSize = Math.min(this.maxConcurrency, toolCalls.length)
    for (let i = 0; i < toolCalls.length; i += batchSize) {
      const batch = toolCalls.slice(i, i + batchSize)

      const batchResults = await Promise.all(
        batch.map((toolCall) => this.executeSingle(toolCall, webContents, sessionId, turnId))
      )

      results.push(...batchResults)
    }

    this.logger.info('并行工具执行完成', 'main', {
      sessionId,
      total: results.length
    })

    return results
  }

  /**
   * 检查当前工具调用是否依赖之前的工具调用
   */
  private hasDependencyOnPreviousCalls(
    current: { toolCall: ToolCallDefinition; args: Record<string, unknown> },
    previousCalls: Array<{ toolCall: ToolCallDefinition; args: Record<string, unknown> }>
  ): boolean {
    if (previousCalls.length === 0) {
      return false
    }

    const currentArgs = JSON.stringify(current.args).toLowerCase()

    const dependencyIndicators = [
      'previous',
      'above',
      'result',
      'output',
      'return',
      'from.*tool',
      'based on'
    ]

    for (const indicator of dependencyIndicators) {
      const regex = new RegExp(indicator, 'i')
      if (regex.test(currentArgs)) {
        return true
      }
    }

    for (const prev of previousCalls) {
      const prevToolName = prev.toolCall.function.name.toLowerCase()
      if (currentArgs.includes(prevToolName)) {
        return true
      }
    }

    return false
  }

  private collectToolErrors(results: ToolExecutionResult[]): string[] {
    return results
      .filter((result) => !result.success)
      .map((result) => result.error || '工具调用失败')
  }

  /**
   * 解析工具调用参数字符串
   */
  private parseArguments(argsString: string): Record<string, unknown> {
    try {
      return JSON.parse(argsString)
    } catch {
      return {}
    }
  }

  /**
   * 安全解析参数，失败时发送错误事件
   */
  private parseArgumentsSafely(
    argsString: string,
    toolName: string,
    webContents: WebContents,
    sessionId: string,
    toolCallId: string,
    turnId?: string
  ): { args: Record<string, unknown> } | { error: string } {
    try {
      return { args: JSON.parse(argsString || '{}') }
    } catch (error) {
      const errorMessage = `解析工具参数失败: ${error}`
      this.logger.error(errorMessage, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCallId, toolName, errorMessage, turnId)
      return { error: errorMessage }
    }
  }

  /**
   * 从工具调用结果中提取用户交互请求
   */
  private extractUserInteractionRequest(result: MCPToolCallResult): UserInteractionRequest | null {
    if (!result.success || !result.content) {
      return null
    }

    try {
      const contentText =
        Array.isArray(result.content) && result.content[0]?.text ? result.content[0].text : null
      if (!contentText) {
        return null
      }

      const parsed = JSON.parse(contentText)
      if (parsed.user_interaction_required !== true) {
        return null
      }

      return {
        question: parsed.question,
        options: Array.isArray(parsed.options) ? parsed.options : [],
        interactionType: parsed.interactionType === 'generic' ? 'generic' : undefined,
        initialVisibleCount: parsed.initialVisibleCount
      }
    } catch {
      return null
    }
  }

  /**
   * 发送工具失败事件
   */
  private sendErrorToolResult(
    webContents: WebContents,
    sessionId: string,
    toolCallId: string,
    toolName: string,
    error: string,
    turnId?: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'tool_result',
      sessionId,
      turnId,
      toolResult: {
        id: toolCallId,
        name: toolName,
        success: false,
        error
      }
    })
  }
}
