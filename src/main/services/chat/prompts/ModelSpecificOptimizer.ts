/**
 * 模型特定提示词优化器
 * 针对不同模型（GPT-4、Claude、DeepSeek 等）提供特定优化
 */

import type { PromptBuildOptions } from './types'
import type { PromptTemplate } from './PromptTemplateManager'
import { logger } from '../../logger'

/**
 * 模型特定优化配置
 */
export interface ModelSpecificConfig {
  /** 模型名称匹配模式（正则表达式） */
  modelPattern: string
  /** 显示名称 */
  displayName: string
  /** 优化配置 */
  optimizations: ModelOptimizations
}

/**
 * 模型优化项
 */
export interface ModelOptimizations {
  /** 推荐的 Few-shot 示例数量 */
  fewShotCount?: number
  /** 是否强调思维链 */
  emphasisOnCOT?: boolean
  /** 工具描述风格 */
  toolDescriptionStyle?: 'concise' | 'detailed' | 'minimal'
  /** 模型特定指令 */
  specialInstructions?: string
  /** 温度建议 */
  recommendedTemperature?: number
  /** 最大 token 建议 */
  recommendedMaxTokens?: number
  /** 是否支持系统提示词 */
  supportsSystemPrompt?: boolean
  /** 系统提示词位置（如果支持） */
  systemPromptPosition?: 'start' | 'end' | 'both'
  /** 是否需要特殊格式化 */
  needsSpecialFormatting?: boolean
  /** 格式化函数（如果需要） */
  formatFunction?: (prompt: string) => string
  /** 章节优先级调整 */
  sectionPriorities?: Record<string, 'essential' | 'high' | 'medium' | 'low'>
  /** 是否启用原生工具调用 */
  nativeToolCalling?: boolean
  /** 响应格式偏好 */
  responseFormat?: 'json' | 'xml' | 'markdown' | 'auto'
}

/**
 * 模型识别结果
 */
export interface ModelRecognitionResult {
  /** 是否识别成功 */
  recognized: boolean
  /** 模型类型 */
  modelType: string
  /** 匹配的配置 */
  config: ModelSpecificConfig | null
  /** 置信度 (0-1) */
  confidence: number
}

/**
 * 优化后的提示词结果
 */
export interface OptimizedPromptResult {
  /** 优化后的模板 */
  template: PromptTemplate
  /** 应用的建议 */
  appliedSuggestions: string[]
  /** 警告信息 */
  warnings: string[]
  /** 原始配置 */
  originalConfig: ModelSpecificConfig | null
}

// 预定义的模型优化配置
const DEFAULT_MODEL_CONFIGS: ModelSpecificConfig[] = [
  // OpenAI GPT-4 系列
  {
    modelPattern: 'gpt-4|gpt4',
    displayName: 'OpenAI GPT-4',
    optimizations: {
      fewShotCount: 3,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'detailed',
      specialInstructions: `你是 GPT-4，OpenAI 开发的大型语言模型。
- 你擅长遵循复杂的指令和系统提示词
- 你可以使用工具来扩展你的能力
- 在推理过程中，请展示清晰的思维链
- 对于工具调用，请确保参数格式正确且完整`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: true,
      responseFormat: 'json',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'high',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'medium'
      }
    }
  },

  // OpenAI GPT-3.5 系列
  {
    modelPattern: 'gpt-3\.5|gpt35',
    displayName: 'OpenAI GPT-3.5',
    optimizations: {
      fewShotCount: 5,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'detailed',
      specialInstructions: `你是 GPT-3.5，一个高效的语言模型。
- 你需要更详细的指令来理解复杂任务
- 请特别注意工具调用的参数格式
- 使用明确的步骤来展示你的推理过程`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: true,
      responseFormat: 'json',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'essential',
        toolBestPractices: 'high',
        errorHandling: 'high',
        outputFormat: 'medium',
        sandboxManagement: 'medium'
      }
    }
  },

  // Anthropic Claude 系列
  {
    modelPattern: 'claude',
    displayName: 'Anthropic Claude',
    optimizations: {
      fewShotCount: 2,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'concise',
      specialInstructions: `你是 Claude，Anthropic 开发的 AI 助手。
- 你擅长理解和遵循详细的系统指令
- 你可以使用 XML 标签来组织你的思考过程
- 对于工具调用，请确保遵循指定的格式
- 你支持更长的上下文窗口，可以处理更复杂的任务`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 8192,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: true,
      responseFormat: 'xml',
      formatFunction: (prompt: string) => {
        // Claude 偏好 XML 格式的工具调用
        return prompt.replace(
          /工具调用格式[\s\S]*?(?=\n\n|$)/,
          `工具调用格式：
<function_calls>
<invoke name="工具名称">
<parameter name="参数名">参数值</parameter>
</invoke>
</function_calls>`
        )
      },
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'medium',
        errorHandling: 'medium',
        outputFormat: 'high',
        sandboxManagement: 'low'
      }
    }
  },

  // DeepSeek 系列
  {
    modelPattern: 'deepseek',
    displayName: 'DeepSeek',
    optimizations: {
      fewShotCount: 3,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'detailed',
      specialInstructions: `你是 DeepSeek，一个强大的中文大语言模型。
- 你特别擅长中文理解和生成
- 你可以使用工具来增强你的能力
- 在推理时，请展示清晰的思考过程
- 对于代码相关任务，你表现出色`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: false,
      responseFormat: 'markdown',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'high',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'high'
      }
    }
  },

  // Qwen 系列
  {
    modelPattern: 'qwen|通义千问',
    displayName: 'Qwen (通义千问)',
    optimizations: {
      fewShotCount: 3,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'detailed',
      specialInstructions: `你是通义千问 (Qwen)，阿里云开发的大型语言模型。
- 你擅长中文和英文的混合处理
- 你可以使用工具来完成复杂任务
- 请使用清晰的步骤展示你的推理过程
- 对于工具调用，请确保参数准确无误`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: true,
      responseFormat: 'json',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'high',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'medium'
      }
    }
  },

  // Llama 系列
  {
    modelPattern: 'llama',
    displayName: 'Meta Llama',
    optimizations: {
      fewShotCount: 4,
      emphasisOnCOT: false,
      toolDescriptionStyle: 'detailed',
      specialInstructions: `你是基于 Llama 架构的 AI 助手。
- 你需要更明确的指令来理解任务
- 请使用结构化的格式展示你的回答
- 对于工具调用，请仔细检查参数格式
- 如果不确定，请询问用户澄清`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'both',
      nativeToolCalling: false,
      responseFormat: 'markdown',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'essential',
        errorHandling: 'high',
        outputFormat: 'medium',
        sandboxManagement: 'low'
      }
    }
  },

  // Gemini 系列
  {
    modelPattern: 'gemini',
    displayName: 'Google Gemini',
    optimizations: {
      fewShotCount: 3,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'concise',
      specialInstructions: `你是 Gemini，Google 开发的 AI 助手。
- 你擅长多模态理解和推理
- 你可以使用工具来扩展你的能力
- 请展示清晰的思考过程
- 支持原生函数调用，请使用正确的格式`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 8192,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: true,
      responseFormat: 'json',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'medium',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'low'
      }
    }
  },

  // 默认配置（未识别模型时使用）
  {
    modelPattern: '.*',
    displayName: '通用模型',
    optimizations: {
      fewShotCount: 3,
      emphasisOnCOT: true,
      toolDescriptionStyle: 'basic',
      specialInstructions: `你是一个 AI 助手，具备工具使用能力。
- 你可以使用提供的工具来完成任务
- 请展示清晰的思考过程
- 确保工具调用的参数格式正确`,
      recommendedTemperature: 0.7,
      recommendedMaxTokens: 4096,
      supportsSystemPrompt: true,
      systemPromptPosition: 'start',
      nativeToolCalling: false,
      responseFormat: 'auto',
      sectionPriorities: {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'high',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'medium'
      }
    }
  }
]

/**
 * 模型特定提示词优化器
 */
export class ModelSpecificOptimizer {
  private modelConfigs: ModelSpecificConfig[] = [...DEFAULT_MODEL_CONFIGS]

  /**
   * 识别模型类型
   */
  recognizeModel(modelName: string): ModelRecognitionResult {
    const normalizedName = modelName.toLowerCase().trim()

    // 按优先级匹配（排除最后的通配符默认配置）
    for (const config of this.modelConfigs.slice(0, -1)) {
      const regex = new RegExp(config.modelPattern, 'i')
      if (regex.test(normalizedName)) {
        return {
          recognized: true,
          modelType: config.displayName,
          config,
          confidence: 0.9
        }
      }
    }

    // 返回默认配置
    return {
      recognized: false,
      modelType: 'unknown',
      config: this.modelConfigs[this.modelConfigs.length - 1],
      confidence: 0.5
    }
  }

  /**
   * 优化提示词模板
   */
  optimizeTemplate(
    template: PromptTemplate,
    modelName: string,
    options: PromptBuildOptions = {}
  ): OptimizedPromptResult {
    const recognition = this.recognizeModel(modelName)
    const config = recognition.config

    if (!config) {
      return {
        template: { ...template },
        appliedSuggestions: [],
        warnings: ['未找到匹配的模型配置'],
        originalConfig: null
      }
    }

    const result: OptimizedPromptResult = {
      template: JSON.parse(JSON.stringify(template)),
      appliedSuggestions: [],
      warnings: [],
      originalConfig: config
    }

    const { optimizations } = config

    // 应用特殊指令
    if (optimizations.specialInstructions) {
      result.template.sections.coreInstructions =
        optimizations.specialInstructions + '\n\n' + result.template.sections.coreInstructions
      result.appliedSuggestions.push('添加了模型特定指令')
    }

    // 应用格式化函数
    if (optimizations.formatFunction && optimizations.needsSpecialFormatting) {
      for (const section of Object.keys(result.template.sections) as Array<
        keyof typeof result.template.sections
      >) {
        result.template.sections[section] = optimizations.formatFunction(
          result.template.sections[section]
        )
      }
      result.appliedSuggestions.push('应用了模型特定格式化')
    }

    // 调整工具描述风格提示
    if (optimizations.toolDescriptionStyle) {
      const styleGuide = this.getToolDescriptionStyleGuide(optimizations.toolDescriptionStyle)
      result.template.sections.toolBestPractices += '\n\n' + styleGuide
      result.appliedSuggestions.push(`工具描述风格调整为: ${optimizations.toolDescriptionStyle}`)
    }

    // 添加思维链强调
    if (optimizations.emphasisOnCOT) {
      result.template.sections.reactProcess += `

## 思维链要求

请使用明确的思维链格式展示你的推理过程：
1. 首先分析问题
2. 列出可能的解决方案
3. 选择最佳方案并解释原因
4. 执行并验证结果`
      result.appliedSuggestions.push('强调了思维链')
    }

    // 检查警告
    if (!optimizations.supportsSystemPrompt) {
      result.warnings.push('该模型可能不支持系统提示词，建议将指令放在用户消息中')
    }

    if (!optimizations.nativeToolCalling) {
      result.warnings.push('该模型不支持原生工具调用，需要使用提示词引导工具调用格式')
    }

    logger.info('提示词模板已针对模型优化', 'main', {
      model: modelName,
      modelType: recognition.modelType,
      suggestions: result.appliedSuggestions,
      warnings: result.warnings
    })

    return result
  }

  /**
   * 获取构建选项建议
   */
  getBuildOptionsSuggestion(modelName: string): Partial<PromptBuildOptions> {
    const recognition = this.recognizeModel(modelName)
    const config = recognition.config

    if (!config) return {}

    const { optimizations } = config

    return {
      fewShotCount: optimizations.fewShotCount,
      toolDescriptionLevel: optimizations.toolDescriptionStyle,
      emphasizeErrorHandling: optimizations.sectionPriorities?.errorHandling === 'high'
    }
  }

  /**
   * 获取模型推荐配置
   */
  getModelRecommendation(modelName: string): {
    temperature: number
    maxTokens: number
    supportsTools: boolean
    supportsSystemPrompt: boolean
  } | null {
    const recognition = this.recognizeModel(modelName)
    const config = recognition.config

    if (!config) return null

    return {
      temperature: config.optimizations.recommendedTemperature ?? 0.7,
      maxTokens: config.optimizations.recommendedMaxTokens ?? 4096,
      supportsTools: config.optimizations.nativeToolCalling ?? false,
      supportsSystemPrompt: config.optimizations.supportsSystemPrompt ?? true
    }
  }

  /**
   * 获取章节优先级
   */
  getSectionPriorities(modelName: string): Record<string, 'essential' | 'high' | 'medium' | 'low'> {
    const recognition = this.recognizeModel(modelName)
    const config = recognition.config

    return (
      config?.optimizations.sectionPriorities ?? {
        coreInstructions: 'essential',
        reactProcess: 'high',
        toolBestPractices: 'high',
        errorHandling: 'medium',
        outputFormat: 'medium',
        sandboxManagement: 'medium'
      }
    )
  }

  /**
   * 添加自定义模型配置
   */
  addModelConfig(config: ModelSpecificConfig): void {
    // 检查是否已存在
    const existingIndex = this.modelConfigs.findIndex(
      c => c.modelPattern === config.modelPattern
    )

    if (existingIndex >= 0) {
      // 替换现有配置
      this.modelConfigs[existingIndex] = config
      logger.info('更新模型配置', 'main', { pattern: config.modelPattern })
    } else {
      // 插入到默认配置之前
      this.modelConfigs.splice(this.modelConfigs.length - 1, 0, config)
      logger.info('添加模型配置', 'main', { pattern: config.modelPattern })
    }
  }

  /**
   * 移除模型配置
   */
  removeModelConfig(pattern: string): boolean {
    const index = this.modelConfigs.findIndex(c => c.modelPattern === pattern)
    if (index >= 0 && index < this.modelConfigs.length - 1) {
      this.modelConfigs.splice(index, 1)
      logger.info('移除模型配置', 'main', { pattern })
      return true
    }
    return false
  }

  /**
   * 获取所有模型配置
   */
  getAllModelConfigs(): ModelSpecificConfig[] {
    return [...this.modelConfigs]
  }

  /**
   * 获取工具描述风格指南
   */
  private getToolDescriptionStyleGuide(style: 'concise' | 'detailed' | 'minimal'): string {
    const guides: Record<string, string> = {
      concise: `## 工具描述风格（简洁）

- 使用简洁的语言描述工具
- 参数说明控制在 1-2 句话
- 优先使用示例说明用法`,

      detailed: `## 工具描述风格（详细）

- 提供完整的工具描述
- 详细说明每个参数的用途和格式
- 提供多个使用示例
- 说明可能的错误和解决方法`,

      minimal: `## 工具描述风格（极简）

- 仅提供工具名称和一句话描述
- 参数只列出名称和类型
- 不展开说明使用场景`
    }

    return guides[style] || guides.basic
  }
}

// 单例实例
export const modelSpecificOptimizer = new ModelSpecificOptimizer()
