import type { FewShotExample, PromptBuildOptions, ReactPromptSections } from './types'
import type { TemplateVariables } from '@shared/types/prompt'
import { formatFewShotExample } from './toolExamples'
import { promptTemplateManager } from './PromptTemplateManager'

// 获取提示词章节配置（优先从模板管理器获取）
function getPromptSections(): ReactPromptSections {
  return promptTemplateManager.getTemplate().sections
}

/**
 * 构建 Few-shot 示例文本
 */
function buildFewShotExamplesText(examples: FewShotExample[]): string {
  if (examples.length === 0) return ''

  let text = ''
  examples.forEach((example, index) => {
    text += `## 示例 ${index + 1}\n\n`
    text += formatFewShotExample(example)
    text += '\n---\n\n'
  })
  return text.trim()
}

/**
 * 构建模板变量
 */
function buildTemplateVariables(options: PromptBuildOptions): Partial<TemplateVariables> {
  const variables: Partial<TemplateVariables> = {}

  // 构建 Few-shot 示例
  if (
    options.includeFewShotExamples &&
    options.fewShotExamples &&
    options.fewShotExamples.length > 0
  ) {
    variables.fewShotExamples = buildFewShotExamplesText(options.fewShotExamples)
  }

  // 添加当前日期时间
  variables.currentDateTime = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long'
  })

  // 添加用户语言
  variables.userLanguage = 'zh-CN'

  return variables
}

// 构建 ReAct 系统提示词
export function buildReactSystemPrompt(options: PromptBuildOptions = {}): string {
  const {
    includeFewShotExamples = true,
    fewShotCount = 0,
    fewShotExamples = [],
    customSystemPrompt,
    toolDescriptionLevel = 'detailed',
    knowledgeContext,
    modelName
  } = options

  // 构建模板变量
  const variables = buildTemplateVariables(options)

  // 添加知识库上下文
  if (knowledgeContext) {
    variables.knowledgeContext = knowledgeContext
  }

  // 添加模型名称
  if (modelName) {
    variables.modelName = modelName
  }

  // 如果提供了自定义提示词，使用模板变量替换
  if (customSystemPrompt) {
    let prompt = promptTemplateManager.replaceTemplateVariables(customSystemPrompt, variables)

    // 如果模板中没有 few-shot 示例变量但仍需要添加
    if (
      includeFewShotExamples &&
      fewShotCount > 0 &&
      fewShotExamples.length > 0 &&
      !customSystemPrompt.includes('{{fewShotExamples}}')
    ) {
      prompt += '\n\n# 示例\n\n以下是使用工具的示例：\n\n'
      prompt += buildFewShotExamplesText(fewShotExamples)
    }

    return prompt.trim()
  }

  // 获取提示词章节（从模板管理器）
  let sections = getPromptSections()

  // 应用变量替换到各个章节
  sections = promptTemplateManager.applyVariablesToSections(sections, variables)

  // 构建标准提示词（只组装保留的 3 个 section）
  let prompt = ''

  prompt += sections.coreInstructions + '\n\n'
  prompt += sections.outputFormat

  // 添加沙箱管理指南（业务特有流程）
  if (sections.sandboxManagement) {
    prompt += '\n\n' + sections.sandboxManagement
  }

  // 添加 few-shot 示例（如果模板中没有通过变量注入）
  if (includeFewShotExamples && fewShotCount > 0) {
    const examplesText = buildFewShotExamplesText(fewShotExamples)
    if (examplesText) {
      prompt +=
        '\n\n# 示例\n\n以下是使用工具的示例，参考这些模式来回答用户问题：\n\n' + examplesText
    }
  }

  // 添加最终提醒
  const reminders = [
    '先思考再行动，不需要工具时直接回答',
    '不要过早要求用户交互，能用合理默认值推进时先推进',
    '只有缺少不可推断的关键决策时才调用 `sandbox__ask_user`'
  ]

  // 根据工具描述级别添加额外提醒
  if (toolDescriptionLevel === 'minimal') {
    reminders.push('当前使用简化版工具描述，如需详细信息请询问用户')
  }

  prompt += `

# 重要提醒

${reminders.map((r) => `- ${r}`).join('\n')}

当前时间: ${variables.currentDateTime || new Date().toLocaleString('zh-CN')}

现在，请根据用户的问题开始你的工作。`

  return prompt.trim()
}

// 获取默认的 ReAct 系统提示词
export function getDefaultReactPrompt(): string {
  return buildReactSystemPrompt({
    includeFewShotExamples: true,
    fewShotCount: 0
  })
}
