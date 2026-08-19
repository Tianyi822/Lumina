import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { t } from '@main/services/i18n'
import type { Logger } from '../../logger'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type {
  ChatToolExecutionResult,
  StreamEvent,
  UserInteractionRequest
} from '../../../types/chat'
import type { UnifiedToolRegistry } from './UnifiedToolRegistry'
import { toolStatsCollector } from './ToolStatsCollector'

/** 强制串行执行的工具集合（如等待用户交互的工具不能并行调用） */
const FORCED_SEQUENTIAL_TOOLS = new Set<string>([])

/**
 * 连续重复调用拦截阈值：同一 sessionId 内连续相同参数（规范化后）
 * 的工具调用达到此次数即拦截，避免模型陷入死循环（spec §4.4）。
 */
const MAX_REPEATED = 3

/**
 * 重复检测白名单：轮询/分页/检索类工具的重复调用是合理的业务行为，不应拦截。
 */
const DUPLICATE_WHITELIST = new Set(['paper__read_page', 'knowledge__search'])

/**
 * 规范化参数值：递归处理对象/数组，使等价参数产生相同字符串。
 * - 对象 key 排序
 * - 字符串：trim + lowercase
 * - 路径类字符串：去尾斜杠（识别 path/file/dir/url 等常见 key）
 */
function normalizeValue(value: unknown, keyHint?: string): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item))
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort()
    const result: Record<string, unknown> = {}
    for (const key of sortedKeys) {
      result[key] = normalizeValue((value as Record<string, unknown>)[key], key)
    }
    return result
  }
  if (typeof value === 'string') {
    let normalized = value.trim().toLowerCase()
    // 路径类参数：去掉尾部斜杠（/tmp/a/ == /tmp/a）
    if (keyHint && /^(path|file|dir|directory|url|src|dst|dest|target)$/i.test(keyHint)) {
      normalized = normalized.replace(/\/+$/, '')
    }
    return normalized
  }
  return value
}

/**
 * 计算工具调用的规范化参数 hash（FNV-1a 32 位）。
 * 同一工具 + 等价参数（对象 key 顺序无关、路径尾斜杠无关、字符串大小写无关）必产生相同 hash。
 * 纯函数，可独立测试。
 */
function computeArgsHash(toolName: string, args: unknown): string {
  const normalized = {
    tool: toolName,
    args: normalizeValue(args)
  }
  const str = JSON.stringify(normalized)
  // FNV-1a 32 位
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // 等价于 hash * 16777619，用 Math.imul 保持 32 位语义
    hash = Math.imul(hash, 0x01000193)
  }
  // 转为无符号 16 进制
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 工具调用定义（兼容 OpenAI 工具调用格式）
 */
export interface ToolCallDefinition {
  /** 工具调用的唯一标识 */
  id: string
  /** 调用类型，目前仅支持 function */
  type: 'function'
  /** 函数调用的名称和参数（JSON 字符串） */
  function: {
    name: string
    arguments: string
  }
}

/** 单次工具执行的结果 */
export interface ToolExecutionResult extends ChatToolExecutionResult {
  /** 工具调用 ID */
  toolCallId: string
  /** 工具完整名称 */
  toolName: string
  /** 写入模型上下文的工具结果内容 */
  content: string
  /** 执行是否成功 */
  success: boolean
  /** 失败时的错误描述 */
  error?: string
}

/** 一轮工具执行后的汇总信息 */
export interface ToolExecutionSummary {
  /** 是否需要等待用户交互响应 */
  needUserInteraction: boolean
  /** 执行失败的工具数量 */
  failedToolCount: number
  /** 错误消息列表 */
  errors: string[]
  /** 各工具的执行结果 */
  results: ToolExecutionResult[]
}

/** 工具依赖分析结果：区分可并行和需串行执行的调用 */
interface DependencyAnalysis {
  /** 可并行执行的工具调用集合 */
  independent: ToolCallDefinition[]
  /** 必须串行执行的工具调用集合 */
  sequential: ToolCallDefinition[]
}

/** 支持超时和停止检查的异步执行器类型 */
type TimeoutAndStopRunner = <T>(
  promise: Promise<T>,
  sessionId: string,
  timeoutMs?: number,
  operationName?: string
) => Promise<T>

/** UnifiedToolExecutor 构造选项 */
export interface UnifiedToolExecutorOptions {
  /** 日志记录器 */
  logger: Logger
  /** 工具注册表引用 */
  registry: UnifiedToolRegistry
  /** 会话停止状态检查函数 */
  checkStopped: (sessionId: string) => void
  /** 带超时和停止检查的异步包装器 */
  withTimeoutAndStopCheck: TimeoutAndStopRunner
  /** 向渲染进程发送流事件的函数 */
  sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  /** 待处理的用户交互会话集合 */
  pendingUserInteraction: Set<string>
  /** 最大并发执行数（默认 3） */
  maxConcurrency?: number
}

/**
 * 统一工具执行器
 * 合并 ToolExecutor + ToolCallScheduler，通过注册表统一调度工具执行。
 * 支持并行/串行执行、依赖分析、超时控制、用户交互事件派发和统计收集。
 */
export class UnifiedToolExecutor {
  private readonly logger: Logger
  private readonly registry: UnifiedToolRegistry
  private readonly checkStopped: (sessionId: string) => void
  private readonly withTimeoutAndStopCheck: TimeoutAndStopRunner
  private readonly sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  private readonly pendingUserInteraction: Set<string>
  private readonly maxConcurrency: number

  /**
   * per-session 连续重复调用检测状态。
   * key = sessionId，value = 上一次非白名单工具调用的规范化 hash 及连续次数。
   * 当连续相同 hash 达到 MAX_REPEATED 时拦截，防止死循环（spec §4.4）。
   */
  private readonly duplicateState: Map<string, { hash: string; count: number }> = new Map()

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
   * 先分析依赖关系，将独立工具并行执行，将存在依赖的工具串行执行。
   * 串行执行中一旦有工具失败或触发用户交互，立即停止后续工具。
   * @param toolCalls 本次要执行的工具调用列表
   * @param webContents Electron WebContents（用于发送流事件）
   * @param sessionId 会话标识
   * @param conversationMessages 当前对话消息列表（工具结果会追加到其中）
   * @param turnId 本轮消息标识
   * @returns 执行汇总（含是否需要用户交互、失败数量和结果列表）
   */
  async executeToolCalls(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string,
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    turnId?: string
  ): Promise<ToolExecutionSummary> {
    this.checkStopped(sessionId)

    // 连续重复调用检测（spec §4.4）：在依赖分析之前拦截，避免死循环
    const blocked = this.checkDuplicate(toolCalls, webContents, sessionId, turnId)
    if (blocked) {
      // 被拦截的调用仍写入对话上下文，让模型感知到"该换思路了"
      for (const result of blocked.results) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.content
        })
      }
      return {
        needUserInteraction: false,
        failedToolCount: blocked.results.length,
        errors: blocked.results.map((r) => r.error || t('notifications.chat.duplicateCallBlocked')),
        results: blocked.results
      }
    }

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
   * 通过关键词启发式检测当前工具是否引用了前置工具的输出，
   * 同时将 FORCED_SEQUENTIAL_TOOLS 中的工具标记为串行。
   * @param toolCalls 待分析的工具调用列表
   * @returns 可并行 / 需串行的调用分组
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
   * 检测连续重复调用（spec §4.4）
   *
   * 策略：以本轮 toolCalls 的规范化签名（工具名 + 参数 hash，白名单工具跳过）
   * 与上一次记录比对。相同则累计 count，达到 MAX_REPEATED 即拦截并返回结构化错误；
   * 不同则重置为新的签名（被其他工具穿插后自动恢复）。
   *
   * 只针对"连续相同签名"拦截；同轮内多工具调用按整体签名判定，
   * 避免误伤合法的并行调用。
   *
   * @returns 拦截结果（含 [duplicate] 错误），未拦截时返回 null
   */
  private checkDuplicate(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): { results: ToolExecutionResult[] } | null {
    if (toolCalls.length === 0) {
      return null
    }

    // 计算本轮签名：用所有非白名单工具调用的 hash 组合，保证整体语义稳定
    const signatureParts: string[] = []
    let hasNonWhitelisted = false
    for (const tc of toolCalls) {
      const name = tc.function.name
      if (DUPLICATE_WHITELIST.has(name)) {
        // 白名单工具参与签名（保持稳定），但不触发拦截逻辑
        signatureParts.push(`wl:${name}`)
        continue
      }
      hasNonWhitelisted = true
      const parsedArgs = this.parseArguments(tc.function.arguments)
      signatureParts.push(computeArgsHash(name, parsedArgs))
    }

    // 本轮全为白名单工具：不参与重复检测，直接放行
    if (!hasNonWhitelisted) {
      return null
    }

    const signature = signatureParts.join('|')
    const state = this.duplicateState.get(sessionId)
    if (state && state.hash === signature) {
      state.count += 1
      if (state.count > MAX_REPEATED) {
        this.logger.warn('拦截连续重复工具调用（疑似死循环）', 'main', {
          sessionId,
          signature,
          count: state.count,
          toolNames: toolCalls.map((tc) => tc.function.name)
        })
        const results = toolCalls.map((tc) => {
          const error = t('notifications.chat.duplicateCallBlockedDetail', {
            toolName: tc.function.name,
            count: state.count
          })
          // 发送 tool_call 事件，保持与正常执行路径一致的 tool_call→tool_result 配对
          const blockedArgs = this.parseArguments(tc.function.arguments)
          const blockedRegistered = this.registry.getTool(tc.function.name)
          this.sendStreamEvent(webContents, {
            type: 'tool_call',
            sessionId,
            turnId,
            toolCall: {
              id: tc.id,
              name: blockedRegistered?.functionDef.name ?? tc.function.name,
              serverName: blockedRegistered?.serverName ?? tc.function.name,
              arguments: blockedArgs
            }
          })
          // 对模型友好的结构化错误
          this.sendErrorToolResult(webContents, sessionId, tc.id, tc.function.name, error, turnId)
          return {
            toolCallId: tc.id,
            toolName: tc.function.name,
            content: JSON.stringify({ error, duplicate: true, count: state.count }),
            success: false,
            error
          }
        })
        return { results }
      }
    } else {
      // 签名变化（不同参数/不同工具/被穿插打断）：重置计数
      this.duplicateState.set(sessionId, { hash: signature, count: 1 })
    }

    return null
  }

  /**
   * 执行单个工具调用（统一调度入口）
   * 通过注册表查找适配器，执行并收集统计信息。
   * 执行过程中会发送 tool_call 和 tool_result 流事件。
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
      const error = t('notifications.chat.toolNotFound', { toolName: requestedName })
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
        t('notifications.chat.toolCallOperation', { toolName: fullName })
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
          error: result.error || t('notifications.chat.toolCallFailed')
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
   * 并行执行独立的工具调用（分批控制并发数）
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
   * 检查当前工具调用是否依赖前置工具的结果
   * 通过参数文本中是否包含 'previous'、'result'、'based on' 等关键词或前置工具名来判断
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

  /** 收集所有失败工具的错误消息 */
  private collectToolErrors(results: ToolExecutionResult[]): string[] {
    return results
      .filter((result) => !result.success)
      .map((result) => result.error || t('notifications.chat.toolCallFailed'))
  }

  /** 解析工具调用参数字符串为对象 */
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
      const errorMessage = t('notifications.chat.parseToolArgsFailed', { error: String(error) })
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
