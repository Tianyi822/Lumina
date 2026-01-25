import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import type { ChatMessage, ChatRequest, ChatResult, StreamEvent, TokenUsage } from '../../types/chat'
import type { LLMConfig } from '../../types/config'

/**
 * 聊天服务类
 * 负责与 OpenAI 兼容的 API 进行通信，支持流式响应
 */
export class ChatService {
  /** 当前活跃的 AbortController */
  private abortController: AbortController | null = null

  /**
   * 发送聊天消息并流式返回响应
   * @param request 聊天请求
   * @param webContents 渲染进程 webContents，用于发送流式事件
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { messages, modelKey } = request

    logger.info('开始发送聊天消息', 'main', {
      modelKey,
      messageCount: messages.length
    })

    // 获取模型配置
    const config = configManager.getConfig()
    if (!config) {
      const error = '配置未加载'
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error })
      return { success: false, error }
    }

    const llmConfig = config.llm_configs?.[modelKey]
    if (!llmConfig) {
      const error = `未找到模型配置: ${modelKey}`
      logger.error(error, 'main')
      this.sendStreamEvent(webContents, { type: 'error', error })
      return { success: false, error }
    }

    // 创建 AbortController
    this.abortController = new AbortController()

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
          signal: this.abortController.signal
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
              content: delta.reasoning_content
            })
          }

          // 处理正常内容
          if (delta.content) {
            this.sendStreamEvent(webContents, {
              type: 'content',
              content: delta.content
            })
          }
        }
      }

      // 发送完成事件
      this.sendStreamEvent(webContents, {
        type: 'done',
        usage
      })

      logger.info('聊天消息发送完成', 'main', { usage })

      return { success: true }
    } catch (error) {
      // 检查是否是用户中止
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('用户中止了请求', 'main')
        this.sendStreamEvent(webContents, { type: 'done' })
        return { success: true }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('聊天请求失败', 'main', { error: errorMessage })
      this.sendStreamEvent(webContents, { type: 'error', error: errorMessage })
      return { success: false, error: errorMessage }
    } finally {
      this.abortController = null
    }
  }

  /**
   * 中止当前请求
   */
  stopRequest(): void {
    if (this.abortController) {
      logger.info('中止当前聊天请求', 'main')
      this.abortController.abort()
      this.abortController = null
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
