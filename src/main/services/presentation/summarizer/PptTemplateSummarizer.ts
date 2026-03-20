import OpenAI from 'openai'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { LLMConfig } from '@shared/types/config'
import type { ChatMessage } from '@shared/types/chat'
import type { PptTemplateAiSummary, PptTemplateAnalysis } from '@shared/types/ppt-template'
import { PromptBuilder } from './PromptBuilder'
import { SummaryParser } from './SummaryParser'
import { SummaryValidator } from './SummaryValidator'

/**
 * PPT 模板 AI 总结服务
 */
export class PptTemplateSummarizer {
  private promptBuilder: PromptBuilder
  private parser: SummaryParser
  private validator: SummaryValidator

  constructor() {
    this.promptBuilder = new PromptBuilder()
    this.parser = new SummaryParser()
    this.validator = new SummaryValidator()
  }

  /**
   * 生成模板 AI 总结
   */
  async summarize(
    templateId: string,
    analysis: PptTemplateAnalysis
  ): Promise<PptTemplateAiSummary> {
    const llmConfig = this.resolveModelConfig()
    const client = this.createClient(llmConfig)
    const analysisJson = JSON.stringify(analysis, null, 2)
    const messages = this.promptBuilder.buildMessages({
      templateId,
      name: analysis.templateName,
      slideCount: analysis.slides.length,
      analysisJson
    })

    logger.info('开始生成 PPT 模板 AI 总结', 'main', {
      templateId,
      modelName: llmConfig.model_name,
      slideCount: analysis.slides.length
    })

    try {
      const response = await client.chat.completions.create({
        model: llmConfig.model_name,
        messages: this.toOpenAIMessages(messages),
        temperature: Math.min(llmConfig.temperature ?? 0.2, 0.5),
        max_tokens: llmConfig.max_tokens,
        stream: false
      })

      const content = response.choices[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('模型未返回有效的总结内容')
      }

      const parsed = this.parser.parse(content)
      const normalizedSummary = this.normalizeSummaryMetadata(
        parsed,
        templateId,
        llmConfig.model_name
      )
      const validationResult = this.validator.validate(normalizedSummary, analysis.slides.length)

      if (!validationResult.valid) {
        throw new Error(`AI 总结校验失败: ${validationResult.errors.join('; ')}`)
      }

      logger.info('PPT 模板 AI 总结生成成功', 'main', {
        templateId,
        modelName: llmConfig.model_name,
        usage: response.usage
      })

      return normalizedSummary
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 模板 AI 总结生成失败', 'main', {
        templateId,
        modelName: llmConfig.model_name,
        error: errorMessage
      })
      throw new Error(`生成 PPT 模板 AI 总结失败: ${errorMessage}`)
    }
  }

  /**
   * 解析可用的模型配置
   */
  private resolveModelConfig(): LLMConfig {
    const config = configManager.getConfig()
    if (!config) {
      throw new Error('配置未加载')
    }

    const models = config.llm_config?.models ?? []
    if (models.length === 0) {
      throw new Error('未配置可用的 LLM 模型')
    }

    const defaultModelName = config.llm_config?.default_model
    if (defaultModelName) {
      const matched = models.find((item) => item.model_name === defaultModelName)
      if (matched) {
        return matched
      }
    }

    return models[0]
  }

  /**
   * 创建 OpenAI 兼容客户端
   */
  private createClient(config: LLMConfig): OpenAI {
    return new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: 120000
    })
  }

  /**
   * 将共享消息格式转换为 OpenAI 消息格式
   */
  private toOpenAIMessages(
    messages: ChatMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((message) => {
      if (!message.content) {
        throw new Error(`消息内容不能为空: ${message.role}`)
      }

      return {
        role: message.role,
        content: message.content
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam
    })
  }

  /**
   * 使用本地已知元数据覆盖模型返回结果，确保结果稳定
   */
  private normalizeSummaryMetadata(
    summary: PptTemplateAiSummary,
    templateId: string,
    modelName: string
  ): PptTemplateAiSummary {
    return {
      ...summary,
      schemaVersion: '1.0',
      templateId,
      generatedAt: new Date().toISOString(),
      modelName,
      slideSummaries: summary.slideSummaries.map((slideSummary, index) => ({
        ...slideSummary,
        slideIndex: index
      }))
    }
  }
}
