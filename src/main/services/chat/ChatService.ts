import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import { mcpService } from '../mcp'
import { sandboxToolService } from '../sandbox'
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  StreamEvent,
  TokenUsage,
  MCPToolReference,
  KnowledgeSearchResult
} from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import type { LLMConfig } from '../../types/config'
import { promptBuilder } from './PromptBuilder'
import { enhanceToolDescriptions } from './toolDescriptionEnhancer'
import { ToolCallScheduler } from './ToolCallScheduler'
import { getKnowledgeServiceManager } from '../knowledge'

/**
 * 聊天服务
 * 处理与 OpenAI 兼容 API 的通信，支持流式响应和 ReAct 推理模式
 */
export class ChatService {
  private abortControllers: Map<string, AbortController> = new Map()
  private stoppedSessions: Set<string> = new Set()
  private toolScheduler: ToolCallScheduler
  private pendingExtractions: Set<string> = new Set()
  private extractionTimer: NodeJS.Timeout | null = null

  constructor() {
    this.toolScheduler = new ToolCallScheduler(mcpService, logger, 3)
  }

  /**
   * 检查会话是否已停止
   */
  private isStopped(sessionId: string): boolean {
    return this.stoppedSessions.has(sessionId)
  }

  /**
   * 检查停止状态并在必要时抛出 AbortError
   */
  private checkStopped(sessionId: string): void {
    if (this.isStopped(sessionId)) {
      const error = new Error('Request was stopped by user')
      error.name = 'AbortError'
      throw error
    }
  }

  /**
   * 发送聊天消息并流式返回响应
   * 根据是否选择了工具来决定使用 ReAct 模式还是直接调用
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { selectedTools, selectedKnowledgeBases, sessionId } = request

    this.clearStoppedSession(sessionId)

    let knowledgeResults: KnowledgeSearchResult[] = []
    if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0) {
      try {
        knowledgeResults = await this.searchKnowledgeBases(
          selectedKnowledgeBases,
          request,
          webContents
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          this.sendStreamEvent(webContents, { type: 'done', sessionId })
          this.clearStoppedSession(sessionId)
          return { success: true }
        }
        throw error
      }
    }

    if (this.isStopped(sessionId)) {
      this.sendStreamEvent(webContents, { type: 'done', sessionId })
      this.clearStoppedSession(sessionId)
      return { success: true }
    }

    if ((selectedTools && selectedTools.length > 0) || request.enableSandboxTools) {
      const result = await this.sendMessageWithReact(request, webContents, knowledgeResults)
      this.clearStoppedSession(sessionId)
      return result
    }

    const result = await this.sendMessageDirect(request, webContents, knowledgeResults)
    this.clearStoppedSession(sessionId)
    return result
  }

  /**
   * 带超时和停止检查的 Promise 包装器
   * 在执行过程中定期检查是否被中止，同时设置超时限制
   */
  private async withTimeoutAndStopCheck<T>(
    promise: Promise<T>,
    sessionId: string,
    timeoutMs: number = 30000,
    operationName: string = 'operation'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} 超时`))
      }, timeoutMs)

      const stopCheckInterval = setInterval(() => {
        if (this.isStopped(sessionId)) {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          reject(error)
        }
      }, 100)

      promise
        .then((result) => {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          reject(error)
        })
    })
  }

  /**
   * 搜索知识库
   * 对选中的知识库执行查询并返回相关内容
   */
  private async searchKnowledgeBases(
    knowledgeBases: KnowledgeBaseReference[],
    request: ChatRequest,
    webContents: WebContents
  ): Promise<KnowledgeSearchResult[]> {
    const { messages, sessionId } = request

    this.checkStopped(sessionId)

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    const query = lastUserMessage?.content || ''

    logger.info('开始搜索知识库', 'main', {
      sessionId,
      knowledgeBaseCount: knowledgeBases.length,
      query
    })

    const results: KnowledgeSearchResult[] = []

    for (const kb of knowledgeBases) {
      this.checkStopped(sessionId)

      this.sendStreamEvent(webContents, {
        type: 'knowledge_search',
        sessionId,
        knowledgeSearch: {
          knowledgeBaseId: kb.id,
          knowledgeBaseName: kb.name,
          query
        }
      })

      try {
        const kbData = getKnowledgeServiceManager().getKnowledgeBaseById(kb.id)
        if (!kbData) {
          logger.warn('知识库不存在', 'main', { kbId: kb.id })
          continue
        }

        const service = getKnowledgeServiceManager().getOrCreateInstance(kb.id, kbData)

        const searchResult = await this.withTimeoutAndStopCheck(
          service.search(kb.id, query, 5),
          sessionId,
          30000,
          '知识库搜索'
        )

        this.checkStopped(sessionId)

        if (searchResult.success && searchResult.data) {
          const kbResult: KnowledgeSearchResult = {
            knowledgeBaseId: kb.id,
            knowledgeBaseName: kb.name,
            query,
            results: searchResult.data.results.map((r) => ({
              chunkId: r.chunkId,
              fileId: r.fileId,
              fileName: r.fileName,
              content: r.content,
              similarity: r.similarity
            }))
          }
          results.push(kbResult)

          this.sendStreamEvent(webContents, {
            type: 'knowledge_result',
            sessionId,
            knowledgeResult: kbResult
          })

          logger.info('知识库搜索完成', 'main', {
            kbId: kb.id,
            kbName: kb.name,
            resultCount: kbResult.results.length
          })
        } else {
          logger.warn('知识库搜索失败', 'main', {
            kbId: kb.id,
            error: searchResult.error
          })
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('超时'))
        ) {
          throw error
        }
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('知识库搜索异常', 'main', { kbId: kb.id, error: errorMessage })
      }
    }

    this.checkStopped(sessionId)

    logger.info('知识库搜索全部完成', 'main', {
      sessionId,
      searchedKbCount: knowledgeBases.length,
      resultCount: results.length
    })

    return results
  }

  /**
   * 直接发送消息
   * 不使用工具调用，直接调用 LLM API
   */
  private async sendMessageDirect(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[]
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId } = request

    logger.info('开始发送聊天消息（直接模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length
    })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.isStopped(sessionId)) {
      this.sendStreamEvent(webContents, { type: 'done', sessionId })
      return { success: true }
    }

    const existingController = this.abortControllers.get(sessionId)
    if (existingController) {
      existingController.abort()
    }

    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    try {
      const client = this.createClient(llmConfig)

      const formattedMessages = this.formatMessagesWithKnowledge(messages, knowledgeResults)

      const stream = await client.chat.completions.create(
        {
          model: llmConfig.model_name,
          messages: formattedMessages,
          stream: true,
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.max_tokens,
          stream_options: { include_usage: true }
        },
        {
          signal: abortController.signal
        }
      )

      let usage: TokenUsage | undefined

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
            reasoning_tokens: (chunk.usage as { reasoning_tokens?: number }).reasoning_tokens
          }
        }

        const choice = chunk.choices?.[0]
        if (choice) {
          const delta = choice.delta as {
            content?: string | null
            reasoning_content?: string | null
          }

          if (delta.reasoning_content) {
            this.sendStreamEvent(webContents, {
              type: 'reasoning',
              content: delta.reasoning_content,
              sessionId
            })
          }

          if (delta.content) {
            this.sendStreamEvent(webContents, {
              type: 'content',
              content: delta.content,
              sessionId
            })
          }
        }
      }

      this.sendStreamEvent(webContents, {
        type: 'done',
        usage,
        sessionId
      })

      logger.info('聊天消息发送完成', 'main', { usage })

      return { success: true }
    } catch (error) {
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
      this.abortControllers.delete(sessionId)
      this.clearStoppedSession(sessionId)
    }
  }

  /**
   * 使用 ReAct 模式发送消息
   * 支持工具调用，通过思考-行动-观察循环逐步解决问题
   */
  private async sendMessageWithReact(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[]
  ): Promise<ChatResult> {
    const {
      messages,
      modelKey,
      sessionId,
      selectedTools,
      maxReactIterations = 10,
      enableSandboxTools
    } = request

    logger.info('开始发送聊天消息（ReAct 模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length,
      toolCount: selectedTools?.length,
      selectedToolNames: selectedTools?.map((t) => `${t.serverName}/${t.toolName}`),
      enableSandboxTools
    })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.isStopped(sessionId)) {
      this.sendStreamEvent(webContents, { type: 'done', sessionId })
      return { success: true }
    }

    const existingController = this.abortControllers.get(sessionId)
    if (existingController) {
      existingController.abort()
    }

    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    try {
      const client = this.createClient(llmConfig)

      const config = configManager.getConfig()
      if (config) {
        promptBuilder.updatePromptConfig(config.promptConfig || null)
      }

      // 构建工具列表：合并 MCP 工具和沙箱工具（如果启用）
      const allTools: MCPToolReference[] = [...(selectedTools || [])]

      // 如果启用了沙箱工具，从 sandboxToolService 获取沙箱工具定义
      if (enableSandboxTools) {
        const sandboxTools = sandboxToolService.getTools().map((tool) => {
          // 工具名称可能已经包含 sandbox__ 前缀，需要处理
          const toolName = tool.name.startsWith('sandbox__')
            ? tool.name.slice('sandbox__'.length) // 去掉 'sandbox__' 前缀
            : tool.name
          return {
            serverName: tool.serverName || 'sandbox',
            toolName: toolName,
            description: tool.description,
            inputSchema: tool.inputSchema
          }
        })
        allTools.push(...sandboxTools)

        logger.info('已添加沙箱工具到工具列表', 'main', {
          sessionId,
          sandboxToolCount: sandboxTools.length,
          totalToolCount: allTools.length
        })
      }

      const tools = this.buildOpenAITools(allTools)

      const systemPrompt = await promptBuilder.buildSystemPrompt(
        llmConfig,
        true,
        allTools,
        knowledgeResults
      )
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...this.formatMessagesWithKnowledge(messages, knowledgeResults)
      ]

      const totalUsage: TokenUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }

      let iterations = 0

      while (iterations < maxReactIterations) {
        if (abortController.signal.aborted) {
          logger.info('ReAct 循环被中止', 'main', { sessionId, iterations })
          break
        }

        // 只在第1次、最后1次或每5次迭代打印日志
        if (
          iterations === 0 ||
          iterations === maxReactIterations - 1 ||
          (iterations + 1) % 5 === 0
        ) {
          logger.debug(`ReAct 迭代 ${iterations + 1}/${maxReactIterations}`, 'main', {
            sessionId,
            messageCount: conversationMessages.length
          })
        }

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

        let assistantContent = ''
        let assistantReasoningContent = ''
        const toolCalls: Map<
          number,
          { id: string; type: 'function'; function: { name: string; arguments: string } }
        > = new Map()
        let hasToolCalls = false

        for await (const chunk of response) {
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

            if (delta.reasoning_content) {
              assistantReasoningContent += delta.reasoning_content
              this.sendStreamEvent(webContents, {
                type: 'reasoning',
                content: delta.reasoning_content,
                sessionId
              })
            }

            if (delta.content) {
              assistantContent += delta.content
              this.sendStreamEvent(webContents, {
                type: 'content',
                content: delta.content,
                sessionId
              })
            }

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

        if (!hasToolCalls || toolCalls.size === 0) {
          logger.info('ReAct 循环完成，模型已给出最终答案', 'main', {
            sessionId,
            iterations: iterations + 1,
            hadContent: assistantContent.length > 0
          })
          break
        }

        logger.info('模型请求调用工具', 'main', {
          sessionId,
          iteration: iterations + 1,
          toolCallCount: toolCalls.size,
          toolCallNames: Array.from(toolCalls.values()).map((tc) => tc.function.name)
        })

        const toolCallsArray = Array.from(toolCalls.values())
        const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam & {
          reasoning_content?: string
        } = {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCallsArray
        }

        if (assistantReasoningContent) {
          assistantMessage.reasoning_content = assistantReasoningContent
        }

        conversationMessages.push(
          assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam
        )

        await this.executeToolCallsWithScheduler(
          toolCallsArray,
          webContents,
          sessionId,
          conversationMessages
        )

        iterations++
      }

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

      // 异步提取动态示例（如果启用）
      this.scheduleExampleExtraction(sessionId)

      return { success: true }
    } catch (error) {
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
      this.clearStoppedSession(sessionId)
    }
  }

  /**
   * 规范化工具名称以符合 OpenAI API 命名规范
   * 将非法字符替换为连字符
   */
  private sanitizeToolName(serverName: string, toolName: string): string {
    const sanitizedServer = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const sanitizedTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `${sanitizedServer}__${sanitizedTool}`
  }

  /**
   * 构建 OpenAI tools 定义
   * 使用增强后的工具描述，支持 MCP 工具和沙箱工具
   */
  private buildOpenAITools(
    tools: MCPToolReference[]
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const config = configManager.getConfig()
    const descriptionLevel = config?.promptConfig?.toolDescriptionLevel || 'detailed'

    const enhancedDescriptions = enhanceToolDescriptions(tools, descriptionLevel)

    const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    for (const tool of tools) {
      // 处理沙箱工具（serverName 为 'sandbox'）
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

      // 处理 MCP 工具
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
   * 从规范化后的名称查找原始服务器名称
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
   * 使用调度器执行工具调用
   * 先并行执行独立的工具，再串行执行有依赖的工具
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
    this.checkStopped(sessionId)

    const { independent, sequential } = this.toolScheduler.analyzeDependencies(toolCalls)

    if (independent.length > 0) {
      logger.info('并行执行独立工具', 'main', {
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
      logger.info('串行执行依赖工具', 'main', {
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
      }
    }

    this.checkStopped(sessionId)
  }

  /**
   * 执行单个工具调用
   * 支持 MCP 工具和沙箱工具
   */
  private async executeToolCall(
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
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

    const [serverName, toolName] = nameParts

    // 处理沙箱工具
    if (serverName === 'sandbox') {
      return this.executeSandboxTool(toolCall, toolName, webContents, sessionId)
    }

    // 处理 MCP 工具
    return this.executeMcpTool(toolCall, serverName, toolName, webContents, sessionId)
  }

  /**
   * 执行沙箱工具调用
   */
  private async executeSandboxTool(
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    toolName: string,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
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

    logger.info('执行沙箱工具调用', 'main', {
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
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('沙箱工具调用失败', 'main', {
        sessionId,
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
   * 执行 MCP 工具调用
   */
  private async executeMcpTool(
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    sanitizedServerName: string,
    sanitizedToolName: string,
    webContents: WebContents,
    sessionId: string
  ): Promise<string> {
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
        mcpService.callTool(serverName, toolName, args),
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

      if (result.success) {
        return JSON.stringify(result.content)
      } else {
        return JSON.stringify({ error: result.error })
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('超时'))
      ) {
        throw error
      }

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
   * 可以中止指定会话的请求，或者中止所有请求
   */
  stopRequest(sessionId?: string): void {
    if (sessionId) {
      logger.info('中止会话聊天请求', 'main', { sessionId })
      this.stoppedSessions.add(sessionId)

      const controller = this.abortControllers.get(sessionId)
      if (controller) {
        controller.abort()
        this.abortControllers.delete(sessionId)
      }
    } else {
      if (this.abortControllers.size > 0) {
        logger.info('中止所有聊天请求', 'main', { count: this.abortControllers.size })
        this.abortControllers.forEach((_, sid) => this.stoppedSessions.add(sid))
        this.abortControllers.forEach((controller) => controller.abort())
        this.abortControllers.clear()
      }
    }
  }

  /**
   * 清理会话的停止状态
   */
  private clearStoppedSession(sessionId: string): void {
    this.stoppedSessions.delete(sessionId)
  }

  /**
   * 调度示例提取任务（防抖）
   * 只在 ReAct 模式且有工具调用时调用
   */
  private scheduleExampleExtraction(sessionId: string): void {
    const config = configManager.getConfig()
    if (!config?.promptConfig?.enableDynamicExamples) {
      return
    }

    this.pendingExtractions.add(sessionId)

    // 清除之前的定时器
    if (this.extractionTimer) {
      clearTimeout(this.extractionTimer)
    }

    // 延迟 2 秒批量提取
    this.extractionTimer = setTimeout(() => {
      this.executeBatchExtraction()
    }, 2000)
  }

  /**
   * 批量执行示例提取
   */
  private async executeBatchExtraction(): Promise<void> {
    const sessionIds = Array.from(this.pendingExtractions)
    this.pendingExtractions.clear()
    this.extractionTimer = null

    if (sessionIds.length === 0) return

    try {
      const { exampleManager } = await import('./prompts/ExampleManager')
      const result = await exampleManager.extractAndSave(sessionIds)

      logger.info('批量提取示例完成', 'main', {
        sessionCount: sessionIds.length,
        extracted: result.extracted,
        saved: result.saved
      })
    } catch (error) {
      logger.warn('批量提取示例失败', 'main', { error })
    }
  }

  /**
   * 创建 OpenAI 客户端
   */
  private createClient(config: LLMConfig): OpenAI {
    return new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: 120000
    })
  }

  /**
   * 验证并获取 LLM 配置
   */
  private validateAndGetLLMConfig(
    modelKey: string,
    sessionId: string,
    webContents: WebContents
  ): LLMConfig | null {
    const config = configManager.getConfig()
    if (!config) {
      const error = '配置未加载'
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return null
    }

    const llmConfig = config.llm_config.models.find((m) => m.model_name === modelKey)
    if (!llmConfig) {
      const error = `未找到模型配置: ${modelKey}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error, sessionId })
      return null
    }

    return llmConfig
  }

  /**
   * 构建知识库上下文文本
   */
  private buildKnowledgeContext(knowledgeResults?: KnowledgeSearchResult[]): string {
    if (!knowledgeResults || knowledgeResults.length === 0) {
      return ''
    }

    let context = '\n\n# 知识库参考信息\n\n'
    context += '以下是从选中的知识库中检索到的相关信息，请基于这些信息回答用户问题：\n\n'

    for (const kbResult of knowledgeResults) {
      context += `## 知识库：${kbResult.knowledgeBaseName}\n\n`

      if (kbResult.results.length === 0) {
        context += '*该知识库中未找到相关信息*\n\n'
        continue
      }

      for (const result of kbResult.results) {
        context += `### 文档：${result.fileName}\n`
        context += `**相关度：${(result.similarity * 100).toFixed(1)}%**\n\n`
        context += `${result.content}\n\n`
      }

      context += '---\n\n'
    }

    context += '请基于上述知识库内容回答用户问题。如果知识库中没有相关信息，请明确告知用户。'

    return context
  }

  /**
   * 格式化消息为 OpenAI 格式
   * 过滤掉空内容的助手消息，将知识库结果附加到最后一条用户消息
   */
  private formatMessagesWithKnowledge(
    messages: ChatMessage[],
    knowledgeResults?: KnowledgeSearchResult[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const knowledgeContext = this.buildKnowledgeContext(knowledgeResults)

    return messages
      .filter((msg) => {
        if (msg.role === 'assistant') {
          const hasContent = msg.content && msg.content.trim().length > 0
          const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
          return hasContent || hasToolCalls
        }
        return true
      })
      .map((msg, index) => {
        if (msg.role === 'user' && knowledgeContext && index === messages.length - 1) {
          return {
            role: 'user' as const,
            content: msg.content + knowledgeContext
          }
        }

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
