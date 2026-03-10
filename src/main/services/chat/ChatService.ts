import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import { mcpService } from '../mcp'
import { sandboxToolService } from '../sandbox'
import type {
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
import { formatMessagesWithKnowledge } from './MessageFormatter'
import { ModelRetryHandler } from './ModelRetryHandler'
import {
  createThinkParserState,
  flushThinkParserState,
  splitThinkTaggedContent
} from './ThinkParser'
import { ToolCallScheduler } from './ToolCallScheduler'
import { ToolExecutor } from './ToolExecutor'
import { knowledgeToolService } from '../knowledge'

/**
 * 聊天服务
 * 处理与 OpenAI 兼容 API 的通信，支持流式响应和 ReAct 推理模式
 */
export class ChatService {
  private abortControllers: Map<string, AbortController> = new Map()
  private stoppedSessions: Set<string> = new Set()
  private pendingUserInteraction: Set<string> = new Set()
  private toolScheduler: ToolCallScheduler
  private modelRetryHandler: ModelRetryHandler
  private toolExecutor: ToolExecutor
  // 存储每个会话选中的知识库 ID 列表
  private sessionKnowledgeBases: Map<string, string[]> = new Map()

  constructor() {
    this.toolScheduler = new ToolCallScheduler(mcpService, logger, 3, (sessionId) =>
      this.sessionKnowledgeBases.get(sessionId)
    )
    this.modelRetryHandler = new ModelRetryHandler({
      logger,
      checkStopped: (sessionId) => this.checkStopped(sessionId),
      delayWithAbort: (ms, sessionId, signal) => this.delayWithAbort(ms, sessionId, signal)
    })
    this.toolExecutor = new ToolExecutor({
      logger,
      mcpService,
      toolScheduler: this.toolScheduler,
      checkStopped: (sessionId) => this.checkStopped(sessionId),
      withTimeoutAndStopCheck: (promise, sessionId, timeoutMs, operationName) =>
        this.withTimeoutAndStopCheck(promise, sessionId, timeoutMs, operationName),
      sendStreamEvent: (webContents, event) => this.sendStreamEvent(webContents, event),
      pendingUserInteraction: this.pendingUserInteraction,
      getSelectedKnowledgeBaseIds: (sessionId) => this.sessionKnowledgeBases.get(sessionId)
    })
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
   * 根据是否选择了工具或知识库来决定使用 ReAct 模式还是直接调用
   * 知识库现在作为工具提供给模型，由模型决定是否调用
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { selectedTools, selectedKnowledgeBases, sessionId } = request

    this.clearStoppedSession(sessionId)

    // 判断是否有知识库或工具需要使用
    const hasKnowledgeBases = selectedKnowledgeBases && selectedKnowledgeBases.length > 0
    const hasTools = (selectedTools && selectedTools.length > 0) || request.enableSandboxTools

    // 如果有知识库或工具，使用 ReAct 模式，让模型决定是否调用知识库工具
    if (hasKnowledgeBases || hasTools) {
      const result = await this.sendMessageWithReact(
        request,
        webContents,
        undefined, // 不再预搜索知识库
        selectedKnowledgeBases // 传递知识库信息用于工具定义
      )
      this.clearStoppedSession(sessionId)
      return result
    }

    // 无工具时直接调用
    const result = await this.sendMessageDirect(request, webContents)
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
   * 等待指定时间，支持中止和停止检查
   */
  private async delayWithAbort(ms: number, sessionId: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup()
        resolve()
      }, ms)

      const onAbort = (): void => {
        cleanup()
        const error = new Error('Request was stopped by user')
        error.name = 'AbortError'
        reject(error)
      }

      const stopCheckInterval = setInterval(() => {
        if (this.isStopped(sessionId)) {
          cleanup()
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          reject(error)
        }
      }, 100)

      const cleanup = (): void => {
        clearTimeout(timeoutId)
        clearInterval(stopCheckInterval)
        signal.removeEventListener('abort', onAbort)
      }

      signal.addEventListener('abort', onAbort, { once: true })
    })
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

      const formattedMessages = formatMessagesWithKnowledge(messages, knowledgeResults)

      const stream = await this.modelRetryHandler.createChatCompletionWithRetry(
        client,
        {
          model: llmConfig.model_name,
          messages: formattedMessages,
          stream: true,
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.max_tokens,
          stream_options: { include_usage: true }
        },
        abortController,
        sessionId,
        'direct'
      )

      let usage: TokenUsage | undefined
      const thinkParserState = createThinkParserState()

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
            const { reasoningDelta, contentDelta } = splitThinkTaggedContent(
              delta.content,
              thinkParserState
            )

            if (reasoningDelta) {
              this.sendStreamEvent(webContents, {
                type: 'reasoning',
                content: reasoningDelta,
                sessionId
              })
            }

            if (contentDelta) {
              this.sendStreamEvent(webContents, {
                type: 'content',
                content: contentDelta,
                sessionId
              })
            }
          }
        }
      }

      const { reasoningDelta, contentDelta } = flushThinkParserState(thinkParserState)
      if (reasoningDelta) {
        this.sendStreamEvent(webContents, {
          type: 'reasoning',
          content: reasoningDelta,
          sessionId
        })
      }
      if (contentDelta) {
        this.sendStreamEvent(webContents, {
          type: 'content',
          content: contentDelta,
          sessionId
        })
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

      const errorMessage = this.modelRetryHandler.normalizeModelError(error)
      logger.error('聊天请求失败', 'main', {
        sessionId,
        error: this.modelRetryHandler.getModelErrorMessage(error),
        normalizedError: errorMessage,
        status: this.modelRetryHandler.getModelErrorStatus(error)
      })
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
   * 知识库工具也被添加到工具列表中，由模型决定是否调用
   */
  private async sendMessageWithReact(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[],
    selectedKnowledgeBases?: KnowledgeBaseReference[]
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

      // 如果选择了知识库，添加知识库工具到工具列表
      if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0) {
        const kbIds = selectedKnowledgeBases.map((kb) => kb.id)
        // 保存选中的知识库 ID 到会话映射中，供工具调用时使用
        this.sessionKnowledgeBases.set(sessionId, kbIds)

        const knowledgeTools = knowledgeToolService.getTools(kbIds).map((tool) => {
          // 工具名称可能已经包含 knowledge__ 前缀，需要处理
          const toolName = tool.name.startsWith('knowledge__')
            ? tool.name.slice('knowledge__'.length) // 去掉 'knowledge__' 前缀
            : tool.name
          return {
            serverName: tool.serverName || 'knowledge',
            toolName: toolName,
            description: tool.description,
            inputSchema: tool.inputSchema
          }
        })
        allTools.push(...knowledgeTools)

        logger.info('已添加知识库工具到工具列表', 'main', {
          sessionId,
          knowledgeToolCount: knowledgeTools.length,
          totalToolCount: allTools.length,
          selectedKnowledgeBases: selectedKnowledgeBases.map((kb) => kb.name)
        })
      }

      const tools = this.toolExecutor.buildOpenAITools(allTools)

      const systemPrompt = await promptBuilder.buildSystemPrompt(
        llmConfig,
        true,
        allTools,
        knowledgeResults
      )
      const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...formatMessagesWithKnowledge(messages, knowledgeResults)
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

        // 发送迭代开始事件，通知前端创建新的迭代分组
        this.sendStreamEvent(webContents, {
          type: 'react_iteration_start',
          content: String(iterations),
          sessionId
        })

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

        const response = await this.modelRetryHandler.createChatCompletionWithRetry(
          client,
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
          abortController,
          sessionId,
          `react_iteration_${iterations + 1}`
        )

        let assistantContent = ''
        let assistantReasoningContent = ''
        const thinkParserState = createThinkParserState()
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

            // Token 使用情况已记录在 usage 中
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
              const { reasoningDelta, contentDelta } = splitThinkTaggedContent(
                delta.content,
                thinkParserState
              )

              if (reasoningDelta) {
                assistantReasoningContent += reasoningDelta
                this.sendStreamEvent(webContents, {
                  type: 'reasoning',
                  content: reasoningDelta,
                  sessionId
                })
              }

              if (contentDelta) {
                assistantContent += contentDelta
                this.sendStreamEvent(webContents, {
                  type: 'content',
                  content: contentDelta,
                  sessionId
                })
              }
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

        const { reasoningDelta: remainingReasoningDelta, contentDelta: remainingContentDelta } =
          flushThinkParserState(thinkParserState)

        if (remainingReasoningDelta) {
          assistantReasoningContent += remainingReasoningDelta
          this.sendStreamEvent(webContents, {
            type: 'reasoning',
            content: remainingReasoningDelta,
            sessionId
          })
        }

        if (remainingContentDelta) {
          assistantContent += remainingContentDelta
          this.sendStreamEvent(webContents, {
            type: 'content',
            content: remainingContentDelta,
            sessionId
          })
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

        const needUserInteraction = await this.toolExecutor.executeToolCallsWithScheduler(
          toolCallsArray,
          webContents,
          sessionId,
          conversationMessages
        )

        // 需要用户交互时，暂停 ReAct 循环
        if (needUserInteraction) {
          logger.info('ReAct 循环暂停，等待用户交互', 'main', { sessionId, iterations })
          break
        }

        iterations++
      }

      // 清除用户交互标记
      this.pendingUserInteraction.delete(sessionId)

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
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('用户中止了 ReAct 请求', 'main', { sessionId })
        this.sendStreamEvent(webContents, { type: 'done', sessionId })
        return { success: true }
      }

      const errorMessage = this.modelRetryHandler.normalizeModelError(error)
      logger.error('ReAct 聊天请求失败', 'main', {
        sessionId,
        error: this.modelRetryHandler.getModelErrorMessage(error),
        normalizedError: errorMessage,
        status: this.modelRetryHandler.getModelErrorStatus(error)
      })
      this.sendStreamEvent(webContents, { type: 'error', error: errorMessage, sessionId })
      return { success: false, error: errorMessage }
    } finally {
      this.abortControllers.delete(sessionId)
      this.clearStoppedSession(sessionId)
      this.pendingUserInteraction.delete(sessionId)
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
    this.sessionKnowledgeBases.delete(sessionId)
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
   * 发送流式事件到渲染进程
   */
  private sendStreamEvent(webContents: WebContents, event: StreamEvent): void {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream', event)
    }
  }
}
