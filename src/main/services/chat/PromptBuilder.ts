import type { LLMConfig } from '@main/types/config'
import type { MCPToolReference } from '@main/types/chat'
import type { SkillMatchResult } from '@shared/types/skill'
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
    selectedTools?: MCPToolReference[],
    matchedSkills: SkillMatchResult[] = []
  ): Promise<string> {
    const hasSelectedTools = hasTools || (selectedTools?.length ?? 0) > 0

    if (!hasSelectedTools) {
      return this.appendSkillInstructions(this.getBasicSystemPrompt(), matchedSkills)
    }

    let prompt = buildReactSystemPrompt({
      modelName: modelConfig.model_name
    })

    // 当存在知识库工具时，追加知识库使用指南
    const hasKnowledgeTools = selectedTools?.some((t) => t.serverName === 'knowledge')
    if (hasKnowledgeTools) {
      prompt += '\n\n' + buildKnowledgeEnhancedPrompt()
    }

    return this.appendSkillInstructions(prompt, matchedSkills)
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
  buildPlanSystemPrompt(
    tools: MCPToolReference[] = [],
    paperContext?: string,
    matchedSkills: SkillMatchResult[] = []
  ): string {
    return this.appendSkillInstructions(buildPlanSystemPrompt(tools, paperContext), matchedSkills)
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

  buildSkillInstructionsPrompt(matchedSkills: SkillMatchResult[] = []): string {
    return this.formatSkillInstructions(matchedSkills)
  }

  private appendSkillInstructions(prompt: string, matchedSkills: SkillMatchResult[]): string {
    const skillInstructions = this.formatSkillInstructions(matchedSkills)
    if (!skillInstructions) {
      return prompt
    }
    return `${prompt}\n\n${skillInstructions}`
  }

  private formatSkillInstructions(matchedSkills: SkillMatchResult[]): string {
    if (matchedSkills.length === 0) {
      return ''
    }

    const sections = matchedSkills.map((skill, index) => {
      const reasons = skill.reasons.length > 0 ? `\n匹配原因：${skill.reasons.join('；')}` : ''
      return `## Skill ${index + 1}: ${skill.name}\n\n${skill.instructions}${reasons}`
    })

    return `# 自动匹配的 Skill 指令\n\n以下 Skill 来自用户添加的外部目录。它们只是任务指导文本，不代表可执行工具；如需调用工具，仍必须使用当前可用的 MCP、知识库或实验室工具。\n\n${sections.join('\n\n')}`
  }
}

export const promptBuilder = new PromptBuilder()
