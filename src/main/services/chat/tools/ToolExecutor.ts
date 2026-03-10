import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../../config'
import type { Logger } from '../../logger'
import type { MCPService } from '../../mcp'
import { sandboxToolService } from '../../sandbox'
import { knowledgeToolService } from '../../knowledge'
import type { MCPToolReference, StreamEvent } from '../../../types/chat'
import { enhanceToolDescriptions } from './ToolDescriptionEnhancer'
import type { ToolCallScheduler } from './ToolCallScheduler'

export interface ToolCallDefinition {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type TimeoutAndStopRunner = <T>(
  promise: Promise<T>,
  sessionId: string,
  timeoutMs?: number,
  operationName?: string
) => Promise<T>

interface ToolExecutorOptions {
  logger: Logger
  mcpService: MCPService
  toolScheduler: ToolCallScheduler
  checkStopped: (sessionId: string) => void
  withTimeoutAndStopCheck: TimeoutAndStopRunner
  sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  pendingUserInteraction: Set<string>
  getSelectedKnowledgeBaseIds: (sessionId: string) => string[] | undefined
}

/**
 * 工具执行协调器
 * 负责工具定义构建、工具调度以及单工具调用执行
 */
export class ToolExecutor {
  private readonly logger: Logger
  private readonly mcpService: MCPService
  private readonly toolScheduler: ToolCallScheduler
  private readonly checkStopped: (sessionId: string) => void
  private readonly withTimeoutAndStopCheck: TimeoutAndStopRunner
  private readonly sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
  private readonly pendingUserInteraction: Set<string>
  private readonly getSelectedKnowledgeBaseIds: (sessionId: string) => string[] | undefined

  constructor(options: ToolExecutorOptions) {
    this.logger = options.logger
    this.mcpService = options.mcpService
    this.toolScheduler = options.toolScheduler
    this.checkStopped = options.checkStopped
    this.withTimeoutAndStopCheck = options.withTimeoutAndStopCheck
    this.sendStreamEvent = options.sendStreamEvent
    this.pendingUserInteraction = options.pendingUserInteraction
    this.getSelectedKnowledgeBaseIds = options.getSelectedKnowledgeBaseIds
  }

  /**
   * 构建 OpenAI tools 定义
   * 使用增强后的工具描述，支持 MCP 工具、沙箱工具和知识库工具
   */
  buildOpenAITools(tools: MCPToolReference[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const config = configManager.getConfig()
    const descriptionLevel = config?.promptConfig?.toolDescriptionLevel || 'detailed'

    const enhancedDescriptions = enhanceToolDescriptions(tools, descriptionLevel)
    const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    for (const tool of tools) {
      if (tool.serverName === 'sandbox') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `sandbox__${tool.toolName}`,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>
          }
        })
        continue
      }

      if (tool.serverName === 'knowledge') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `knowledge__${tool.toolName}`,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>
          }
        })
        continue
      }

      const toolKey = `${tool.serverName}__${tool.toolName}`
      const enhancedDescription = enhancedDescriptions.get(toolKey) || tool.description

      openAITools.push({
        type: 'function' as const,
        function: {
          name: this.sanitizeToolName(tool.serverName, tool.toolName),
          description: enhancedDescription,
          parameters: tool.inputSchema as Record<string, unknown>
        }
      })
    }

    return openAITools
  }

  /**
   * 使用调度器执行工具调用
   * 先并行执行独立的工具，再串行执行有依赖的工具
   */
  async executeToolCallsWithScheduler(
    toolCalls: ToolCallDefinition[],
    webContents: WebContents,
    sessionId: string,
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): Promise<boolean> {
    this.checkStopped(sessionId)

    const { independent, sequential } = this.toolScheduler.analyzeDependencies(toolCalls)

    if (independent.length > 0) {
      this.logger.info('并行执行独立工具', 'main', {
        sessionId,
        count: independent.length
      })

      this.checkStopped(sessionId)

      const parallelResults = await this.toolScheduler.executeParallel(
        independent,
        webContents,
        sessionId
      )

      this.checkStopped(sessionId)

      for (const result of parallelResults) {
        conversationMessages.push({
          role: result.message.role,
          content: result.message.content || '',
          tool_call_id: result.message.tool_call_id
        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam)
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

        const result = await this.executeToolCall(toolCall, webContents, sessionId)

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
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
   * 规范化工具名称以符合 OpenAI API 命名规范
   */
  private sanitizeToolName(serverName: string, toolName: string): string {
    const sanitizedServer = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const sanitizedTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `${sanitizedServer}__${sanitizedTool}`
  }

  /**
   * 从规范化后的名称查找原始服务器名称
   */
  private findOriginalServerName(sanitizedServerName: string): string | null {
    const connectedServers = this.mcpService.getConnectedServerNames()
    for (const serverName of connectedServers) {
      const sanitized = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
      if (sanitized === sanitizedServerName) {
        return serverName
      }
    }
    return null
  }

  /**
   * 执行单个工具调用
   * 支持 MCP 工具、沙箱工具和知识库工具
   */
  private async executeToolCall(
    toolCall: ToolCallDefinition,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
    const nameParts = toolCall.function.name.split('__')
    if (nameParts.length !== 2) {
      const error = `无效的工具名称格式: ${toolCall.function.name}`
      this.logger.error(error, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolCall.function.name, error)
      return JSON.stringify({ error })
    }

    const [serverName, toolName] = nameParts

    if (serverName === 'sandbox') {
      return this.executeSandboxTool(toolCall, toolName, webContents, sessionId)
    }

    if (serverName === 'knowledge') {
      return this.executeKnowledgeTool(toolCall, toolName, webContents, sessionId)
    }

    return this.executeMcpTool(toolCall, serverName, toolName, webContents, sessionId)
  }

  /**
   * 执行沙箱工具调用
   */
  private async executeSandboxTool(
    toolCall: ToolCallDefinition,
    toolName: string,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
    const parsedArgsResult = this.parseToolArguments(toolCall, toolName, webContents, sessionId)
    if ('error' in parsedArgsResult) {
      return JSON.stringify({ error: parsedArgsResult.error })
    }
    const args = parsedArgsResult.args

    this.logger.info('执行沙箱工具调用', 'main', {
      sessionId,
      toolName,
      args
    })

    this.sendStreamEvent(webContents, {
      type: 'tool_call',
      sessionId,
      toolCall: {
        id: toolCall.id,
        name: toolName,
        serverName: 'sandbox',
        arguments: args
      }
    })

    try {
      this.checkStopped(sessionId)

      const result = await this.withTimeoutAndStopCheck(
        sandboxToolService.callTool(`sandbox__${toolName}`, args),
        sessionId,
        60000,
        `沙箱工具调用 ${toolName}`
      )

      this.checkStopped(sessionId)

      if (result.success && result.content) {
        try {
          const contentText =
            Array.isArray(result.content) && result.content[0]?.text ? result.content[0].text : null
          if (contentText) {
            const parsed = JSON.parse(contentText)
            if (parsed.user_interaction_required === true) {
              this.pendingUserInteraction.add(sessionId)
              this.sendStreamEvent(webContents, {
                type: 'user_interaction',
                sessionId,
                userInteraction: {
                  question: parsed.question,
                  options: parsed.options
                }
              })
            }
          }
        } catch {
          // 不是 JSON 或不是交互请求，忽略
        }
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

      return result.success
        ? JSON.stringify(result.content)
        : JSON.stringify({ error: result.error })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('沙箱工具调用失败', 'main', {
        sessionId,
        toolName,
        error: errorMessage
      })

      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolName, errorMessage)
      return JSON.stringify({ error: errorMessage })
    }
  }

  /**
   * 执行知识库工具调用
   */
  private async executeKnowledgeTool(
    toolCall: ToolCallDefinition,
    toolName: string,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
    const parsedArgsResult = this.parseToolArguments(toolCall, toolName, webContents, sessionId)
    if ('error' in parsedArgsResult) {
      return JSON.stringify({ error: parsedArgsResult.error })
    }
    const args = parsedArgsResult.args

    this.logger.info('执行知识库工具调用', 'main', {
      sessionId,
      toolName,
      args
    })

    this.sendStreamEvent(webContents, {
      type: 'tool_call',
      sessionId,
      toolCall: {
        id: toolCall.id,
        name: toolName,
        serverName: 'knowledge',
        arguments: args
      }
    })

    try {
      this.checkStopped(sessionId)

      const result = await this.withTimeoutAndStopCheck(
        knowledgeToolService.callTool(
          `knowledge__${toolName}`,
          args,
          this.getSelectedKnowledgeBaseIds(sessionId)
        ),
        sessionId,
        60000,
        `知识库工具调用 ${toolName}`
      )

      this.checkStopped(sessionId)

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

      return result.success
        ? JSON.stringify(result.content)
        : JSON.stringify({ error: result.error })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('知识库工具调用失败', 'main', {
        sessionId,
        toolName,
        error: errorMessage
      })

      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolName, errorMessage)
      return JSON.stringify({ error: errorMessage })
    }
  }

  /**
   * 执行 MCP 工具调用
   */
  private async executeMcpTool(
    toolCall: ToolCallDefinition,
    sanitizedServerName: string,
    sanitizedToolName: string,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
    const serverName = this.findOriginalServerName(sanitizedServerName)
    if (!serverName) {
      const error = `未找到 MCP 服务器: ${sanitizedServerName}`
      this.logger.error(error, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolCall.function.name, error)
      return JSON.stringify({ error })
    }

    const serverTools = this.mcpService.getTools(serverName)
    const tool = serverTools.find((candidate) => {
      const sanitized = candidate.name.replace(/[^a-zA-Z0-9_-]/g, '-')
      return sanitized === sanitizedToolName
    })

    const toolName = tool?.name || sanitizedToolName
    const parsedArgsResult = this.parseToolArguments(toolCall, toolName, webContents, sessionId)
    if ('error' in parsedArgsResult) {
      return JSON.stringify({ error: parsedArgsResult.error })
    }
    const args = parsedArgsResult.args

    this.logger.info('执行 MCP 工具调用', 'main', {
      sessionId,
      serverName,
      toolName,
      args
    })

    this.sendStreamEvent(webContents, {
      type: 'tool_call',
      sessionId,
      toolCall: {
        id: toolCall.id,
        name: toolName,
        serverName,
        arguments: args
      }
    })

    try {
      this.checkStopped(sessionId)

      const result = await this.withTimeoutAndStopCheck(
        this.mcpService.callTool(serverName, toolName, args),
        sessionId,
        60000,
        `MCP工具调用 ${serverName}/${toolName}`
      )

      this.checkStopped(sessionId)

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

      return result.success
        ? JSON.stringify(result.content)
        : JSON.stringify({ error: result.error })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('MCP 工具调用失败', 'main', {
        sessionId,
        serverName,
        toolName,
        error: errorMessage
      })

      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolName, errorMessage)
      return JSON.stringify({ error: errorMessage })
    }
  }

  /**
   * 解析工具参数
   */
  private parseToolArguments(
    toolCall: ToolCallDefinition,
    toolName: string,
    webContents: WebContents,
    sessionId: string
  ): { args: Record<string, unknown> } | { error: string } {
    try {
      return {
        args: JSON.parse(toolCall.function.arguments || '{}')
      }
    } catch (error) {
      const errorMessage = `解析工具参数失败: ${error}`
      this.logger.error(errorMessage, 'main')
      this.sendErrorToolResult(webContents, sessionId, toolCall.id, toolName, errorMessage)
      return { error: errorMessage }
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
