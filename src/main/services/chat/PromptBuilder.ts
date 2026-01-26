import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference } from '@main/types/chat'
import type { PromptBuildOptions, ToolDescriptionLevel } from './prompts/types'
import { buildReactSystemPrompt } from './prompts/reactSystemPrompt'

/**
 * 配置接口（从 ConfigManager 获取）
 */
interface PromptConfig {
  enableEnhancedPrompt?: boolean
  toolDescriptionLevel?: ToolDescriptionLevel
  fewShotCount?: number
  customSystemPrompt?: string
}

/**
 * PromptBuilder 服务
 * 负责根据配置构建系统提示词
 */
export class PromptBuilder {
  private promptConfig: PromptConfig | null = null

  /**
   * 更新提示词配置
   */
  updatePromptConfig(config: PromptConfig | null): void {
    this.promptConfig = config
  }

  /**
   * 构建系统提示词
   * @param modelConfig LLM 配置
   * @param hasTools 是否有工具可用
   * @param selectedTools 选中的工具列表（可选）
   * @returns 构建好的系统提示词
   */
  buildSystemPrompt(
    modelConfig: LLMConfig,
    hasTools: boolean,
    selectedTools?: MCPToolReference[]
  ): string {
    // 如果没有工具，使用简单提示词
    if (!hasTools) {
      return this.getBasicSystemPrompt()
    }

    // 获取构建选项
    const options = this.buildOptions(modelConfig, selectedTools)

    // 构建 ReAct 提示词
    return buildReactSystemPrompt(options)
  }

  /**
   * 构建提示词选项
   */
  private buildOptions(modelConfig: LLMConfig, _selectedTools?: MCPToolReference[]): PromptBuildOptions {
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
      }
    }

    // 根据模型名称调整
    const modelName = modelConfig.model_name.toLowerCase()
    if (modelName.includes('deepseek')) {
      // DeepSeek 模型通常需要更少的示例
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
