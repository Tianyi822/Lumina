import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import { mcpService } from '../mcp'
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  StreamEvent,
  TokenUsage,
  MCPToolReference
} from '../../types/chat'
import type { LLMConfig } from '../../types/config'
import { promptBuilder } from './PromptBuilder'
import { enhanceToolDescriptions } from './toolDescriptionEnhancer'
import { ToolCallScheduler } from './ToolCallScheduler'

/**
 * 聊天服务类
 * 负责与 OpenAI 兼容的 API 进行通信，支持流式响应和 ReAct 推理
 */
export class ChatService {
  /** 每个会话的 AbortController 映射，支持多会话并发管理 */
  private abortControllers: Map<string, AbortController> = new Map()
  /** 工具调用调度器 */
  private toolScheduler: ToolCallScheduler

  constructor() {
    this.toolScheduler = new ToolCallScheduler(mcpService, logger, 3)
  }

  /**
   * 发送聊天消息并流式返回响应
   * @param request 聊天请求
   * @param webContents 渲染进程 webContents，用于发送流式事件
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { selectedTools } = request

    // 如果有选中的工具，启用 ReAct 模式
    if (selectedTools && selectedTools.length > 0) {
      return this.sendMessageWithReact(request, webContents)
    }

    // 无工具时使用原有逻辑
    return this.sendMessageDirect(request, webContents)
  }

  /**
   * 直接发送消息（无工具调用）
   */
  private async sendMessageDirect(
    request: ChatRequest,
    webContents: WebContents
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId } = request

    logger.info('开始发送聊天消息（直接模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length
    })

    // 获取模型配置
    const config = configManager.getConfig()
    if (!config) {
      const error = '配置未加载'
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return { success: false, error }
    }

    const llmConfig = config.llm_configs?.[modelKey]
    if (!llmConfig) {
      const error = `未找到模型配置: ${modelKey}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return { success: false, error }
    }

    // 中止该会话的旧请求（如果存在）
    const existingController = this.abortControllers.get(sessionId)
    if (existingController) {
      logger.debug('中止会话的旧请求', 'main', { sessionId })
      existingController.abort()
    }

    // 创建新的 AbortController 并存入 Map
    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    try {
      // 创建 OpenAI 客户端
      const client = this.createClient(llmConfig)

      // 格式化消息
      const formattedMessages = this.formatMessages(messages)

      logger.debug('发送请求到 API', 'main', {
        baseUrl: llmConfig.base_url,
        model: llmConfig.model_name,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.max_tokens
      })

      // 创建流式请求
      const stream = await client.chat.completions.create(
        {
          model: llmConfig.model_name,
          messages: formattedMessages,
          stream: true,
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.max_tokens,
          // 流式响应时包含 usage 统计
          stream_options: { include_usage: true }
        },
        {
          signal: abortController.signal
        }
      )

      let usage: TokenUsage | undefined

      // 处理流式响应
      for await (const chunk of stream) {
        // 检查是否有 usage 信息（最后一个 chunk）
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
            reasoning_tokens: (chunk.usage as { reasoning_tokens?: number }).reasoning_tokens
          }
        }

        // 处理 choices
        const choice = chunk.choices?.[0]
        if (choice) {
          const delta = choice.delta as {
            content?: string | null
            reasoning_content?: string | null
          }

          // 处理思考内容
          if (delta.reasoning_content) {
            this.sendStreamEvent(webContents, {
              type: 'reasoning',
              content: delta.reasoning_content,
              sessionId
            })
          }

          // 处理正常内容
          if (delta.content) {
            this.sendStreamEvent(webContents, {
              type: 'content',
              content: delta.content,
              sessionId
            })
          }
        }
      }

      // 发送完成事件
      this.sendStreamEvent(webContents, {
        type: 'done',
        usage,
        sessionId
      })

      logger.info('聊天消息发送完成', 'main', { usage })

      return { success: true }
    } catch (error) {
      // 检查是否是用户中止
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('用户中止了请求', 'main', { sessionId })
        this.sendStreamEvent(webContents, { type: 'done', sessionId })
        return { success: true }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('聊天请求失败', 'main', { sessionId, error: errorMessage })
      this.sendStreamEvent(webContents, { type: 'error', error: errorMessage, sessionId })
      return { success: false, error: errorMessage }
    } finally {
      // 从 Map 中移除该会话的 AbortController
      this.abortControllers.delete(sessionId)
    }
  }

  /**
   * 使用 ReAct 模式发送消息（支持工具调用）
   */
  private async sendMessageWithReact(
    request: ChatRequest,
    webContents: WebContents
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId, selectedTools, maxReactIterations = 10 } = request

    logger.info('开始发送聊天消息（ReAct 模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length,
      toolCount: selectedTools?.length,
      selectedToolNames: selectedTools?.map((t) => `${t.serverName}/${t.toolName}`)
    })

    // 获取模型配置
    const config = configManager.getConfig()
    if (!config) {
      const error = '配置未加载'
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return { success: false, error }
    }

    const llmConfig = config.llm_configs?.[modelKey]
    if (!llmConfig) {
      const error = `未找到模型配置: ${modelKey}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return { success: false, error }
    }

    // 中止该会话的旧请求（如果存在）
    const existingController = this.abortControllers.get(sessionId)
    if (existingController) {
      logger.debug('中止会话的旧请求', 'main', { sessionId })
      existingController.abort()
    }

    // 创建新的 AbortController 并存入 Map
    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    try {
      const client = this.createClient(llmConfig)

      // 获取提示词配置
      const config = configManager.getConfig()
      if (config) {
        promptBuilder.updatePromptConfig(config.promptConfig || null)
      }

      // 构建 OpenAI tools 定义
      const tools = this.buildOpenAITools(selectedTools!)

      logger.debug('构建的 OpenAI tools 定义', 'main', {
        sessionId,
        toolCount: tools.length,
        toolNames: tools.map((t) => (t as { function: { name: string } }).function.name)
      })

      // 构建消息历史，使用 PromptBuilder 生成系统提示
      const systemPrompt = await promptBuilder.buildSystemPrompt(llmConfig, true, selectedTools)
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...this.formatMessages(messages)
      ]

      const totalUsage: TokenUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }

      let iterations = 0

      // ReAct 循环
      while (iterations < maxReactIterations) {
        // 检查是否被中止
        if (abortController.signal.aborted) {
          logger.info('ReAct 循环被中止', 'main', { sessionId, iterations })
          break
        }

        logger.debug(`ReAct 迭代 ${iterations + 1}`, 'main', {
          sessionId,
          messageCount: conversationMessages.length
        })

        // 发送请求
        const response = await client.chat.completions.create(
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
          {
            signal: abortController.signal
          }
        )

        // 收集流式响应
        let assistantContent = ''
        let assistantReasoningContent = '' // 收集思考内容
        const toolCalls: Map<
          number,
          { id: string; type: 'function'; function: { name: string; arguments: string } }
        > = new Map()
        let hasToolCalls = false

        for await (const chunk of response) {
          // 累计 usage
          if (chunk.usage) {
            totalUsage.prompt_tokens += chunk.usage.prompt_tokens
            totalUsage.completion_tokens += chunk.usage.completion_tokens
            totalUsage.total_tokens += chunk.usage.total_tokens
          }

          const choice = chunk.choices?.[0]
          if (choice) {
            const delta = choice.delta as {
              content?: string | null
              reasoning_content?: string | null
              tool_calls?: Array<{
                index: number
                id?: string
                type?: 'function'
                function?: { name?: string; arguments?: string }
              }>
            }

            // 处理思考内容（收集用于后续请求）
            if (delta.reasoning_content) {
              assistantReasoningContent += delta.reasoning_content
              this.sendStreamEvent(webContents, {
                type: 'reasoning',
                content: delta.reasoning_content,
                sessionId
              })
            }

            // 处理普通内容
            if (delta.content) {
              assistantContent += delta.content
              this.sendStreamEvent(webContents, {
                type: 'content',
                content: delta.content,
                sessionId
              })
            }

            // 处理工具调用
            if (delta.tool_calls) {
              hasToolCalls = true
              for (const tc of delta.tool_calls) {
                if (!toolCalls.has(tc.index)) {
                  toolCalls.set(tc.index, {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  })
                }
                const existing = toolCalls.get(tc.index)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }
          }
        }

        // 如果没有工具调用，说明模型已完成推理
        if (!hasToolCalls || toolCalls.size === 0) {
          logger.info('ReAct 循环完成，模型已给出最终答案', 'main', {
            sessionId,
            iterations: iterations + 1,
            hadContent: assistantContent.length > 0
          })
          break
        }

        // 记录工具调用信息
        logger.info('模型请求调用工具', 'main', {
          sessionId,
          iteration: iterations + 1,
          toolCallCount: toolCalls.size,
          toolCallNames: Array.from(toolCalls.values()).map((tc) => tc.function.name)
        })

        // 将助手消息（包含工具调用）添加到对话历史
        const toolCallsArray = Array.from(toolCalls.values())
        const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam & {
          reasoning_content?: string
        } = {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCallsArray
        }

        // 如果有思考内容，添加到消息中
        if (assistantReasoningContent) {
          assistantMessage.reasoning_content = assistantReasoningContent
        }

        conversationMessages.push(
          assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam
        )

        // 使用调度器执行工具调用（并行 + 串行混合）
        await this.executeToolCallsWithScheduler(
          toolCallsArray,
          webContents,
          sessionId,
          conversationMessages
        )

        iterations++
      }

      // 发送完成事件
      this.sendStreamEvent(webContents, {
        type: 'done',
        usage: totalUsage,
        sessionId
      })

      logger.info('ReAct 聊天消息发送完成', 'main', {
        sessionId,
        iterations,
        usage: totalUsage
      })

      return { success: true }
    } catch (error) {
      // 检查是否是用户中止
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('用户中止了 ReAct 请求', 'main', { sessionId })
        this.sendStreamEvent(webContents, { type: 'done', sessionId })
        return { success: true }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('ReAct 聊天请求失败', 'main', { sessionId, error: errorMessage })
      this.sendStreamEvent(webContents, { type: 'error', error: errorMessage, sessionId })
      return { success: false, error: errorMessage }
    } finally {
      this.abortControllers.delete(sessionId)
    }
  }

  /**
   * 规范化工具名称以符合 OpenAI API 命名规范
   * 只允许字母、数字、下划线和连字符
   */
  private sanitizeToolName(serverName: string, toolName: string): string {
    // 将空格和其他非法字符替换为连字符
    const sanitizedServer = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const sanitizedTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `${sanitizedServer}__${sanitizedTool}`
  }

  /**
   * 构建 OpenAI tools 定义（使用增强描述）
   */
  private buildOpenAITools(
    tools: MCPToolReference[]
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    // 获取提示词配置以确定描述级别
    const config = configManager.getConfig()
    const descriptionLevel = config?.promptConfig?.toolDescriptionLevel || 'detailed'

    // 批量增强工具描述
    const enhancedDescriptions = enhanceToolDescriptions(tools, descriptionLevel)

    return tools.map((tool) => {
      const toolKey = `${tool.serverName}__${tool.toolName}`
      const enhancedDescription = enhancedDescriptions.get(toolKey) || tool.description

      return {
        type: 'function' as const,
        function: {
          name: this.sanitizeToolName(tool.serverName, tool.toolName),
          description: enhancedDescription,
          parameters: tool.inputSchema as Record<string, unknown>
        }
      }
    })
  }

  /**
   * 通过规范化后的名称查找原始服务器名称
   */
  private findOriginalServerName(sanitizedServerName: string): string | null {
    const connectedServers = mcpService.getConnectedServerNames()
    for (const serverName of connectedServers) {
      const sanitized = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
      if (sanitized === sanitizedServerName) {
        return serverName
      }
    }
    return null
  }

  /**
   * 使用调度器执行工具调用（并行 + 串行混合）
   */
  private async executeToolCallsWithScheduler(
    toolCalls: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>,
    webContents: WebContents,
    sessionId: string,
    conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): Promise<void> {
    // 分析依赖关系
    const { independent, sequential } = this.toolScheduler.analyzeDependencies(toolCalls)

    // 并行执行独立的工具调用
    if (independent.length > 0) {
      logger.info('并行执行独立工具', 'main', {
        sessionId,
        count: independent.length
      })

      const parallelResults = await this.toolScheduler.executeParallel(
        independent,
        webContents,
        sessionId
      )

      // 添加结果到对话历史
      for (const result of parallelResults) {
        conversationMessages.push({
          role: result.message.role,
          content: result.message.content || '',
          tool_call_id: result.message.tool_call_id
        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam)
      }
    }

    // 串行执行有依赖的工具调用
    if (sequential.length > 0) {
      logger.info('串行执行依赖工具', 'main', {
        sessionId,
        count: sequential.length
      })

      for (const toolCall of sequential) {
        const result = await this.executeToolCall(toolCall, webContents, sessionId)

        // 将工具结果添加到对话历史
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        })
      }
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
    // 解析工具名称（格式：serverName__toolName）
    const nameParts = toolCall.function.name.split('__')
    if (nameParts.length !== 2) {
      const error = `无效的工具名称格式: ${toolCall.function.name}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolCall.function.name,
          success: false,
          error
        }
      })
      return JSON.stringify({ error })
    }

    const [sanitizedServerName, sanitizedToolName] = nameParts

    // 查找原始服务器名称
    const serverName = this.findOriginalServerName(sanitizedServerName)
    if (!serverName) {
      const error = `未找到 MCP 服务器: ${sanitizedServerName}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolCall.function.name,
          success: false,
          error
        }
      })
      return JSON.stringify({ error })
    }

    // 从工具列表中查找原始工具名称
    const serverTools = mcpService.getTools(serverName)
    const tool = serverTools.find((t) => {
      const sanitized = t.name.replace(/[^a-zA-Z0-9_-]/g, '-')
      return sanitized === sanitizedToolName
    })

    const toolName = tool?.name || sanitizedToolName
    let args: Record<string, unknown> = {}

    try {
      args = JSON.parse(toolCall.function.arguments || '{}')
    } catch (e) {
      const error = `解析工具参数失败: ${e}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, {
        type: 'tool_result',
        sessionId,
        toolResult: {
          id: toolCall.id,
          name: toolName,
          success: false,
          error
        }
      })
      return JSON.stringify({ error })
    }

    logger.info('执行 MCP 工具调用', 'main', {
      sessionId,
      serverName,
      toolName,
      args
    })

    // 发送工具调用事件
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
      // 执行 MCP 工具调用
      const result = await mcpService.callTool(serverName, toolName, args)

      // 发送工具结果事件
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

      if (result.success) {
        return JSON.stringify(result.content)
      } else {
        return JSON.stringify({ error: result.error })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('MCP 工具调用失败', 'main', {
        sessionId,
        serverName,
        toolName,
        error: errorMessage
      })

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

      return JSON.stringify({ error: errorMessage })
    }
  }

  /**
   * 中止请求
   * @param sessionId 可选的会话标识。如果提供，只中止该会话的请求；否则中止所有请求
   */
  stopRequest(sessionId?: string): void {
    if (sessionId) {
      // 中止特定会话的请求
      const controller = this.abortControllers.get(sessionId)
      if (controller) {
        logger.info('中止会话聊天请求', 'main', { sessionId })
        controller.abort()
        this.abortControllers.delete(sessionId)
      }
    } else {
      // 中止所有请求
      if (this.abortControllers.size > 0) {
        logger.info('中止所有聊天请求', 'main', { count: this.abortControllers.size })
        this.abortControllers.forEach((controller) => controller.abort())
        this.abortControllers.clear()
      }
    }
  }

  /**
   * 创建 OpenAI 客户端
   */
  private createClient(config: LLMConfig): OpenAI {
    return new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      // 禁用默认超时，让用户可以等待更长时间
      timeout: 120000
    })
  }

  /**
   * 格式化消息为 OpenAI 格式
   * 过滤掉 content 为空的助手消息（保留有 tool_calls 的）
   */
  private formatMessages(
    messages: ChatMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages
      .filter((msg) => {
        // 过滤掉 content 为空的助手消息（保留有 tool_calls 的助手消息）
        if (msg.role === 'assistant') {
          const hasContent = msg.content && msg.content.trim().length > 0
          const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
          return hasContent || hasToolCalls
        }
        return true
      })
      .map((msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'tool' as const,
            tool_call_id: msg.tool_call_id || '',
            content: msg.content || ''
          }
        }
        if (msg.role === 'assistant' && msg.tool_calls) {
          return {
            role: 'assistant' as const,
            content: msg.content,
            tool_calls: msg.tool_calls
          }
        }
        return {
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content || ''
        }
      })
  }

  /**
   * 发送流式事件到渲染进程
   */
  private sendStreamEvent(webContents: WebContents, event: StreamEvent): void {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream', event)
    }
  }
}
