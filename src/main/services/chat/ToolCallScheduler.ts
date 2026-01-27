/**
 * 工具调用调度器
 * 分析工具调用依赖关系并并行执行独立的工具调用
 */

import type { WebContents } from 'electron'
import type { ChatMessage } from '@main/types/chat'
import type { MCPService } from '../mcp'
import type { Logger } from '../logger'

/**
 * 工具调用定义（兼容 OpenAI 格式）
 */
interface ToolCallDefinition {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 工具调用结果（内部使用）
 */
interface ToolCallExecution {
  /** 工具调用 */
  toolCall: ToolCallDefinition
  /** 执行后的消息 */
  message: ChatMessage
  /** 是否成功 */
  success: boolean
}

/**
 * 依赖分析结果
 */
interface DependencyAnalysis {
  /** 可并行执行的独立工具调用 */
  independent: ToolCallDefinition[]
  /** 需要串行执行的工具调用 */
  sequential: ToolCallDefinition[]
}

/**
 * 工具调用调度器
 */
export class ToolCallScheduler {
  private mcpService: MCPService
  private logger: Logger
  private maxConcurrency: number

  constructor(mcpService: MCPService, logger: Logger, maxConcurrency: number = 3) {
    this.mcpService = mcpService
    this.logger = logger
    this.maxConcurrency = maxConcurrency
  }

  /**
   * 分析工具调用的依赖关系
   */
  analyzeDependencies(toolCalls: ToolCallDefinition[]): DependencyAnalysis {
    if (toolCalls.length <= 1) {
      return { independent: [], sequential: toolCalls }
    }

    // 分析每个工具调用的参数，检测是否依赖其他工具的输出
    const independent: ToolCallDefinition[] = []
    const sequential: ToolCallDefinition[] = []

    // 解析工具调用参数
    const parsedCalls = toolCalls.map((tc) => ({
      toolCall: tc,
      args: this.parseArguments(tc.function.arguments)
    }))

    // 检测依赖关系
    for (let i = 0; i < parsedCalls.length; i++) {
      const current = parsedCalls[i]
      const hasDependency = this.hasDependencyOnPreviousCalls(
        current,
        parsedCalls.slice(0, i) as Array<{
          toolCall: ToolCallDefinition
          args: Record<string, unknown>
        }>
      )

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

  /**
   * 并行执行独立的工具调用
   */
  async executeParallel(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string
  ): Promise<ToolCallExecution[]> {
    if (toolCalls.length === 0) {
      return []
    }

    const results: ToolCallExecution[] = []
    const total = toolCalls.length

    this.logger.info('开始并行执行工具', 'main', {
      sessionId,
      count: toolCalls.length
    })

    // 发送进度事件
    this.sendProgressEvent(webContents, {
      type: 'tool_progress',
      sessionId,
      current: 0,
      total,
      message: `准备并行执行 ${toolCalls.length} 个工具...`
    })

    // 分批执行（控制并发度）
    const batchSize = Math.min(this.maxConcurrency, toolCalls.length)
    for (let i = 0; i < toolCalls.length; i += batchSize) {
      const batch = toolCalls.slice(i, i + batchSize)

      // 并行执行当前批次
      const batchPromises = batch.map((toolCall, index) =>
        this.executeTool(toolCall, webContents, sessionId).then((result) => {
          // 发送进度更新
          this.sendProgressEvent(webContents, {
            type: 'tool_progress',
            sessionId,
            current: i + index + 1,
            total,
            message: `完成 ${i + index + 1}/${total} 个工具调用`
          })
          return result
        })
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    // 按调用顺序排序结果
    const sortedResults = this.sortResultsByOriginalOrder(results, toolCalls)

    this.logger.info('并行工具执行完成', 'main', {
      sessionId,
      total: results.length,
      successful: results.filter((r) => r.success).length
    })

    return sortedResults
  }

  /**
   * 执行单个工具调用
   */
  private async executeTool(
    toolCall: ToolCallDefinition,
    webContents: WebContents,
    sessionId: string
  ): Promise<ToolCallExecution> {
    const toolName = toolCall.function.name
    const args = toolCall.function.arguments

    try {
      // 解析参数
      const parsedArgs = JSON.parse(args)

      // 发送工具调用事件
      this.sendStreamEvent(webContents, {
        type: 'tool_call',
        sessionId,
        toolCall: {
          id: toolCall.id,
          name: toolName,
          serverName: this.extractServerName(toolName),
          arguments: parsedArgs
        }
      })

      // 调用工具
      const nameParts = toolName.split('__')
      const serverName = nameParts.length > 1 ? nameParts[0] : 'unknown'
      const actualToolName = nameParts.length > 1 ? nameParts[1] : toolName

      const result = await this.mcpService.callTool(serverName, actualToolName, parsedArgs)

      // 发送工具结果事件
      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolName,
          success: true,
          result
        }
      })

      // 构建工具消息
      const message: ChatMessage = {
        role: 'tool',
        content: typeof result === 'string' ? result : JSON.stringify(result),
        tool_call_id: toolCall.id
      }

      return {
        toolCall,
        message,
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.logger.error('工具执行失败', 'main', {
        toolName,
        error: errorMessage
      })

      // 发送错误结果事件
      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolName,
          success: false,
          error: errorMessage
        }
      })

      // 构建错误消息
      const message: ChatMessage = {
        role: 'tool',
        content: JSON.stringify({ error: errorMessage }),
        tool_call_id: toolCall.id
      }

      return {
        toolCall,
        message,
        success: false
      }
    }
  }

  /**
   * 检查当前工具调用是否依赖之前的调用
   */
  private hasDependencyOnPreviousCalls(
    current: { toolCall: ToolCallDefinition; args: Record<string, unknown> },
    previousCalls: Array<{ toolCall: ToolCallDefinition; args: Record<string, unknown> }>
  ): boolean {
    // 如果没有之前的调用，没有依赖
    if (previousCalls.length === 0) {
      return false
    }

    const currentArgs = JSON.stringify(current.args).toLowerCase()

    // 检查是否有明确的依赖标记
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

    // 检查是否引用了之前工具的名称
    for (const prev of previousCalls) {
      const prevToolName = prev.toolCall.function.name.toLowerCase()
      if (currentArgs.includes(prevToolName)) {
        return true
      }
    }

    // 检查语义依赖（同服务器、同资源等）
    const currentServerName = this.extractServerName(current.toolCall.function.name)

    // 如果多个工具调用属于同一个服务器，可能有资源竞争，应该串行
    const sameServerCount = previousCalls.filter(
      (pc) => this.extractServerName(pc.toolCall.function.name) === currentServerName
    ).length

    if (sameServerCount > 0) {
      // 保守策略：同一服务器的工具串行执行
      // 可以根据实际情况调整
      return false // 默认允许并行，除非有明确依赖
    }

    return false
  }

  /**
   * 解析工具参数
   */
  private parseArguments(argsString: string): Record<string, unknown> {
    try {
      return JSON.parse(argsString)
    } catch {
      return {}
    }
  }

  /**
   * 从工具名称中提取服务器名称
   */
  private extractServerName(toolName: string): string {
    const parts = toolName.split('__')
    return parts.length > 1 ? parts[0] : toolName
  }

  /**
   * 按原始调用顺序排序结果
   */
  private sortResultsByOriginalOrder(
    results: ToolCallExecution[],
    originalOrder: ToolCallDefinition[]
  ): ToolCallExecution[] {
    const sorted: ToolCallExecution[] = []

    for (const original of originalOrder) {
      const result = results.find((r) => r.toolCall.id === original.id)
      if (result) {
        sorted.push(result)
      }
    }

    return sorted
  }

  /**
   * 发送流事件
   */
  private sendStreamEvent(
    webContents: WebContents,
    event: {
      type: string
      sessionId?: string
      toolCall?: {
        id: string
        name: string
        serverName?: string
        arguments: Record<string, unknown>
      }
      toolResult?: {
        id: string
        name: string
        success: boolean
        result?: unknown
        error?: string
      }
    }
  ): void {
    webContents.send('chat:stream', event)
  }

  /**
   * 发送进度事件
   */
  private sendProgressEvent(
    webContents: WebContents,
    event: {
      type: string
      sessionId?: string
      current: number
      total: number
      message?: string
    }
  ): void {
    webContents.send('chat:stream', event)
  }
}
