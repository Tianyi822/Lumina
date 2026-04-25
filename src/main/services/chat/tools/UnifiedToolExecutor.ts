import OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { Logger } from '../../logger'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { StreamEvent, UserInteractionRequest } from '../../../types/chat'
import type { UnifiedToolRegistry } from './UnifiedToolRegistry'
import { toolStatsCollector } from './ToolStatsCollector'

const FORCED_SEQUENTIAL_TOOLS = new Set(['sandbox__ask_user'])

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
interface ToolExecutionResult {
  toolCallId: string
  content: string
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
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): Promise<boolean> {
    this.checkStopped(sessionId)

    const { independent, sequential } = this.analyzeDependencies(toolCalls)

    if (independent.length > 0) {
      this.logger.info('并行执行独立工具', 'main', {
        sessionId,
        count: independent.length
      })

      this.checkStopped(sessionId)

      const parallelResults = await this.executeParallel(independent, webContents, sessionId)

      this.checkStopped(sessionId)

      for (const result of parallelResults) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.content
        })
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

        const result = await this.executeSingle(toolCall, webContents, sessionId)

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content
        })

        if (this.pendingUserInteraction.has(sessionId)) {
          return true
        }
      }
    }

    this.checkStopped(sessionId)
    return this.pendingUserInteraction.has(sessionId)
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
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const requestedName = toolCall.function.name
    const registeredTool = this.registry.getTool(requestedName)

    if (!registeredTool) {
      const error = `未找到已注册的工具: ${requestedName}`
      this.logger.error(error, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCall.id, requestedName, error)
      return { toolCallId: toolCall.id, content: JSON.stringify({ error }) }
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
        toolCall.id
      )
      if ('error' in parsedArgsResult) {
        statsErrorMessage = parsedArgsResult.error
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: parsedArgsResult.error })
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

      const userInteraction = this.extractUserInteractionRequest(result)
      if (userInteraction) {
        this.pendingUserInteraction.add(sessionId)
        this.sendStreamEvent(webContents, {
          type: 'user_interaction',
          sessionId,
          userInteraction
        })
      }

      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolName,
          success: result.success,
          result: result.content,
          error: result.error
        }
      })

      return {
        toolCallId: toolCall.id,
        content: result.success
          ? JSON.stringify(result.content)
          : JSON.stringify({ error: result.error })
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        statsErrorMessage = error.message
        throw error
      }

      statsErrorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('工具调用失败', 'main', {
        sessionId,
        toolName: fullName,
        error: statsErrorMessage
      })

      this.sendErrorToolResult(webContents, sessionId, toolCall.id, fullName, statsErrorMessage)
      return { toolCallId: toolCall.id, content: JSON.stringify({ error: statsErrorMessage }) }
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
    sessionId: string
  ): Promise<ToolExecutionResult[]> {
    if (toolCalls.length === 0) {
      return []
    }

    const results: ToolExecutionResult[] = []
    const total = toolCalls.length

    this.logger.info('开始并行执行工具', 'main', {
      sessionId,
      count: toolCalls.length
    })

    this.sendStreamEvent(webContents, {
      type: 'tool_progress',
      sessionId,
      toolProgress: {
        current: 0,
        total,
        message: `准备并行执行 ${toolCalls.length} 个工具...`
      }
    })

    const batchSize = Math.min(this.maxConcurrency, toolCalls.length)
    for (let i = 0; i < toolCalls.length; i += batchSize) {
      const batch = toolCalls.slice(i, i + batchSize)

      const batchResults = await Promise.all(
        batch.map((toolCall, index) =>
          this.executeSingle(toolCall, webContents, sessionId).then((result) => {
            this.sendStreamEvent(webContents, {
              type: 'tool_progress',
              sessionId,
              toolProgress: {
                current: i + index + 1,
                total,
                message: `完成 ${i + index + 1}/${total} 个工具调用`
              }
            })
            return result
          })
        )
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
    toolCallId: string
  ): { args: Record<string, unknown> } | { error: string } {
    try {
      return { args: JSON.parse(argsString || '{}') }
    } catch (error) {
      const errorMessage = `解析工具参数失败: ${error}`
      this.logger.error(errorMessage, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCallId, toolName, errorMessage)
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
    error: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'tool_result',
      sessionId,
      toolResult: {
        id: toolCallId,
        name: toolName,
        success: false,
        error
      }
    })
  }
}
