import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference } from '@main/types/chat'
import { buildReactSystemPrompt } from './prompts/reactSystemPrompt'

/**
 * PromptBuilder 只负责选择内置系统提示词。
 * 工具调用能力依赖 OpenAI tools schema，避免通过用户配置堆叠额外提示词。
 */
export class PromptBuilder {
  async buildSystemPrompt(
    modelConfig: LLMConfig,
    hasTools: boolean,
    selectedTools?: MCPToolReference[]
  ): Promise<string> {
    const hasSelectedTools = hasTools || (selectedTools?.length ?? 0) > 0

    if (!hasSelectedTools) {
      return this.getBasicSystemPrompt()
    }

    return buildReactSystemPrompt({
      modelName: modelConfig.model_name
    })
  }

  private getBasicSystemPrompt(): string {
    return `你是 Lumina 的论文阅读辅助助手。请围绕用户正在阅读、整理或复现的论文提供准确、清晰、可执行的帮助。

- 使用用户的语言回答，必要时给出结构化步骤、公式解释或代码建议
- 不确定时明确说明不确定性，并指出需要补充的论文段落、数据或实验条件
- 不要臆造论文内容、引用或实验结果`
  }
}

export const promptBuilder = new PromptBuilder()
