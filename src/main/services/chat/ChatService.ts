import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  StreamEvent,
  TokenUsage
} from '../../types/chat'
import type { LLMConfig } from '../../types/config'

/**
 * 聊天服务类
 * 负责与 OpenAI 兼容的 API 进行通信，支持流式响应
 */
export class ChatService {
  /** 每个会话的 AbortController 映射，支持多会话并发管理 */
  private abortControllers: Map<string, AbortController> = new Map()

  /**
   * 发送聊天消息并流式返回响应
   * @param request 聊天请求
   * @param webContents 渲染进程 webContents，用于发送流式事件
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { messages, modelKey, sessionId } = request

    logger.info('开始发送聊天消息', 'main', {
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

          // 处理思考内容（DeepSeek）
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
   */
  private formatMessages(
    messages: ChatMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))
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
