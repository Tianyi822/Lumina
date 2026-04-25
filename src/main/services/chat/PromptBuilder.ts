import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference } from '@main/types/chat'
import type { PromptBuildOptions } from './prompts/types'
import type { PromptConfig as SharedPromptConfig } from '@shared/types/config'
import type { SessionData } from '@shared/types/session'
import { buildReactSystemPrompt } from './prompts/reactSystemPrompt'
import { PromptCache } from './prompts/PromptCache'
import { PromptOptimizer } from './prompts/PromptOptimizer'
import { promptTemplateManager } from './prompts/PromptTemplateManager'
import { exampleManager, exampleRepository } from './examples'
import { getFewShotExamplesAsync } from './prompts/toolExamples'
import { logger } from '@main/services/logger'
import { buildPromptVariableValueMap, replacePromptVariables } from '@shared/utils'

// 使用共享的 PromptConfig 类型
type PromptConfig = SharedPromptConfig

/**
 * 基于工具数量确定描述级别
 * 工具数量多时使用简化描述，少时使用详细描述
 */
function getDescriptionLevelByToolCount(toolCount: number): 'minimal' | 'basic' | 'detailed' {
  if (toolCount > 20) {
    return 'minimal'
  } else if (toolCount > 10) {
    return 'basic'
  }
  return 'detailed'
}

// PromptBuilder 服务，负责根据配置构建系统提示词
export class PromptBuilder {
  private promptConfig: PromptConfig | null = null
  private cache: PromptCache = new PromptCache()
  private optimizer: PromptOptimizer = new PromptOptimizer()

  // 获取缓存实例
  getCache(): PromptCache {
    return this.cache
  }

  // 获取优化器实例
  getOptimizer(): PromptOptimizer {
    return this.optimizer
  }

  // 更新提示词配置
  updatePromptConfig(config: PromptConfig | null): void {
    // 检查配置是否发生变化
    const changed =
      !this.promptConfig || !config || JSON.stringify(this.promptConfig) !== JSON.stringify(config)

    this.promptConfig = config

    // 如果配置发生变化，失效相关缓存
    if (changed && config) {
      if (config.enablePromptCache === false) {
        // 禁用缓存
        this.cache.updateConfig({ enabled: false })
      } else {
        // 构建缓存配置
        const cacheConfig = config.cacheConfig
        const templateVersion = promptTemplateManager.getVersion()

        // 启用缓存并更新配置
        this.cache.updateConfig({
          enabled: true,
          systemPromptMaxSize: cacheConfig?.systemPromptMaxSize ?? 50,
          systemPromptTTL: cacheConfig?.systemPromptTTL ?? 24,
          toolDescriptionMaxSize: cacheConfig?.toolDescriptionMaxSize ?? 200,
          toolDescriptionTTL: cacheConfig?.toolDescriptionTTL ?? 12,
          exampleFormattingMaxSize: cacheConfig?.exampleFormattingMaxSize ?? 500,
          exampleFormattingTTL: cacheConfig?.exampleFormattingTTL ?? 1,
          enableMetrics: cacheConfig?.enableMetrics ?? true,
          maxMetricsSnapshots: cacheConfig?.maxMetricsSnapshots ?? 100,
          // 传递模板版本以实现版本感知缓存失效
          templateVersion
        })

        // 如果配置发生其他变化，清空配置相关缓存
        this.cache.invalidateConfig()
      }
    }
  }

  // 构建系统提示词
  async buildSystemPrompt(
    modelConfig: LLMConfig,
    hasTools: boolean,
    selectedTools?: MCPToolReference[]
  ): Promise<string> {
    // 检查是否有知识库工具
    const hasKnowledgeTools =
      selectedTools?.some((tool) => tool.serverName === 'knowledge') || false

    // 如果没有工具和知识库工具，使用简单提示词
    if (!hasTools && !hasKnowledgeTools) {
      return this.getBasicSystemPrompt()
    }

    // 获取构建选项
    const options = await this.buildOptions(modelConfig, selectedTools)

    let exampleIds: string[] = []

    // 如果启用动态示例，获取动态示例
    if (
      this.promptConfig?.enableDynamicExamples &&
      options.fewShotCount &&
      options.fewShotCount > 0
    ) {
      try {
        const toolNames = selectedTools?.map((t) => `${t.serverName}__${t.toolName}`) || []
        const dynamicExamples = await getFewShotExamplesAsync(options.fewShotCount, {
          minQualityScore: this.promptConfig.dynamicExampleMinQuality ?? 0.6,
          requiredTools: toolNames
        })

        // 如果获取到动态示例，更新选项中的示例数量
        if (dynamicExamples.length > 0) {
          options.fewShotCount = dynamicExamples.length
          options.fewShotExamples = dynamicExamples.map((example) => ({
            userQuery: example.userQuery,
            thought: example.thought,
            toolCalls: example.toolCalls,
            finalAnswer: example.finalAnswer
          }))
          exampleIds = dynamicExamples.map((example) => example.id)
          logger.debug('使用动态示例', 'main', { count: dynamicExamples.length })
        } else {
          options.fewShotCount = 0
          options.fewShotExamples = []
        }
      } catch (error) {
        options.fewShotCount = 0
        options.fewShotExamples = []
        logger.warn('获取动态示例失败', 'main', { error })
      }
    }

    // 使用缓存构建提示词
    const prompt = this.cache.getSystemPrompt(
      (this.promptConfig || {}) as Record<string, unknown>,
      selectedTools || [],
      exampleIds,
      () => buildReactSystemPrompt(options)
    )

    // 应用优化
    const finalPrompt = prompt
    if (this.promptConfig?.enablePromptOptimization && modelConfig.max_tokens) {
      const result = this.optimizer.optimize(finalPrompt, {
        maxTokens: modelConfig.max_tokens,
        aggressiveness: this.promptConfig.optimizationAggressiveness || 'balanced',
        tools: selectedTools
      })

      if (result.compressionLevel > 0) {
        logger.debug('提示词已优化', 'main', {
          originalTokens: result.originalTokens,
          optimizedTokens: result.optimizedTokens,
          reduction: `${result.reductionPercent.toFixed(1)}%`,
          level: result.compressionLevel
        })
      }

      return result.optimizedPrompt
    }

    return finalPrompt
  }

  // 构建提示词选项
  private async buildOptions(
    modelConfig: LLMConfig,
    selectedTools?: MCPToolReference[]
  ): Promise<PromptBuildOptions> {
    // 计算工具数量
    const toolCount = selectedTools?.length || 0

    // 基于工具数量确定默认描述级别
    const defaultDescriptionLevel = getDescriptionLevelByToolCount(toolCount)

    // 初始化选项
    const options: PromptBuildOptions = {
      includeFewShotExamples: true,
      fewShotCount: 0,
      toolDescriptionLevel: defaultDescriptionLevel,
      modelName: modelConfig.model_name
    }

    // 从配置中获取设置
    if (this.promptConfig) {
      // 检查是否启用增强提示词
      if (this.promptConfig.enableEnhancedPrompt === false) {
        // 禁用时使用基本配置
        options.includeFewShotExamples = false
        options.toolDescriptionLevel = 'minimal'
      } else {
        // 应用配置
        if (this.promptConfig.fewShotCount !== undefined) {
          options.fewShotCount = Math.max(0, Math.min(2, this.promptConfig.fewShotCount))
        }
        // 只有用户明确配置了描述级别时才覆盖自动选择的级别
        if (this.promptConfig.toolDescriptionLevel) {
          options.toolDescriptionLevel = this.promptConfig.toolDescriptionLevel
        }
        if (this.promptConfig.customSystemPrompt) {
          const resolvedVariables = buildPromptVariableValueMap(this.promptConfig.customVariables)
          options.customSystemPrompt = replacePromptVariables(
            this.promptConfig.customSystemPrompt,
            resolvedVariables
          )
        }
      }
    }

    // 记录工具数量和选择的描述级别
    logger.debug('基于工具数量选择描述级别', 'main', {
      toolCount,
      descriptionLevel: options.toolDescriptionLevel
    })

    return options
  }

  // 获取基础系统提示词（无工具时使用）
  private getBasicSystemPrompt(): string {
    return `你是一个有帮助的 AI 助手。你的任务是：

 1. 仔细理解用户的问题
 2. 提供准确、有用的回答
 3. 使用清晰、结构化的表达
 4. 如果不确定，诚实地说出来

 请用友好的语气回应户，并尽力提供有价值的信息。`
  }

  /**
   * 从历史会话中提取动态示例
   */
  async extractDynamicExamples(
    sessions: Array<{
      sessionId: string
      messages: Array<{
        id: string
        role: string
        content: string
        reasoning?: string
        tool_calls?: Array<{
          id: string
          function?: {
            name: string
            arguments: string
          }
        }>
        tool_call_id?: string
      }>
    }>
  ): Promise<{
    success: boolean
    extractedCount: number
    error?: string
  }> {
    try {
      const result = await exampleManager.extractAndScoreFromSessionsAsync(
        sessions as SessionData[],
        {
          minQualityScore: this.promptConfig?.dynamicExampleMinQuality ?? 0.6,
          maxExamples: this.promptConfig?.maxDynamicExamples ?? 50
        }
      )

      if (result.examples.length > 0) {
        await exampleRepository.initialize()
        await exampleRepository.add(result.examples)
      }

      return {
        success: true,
        extractedCount: result.examples.length
      }
    } catch (error) {
      logger.error('提取动态示例失败', 'main', { error })
      return {
        success: false,
        extractedCount: 0,
        error: String(error)
      }
    }
  }

  /**
   * 获取动态示例统计信息
   */
  async getDynamicExamplesStats(): Promise<{
    totalExamples: number
    averageQuality: number
    lastExtractedAt?: string
  } | null> {
    await exampleRepository.initialize()

    const stats = await exampleRepository.getStats()

    return {
      totalExamples: stats.total,
      averageQuality: stats.avgQualityScore,
      lastExtractedAt: stats.lastUpdated
    }
  }

  /**
   * 清除动态示例
   */
  async clearDynamicExamples(): Promise<void> {
    await exampleRepository.initialize()
    await exampleRepository.clearDynamicExamples()
  }
}

// 单例实例
export const promptBuilder = new PromptBuilder()
