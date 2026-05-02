import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference } from '@main/types/chat'
import { buildReactSystemPrompt, buildKnowledgeEnhancedPrompt } from './prompts/reactSystemPrompt'
import { buildPlanSystemPrompt, buildStepExecutionPrompt } from './prompts/planSystemPrompt'

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

    let prompt = buildReactSystemPrompt({
      modelName: modelConfig.model_name
    })

    // 当存在知识库工具时，追加知识库使用指南
    const hasKnowledgeTools = selectedTools?.some((t) => t.serverName === 'knowledge')
    if (hasKnowledgeTools) {
      prompt += '\n\n' + buildKnowledgeEnhancedPrompt()
    }

    if (this.hasSkillTools(selectedTools)) {
      prompt += '\n\n' + this.buildSkillToolGuide()
    }

    return prompt
  }

  private getBasicSystemPrompt(): string {
    return `你是 Lumina 的论文阅读辅助助手。请围绕用户正在阅读、整理或复现的论文提供准确、清晰、可执行的帮助。

- 使用用户的语言回答，必要时给出结构化步骤、公式解释或代码建议
- 不确定时明确说明不确定性，并指出需要补充的论文段落、数据或实验条件
- 不要臆造论文内容、引用或实验结果`
  }

  /**
   * 构建规划阶段的系统提示词
   */
  buildPlanSystemPrompt(tools: MCPToolReference[] = [], paperContext?: string): string {
    const prompt = buildPlanSystemPrompt(tools, paperContext)
    if (!this.hasSkillTools(tools)) {
      return prompt
    }
    return `${prompt}\n\n${this.buildSkillToolGuide()}`
  }

  /**
   * 构建单步骤执行的上下文注入提示词
   */
  buildStepExecutionPrompt(
    stepTitle: string,
    stepDescription: string,
    previousResults: string[]
  ): string {
    return buildStepExecutionPrompt(stepTitle, stepDescription, previousResults)
  }

  private hasSkillTools(tools?: MCPToolReference[]): boolean {
    return tools?.some((tool) => tool.serverName === 'skill') ?? false
  }

  private buildSkillToolGuide(): string {
    return `# Skill 工具使用指南

- Skill 是用户添加的外部工作说明书；是否需要使用由你根据任务自行判断
- 不确定是否有合适 Skill 时，先调用 skill__list 查看摘要，不要猜测说明书内容
- 只有摘要明显相关时，再调用 skill__read 读取完整 SKILL.md 并按其中流程执行
- 如果任务很简单或没有相关 Skill，直接回答，不要为了使用 Skill 而调用工具`
  }
}

export const promptBuilder = new PromptBuilder()
