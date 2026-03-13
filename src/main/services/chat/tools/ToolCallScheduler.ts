/**
 * 工具调用调度器
 * 分析工具之间的依赖关系，并行执行独立的工具调用以提高效率
 */

import type { WebContents } from 'electron'
import type { ChatMessage } from '@main/types/chat'
import type { MCPService } from '../../mcp'
import type { Logger } from '../../logger'
import { sandboxToolService } from '../../sandbox'
import { knowledgeToolService } from '../../knowledge'
import { presentationToolService } from '../../presentation'
import type { MCPToolCallResult } from '@shared/types/mcp'

const FORCED_SEQUENTIAL_TOOLS = new Set([
  'sandbox__ask_user',
  'presentation__request_template_selection'
])

/**
 * 工具调用定义
 * 兼容 OpenAI 的工具调用格式
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
 * 工具调用执行结果
 */
interface ToolCallExecution {
  /** 工具调用定义 */
  toolCall: ToolCallDefinition
  /** 执行后生成的聊天消息 */
  message: ChatMessage
  /** 执行是否成功 */
  success: boolean
}

/**
 * 依赖分析结果
 */
interface DependencyAnalysis {
  /** 可以并行执行的独立工具调用 */
  independent: ToolCallDefinition[]
  /** 需要串行执行的工具调用 */
  sequential: ToolCallDefinition[]
}

/**
 * 工具调用调度器
 * 通过分析依赖关系提高工具调用效率
 */
export class ToolCallScheduler {
  private mcpService: MCPService
  private logger: Logger
  private maxConcurrency: number
  private getSelectedKnowledgeBaseIds?: (sessionId: string) => string[] | undefined

  constructor(
    mcpService: MCPService,
    logger: Logger,
    maxConcurrency: number = 3,
    getSelectedKnowledgeBaseIds?: (sessionId: string) => string[] | undefined
  ) {
    this.mcpService = mcpService
    this.logger = logger
    this.maxConcurrency = maxConcurrency
    this.getSelectedKnowledgeBaseIds = getSelectedKnowledgeBaseIds
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
   * 将工具调用分批执行，控制并发数量
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

    this.sendProgressEvent(webContents, {
      type: 'tool_progress',
      sessionId,
      current: 0,
      total,
      message: `准备并行执行 ${toolCalls.length} 个工具...`
    })

    const batchSize = Math.min(this.maxConcurrency, toolCalls.length)
    for (let i = 0; i < toolCalls.length; i += batchSize) {
      const batch = toolCalls.slice(i, i + batchSize)

      const batchPromises = batch.map((toolCall, index) =>
        this.executeTool(toolCall, webContents, sessionId).then((result) => {
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
      const parsedArgs = JSON.parse(args)
      const nameParts = toolName.split('__')
      const serverName = nameParts.length > 1 ? nameParts[0] : 'unknown'
      const actualToolName = nameParts.length > 1 ? nameParts[1] : toolName

      this.sendStreamEvent(webContents, {
        type: 'tool_call',
        sessionId,
        toolCall: {
          id: toolCall.id,
          name: actualToolName,
          serverName,
          arguments: parsedArgs
        }
      })

      let toolCallResult: MCPToolCallResult
      if (serverName === 'sandbox') {
        toolCallResult = await sandboxToolService.callTool(toolName, parsedArgs)
      } else if (serverName === 'knowledge') {
        toolCallResult = await knowledgeToolService.callTool(
          toolName,
          parsedArgs,
          this.getSelectedKnowledgeBaseIds?.(sessionId)
        )
      } else if (serverName === 'presentation') {
        toolCallResult = await presentationToolService.callTool(toolName, parsedArgs)
      } else {
        toolCallResult = await this.mcpService.callTool(serverName, actualToolName, parsedArgs)
      }

      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: actualToolName,
          success: toolCallResult.success,
          result: toolCallResult.content,
          error: toolCallResult.error
        }
      })

      const messageContent = toolCallResult.success
        ? JSON.stringify(toolCallResult.content)
        : JSON.stringify({ error: toolCallResult.error })

      const message: ChatMessage = {
        role: 'tool',
        content: messageContent,
        tool_call_id: toolCall.id
      }

      return {
        toolCall,
        message,
        success: toolCallResult.success
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.logger.error('工具执行失败', 'main', {
        toolName,
        error: errorMessage
      })

      const nameParts = toolName.split('__')
      const actualToolName = nameParts.length > 1 ? nameParts[1] : toolName

      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: actualToolName,
          success: false,
          error: errorMessage
        }
      })

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
   * 检查当前工具调用是否依赖之前的工具调用
   * 通过检测参数中的关键词和工具名称来判断
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

    const currentServerName = this.extractServerName(current.toolCall.function.name)

    const sameServerCount = previousCalls.filter(
      (pc) => this.extractServerName(pc.toolCall.function.name) === currentServerName
    ).length

    if (sameServerCount > 0) {
      return false
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
   * 从工具名称中提取服务器名称
   */
  private extractServerName(toolName: string): string {
    const parts = toolName.split('__')
    return parts.length > 1 ? parts[0] : toolName
  }

  /**
   * 按原始调用顺序对结果进行排序
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
   * 发送流式事件到渲染进程
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
   * 发送进度事件到渲染进程
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
