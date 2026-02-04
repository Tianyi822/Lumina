import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference, KnowledgeSearchResult } from '@main/types/chat'
import type { PromptBuildOptions } from './prompts/types'
import type { PromptConfig as SharedPromptConfig } from '@shared/types/config'
import type { EnhancedFewShotExample } from './prompts/types'
import { buildReactSystemPrompt, buildKnowledgeEnhancedPrompt } from './prompts/reactSystemPrompt'
import { PromptCache } from './prompts/PromptCache'
import { PromptOptimizer } from './prompts/PromptOptimizer'
import { exampleManager } from './prompts/ExampleManager'

// 使用共享的 PromptConfig 类型
type PromptConfig = SharedPromptConfig

/**
 * PromptBuilder 服务
 * 负责根据配置构建系统提示词
 */
export class PromptBuilder {
  private promptConfig: PromptConfig | null = null
  private cache: PromptCache = new PromptCache()
  private optimizer: PromptOptimizer = new PromptOptimizer()
  private initialized: boolean = false

  constructor() {
    // 异步初始化 ExampleManager（不阻塞构造）
    this.initializeAsync()
  }

  /**
   * 异步初始化
   */
  private async initializeAsync(): Promise<void> {
    try {
      await exampleManager.initialize()
      this.initialized = true
    } catch (error) {
      // 初始化失败不影响基本功能
      console.error('ExampleManager 初始化失败:', error)
    }
  }

  /**
   * 获取缓存实例
   */
  getCache(): PromptCache {
    return this.cache
  }

  /**
   * 获取示例管理器实例
   */
  getExampleManager(): typeof exampleManager {
    return exampleManager
  }

  /**
   * 获取优化器实例
   */
  getOptimizer(): PromptOptimizer {
    return this.optimizer
  }

  /**
   * 更新提示词配置
   */
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
        // 启用缓存并失效配置相关缓存
        this.cache.updateConfig({
          enabled: true,
          systemPromptMaxSize: config.cacheMaxSize || 50,
          systemPromptTTL: config.cacheTTLHours || 24
        })
        this.cache.invalidateConfig()
      }
    }
  }

  /**
   * 构建系统提示词
   * @param modelConfig LLM 配置
   * @param hasTools 是否有工具可用
   * @param selectedTools 选中的工具列表（可选）
   * @param knowledgeResults 知识库搜索结果（可选）
   * @returns 构建好的系统提示词
   */
  async buildSystemPrompt(
    modelConfig: LLMConfig,
    hasTools: boolean,
    selectedTools?: MCPToolReference[],
    knowledgeResults?: KnowledgeSearchResult[]
  ): Promise<string> {
    // 如果没有工具和知识库，使用简单提示词
    if (!hasTools && (!knowledgeResults || knowledgeResults.length === 0)) {
      return this.getBasicSystemPrompt()
    }

    // 获取构建选项
    const options = await this.buildOptions(modelConfig, selectedTools, knowledgeResults)

    // 生成示例 ID 列表（用于缓存键）
    const exampleIds = this.generateExampleIds(options.fewShotCount || 0)

    // 使用缓存构建提示词
    const prompt = this.cache.getSystemPrompt(
      (this.promptConfig || {}) as Record<string, unknown>,
      selectedTools || [],
      exampleIds,
      () => buildReactSystemPrompt(options)
    )

    // 如果有知识库结果，添加知识库增强提示词
    let finalPrompt = prompt
    if (knowledgeResults && knowledgeResults.length > 0) {
      finalPrompt += '\n\n' + buildKnowledgeEnhancedPrompt()
    }

    // 应用优化
    if (this.promptConfig?.enablePromptOptimization && modelConfig.max_tokens) {
      const result = this.optimizer.optimize(finalPrompt, {
        maxTokens: modelConfig.max_tokens,
        aggressiveness: this.promptConfig.optimizationAggressiveness || 'balanced',
        tools: selectedTools
      })

      if (result.compressionLevel > 0) {
        // 可选：记录优化统计（不使用 logger）
        console.debug('提示词已优化', {
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

  /**
   * 生成示例 ID 列表
   */
  private generateExampleIds(count: number): string[] {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      ids.push(`static-${i}`)
    }
    return ids
  }

  /**
   * 构建提示词选项
   */
  private async buildOptions(
    modelConfig: LLMConfig,
    selectedTools?: MCPToolReference[],
    knowledgeResults?: KnowledgeSearchResult[]
  ): Promise<PromptBuildOptions> {
    const options: PromptBuildOptions = {
      includeFewShotExamples: true,
      fewShotCount: 3,
      emphasizeErrorHandling: true,
      toolDescriptionLevel: 'detailed'
    }

    // 从配置中获取设置
    if (this.promptConfig) {
      // 检查是否启用增强提示词
      if (this.promptConfig.enableEnhancedPrompt === false) {
        // 禁用时使用基本配置
        options.includeFewShotExamples = false
        options.emphasizeErrorHandling = false
        options.toolDescriptionLevel = 'minimal'
      } else {
        // 应用配置
        if (this.promptConfig.fewShotCount !== undefined) {
          options.fewShotCount = Math.max(0, Math.min(5, this.promptConfig.fewShotCount))
        }
        if (this.promptConfig.toolDescriptionLevel) {
          options.toolDescriptionLevel = this.promptConfig.toolDescriptionLevel
        }
        if (this.promptConfig.customSystemPrompt) {
          options.customSystemPrompt = this.promptConfig.customSystemPrompt
        }

        // 动态示例：如果启用且已初始化，使用 ExampleManager
        if (
          this.promptConfig.enableDynamicExamples &&
          this.initialized &&
          ((selectedTools && selectedTools.length > 0) ||
            (knowledgeResults && knowledgeResults.length > 0))
        ) {
          try {
            const examples = await exampleManager.selectExamples(selectedTools || [], {
              maxCount: options.fewShotCount || 3,
              minQualityScore: this.promptConfig.dynamicExampleMinQuality || 0.6,
              includeStatic: true,
              includeDynamic: true,
              maxStaticCount: this.promptConfig.maxStaticExamples || 1
            })

            // 如果成功获取到示例，记录使用
            if (examples.length > 0) {
              const exampleIds = examples
                .filter((ex): ex is EnhancedFewShotExample => 'id' in ex)
                .map((ex) => ex.id)

              if (exampleIds.length > 0) {
                // 异步记录使用（不阻塞）
                exampleManager.recordUsage(exampleIds).catch((err) => {
                  console.error('记录示例使用失败:', err)
                })
              }
            }
          } catch (error) {
            console.error('选择动态示例失败:', error)
            // 失败时回退到静态示例
          }
        }
      }
    }

    // 根据模型名称调整
    const modelName = modelConfig.model_name.toLowerCase()
    if (modelName.includes('deepseek')) {
      options.fewShotCount = Math.min(options.fewShotCount || 3, 2)
    }

    return options
  }

  /**
   * 获取基础系统提示词（无工具时使用）
   */
  private getBasicSystemPrompt(): string {
    return `你是一个有帮助的 AI 助手。你的任务是：

1. 仔细理解用户的问题
2. 提供准确、有用的回答
3. 使用清晰、结构化的表达
4. 如果不确定，诚实地说出来

请用友好的语气回应用户，并尽力提供有价值的信息。`
  }

  /**
   * 获取简化的 ReAct 提示词（向后兼容）
   */
  getLegacyReactPrompt(): string {
    return `你是一个可以使用工具的 AI 助手。
当你需要使用工具时，请按以下步骤思考：
1. 思考：分析你需要什么信息以及哪个工具可以帮助你
2. 行动：使用合适的工具并提供正确的参数
3. 观察：查看工具的输出结果
4. 如有需要重复上述步骤，然后给出你的最终答案

请始终解释你的推理过程。当你有足够的信息时，提供一个全面的最终答案。`
  }
}

/**
 * 单例实例
 */
export const promptBuilder = new PromptBuilder()
