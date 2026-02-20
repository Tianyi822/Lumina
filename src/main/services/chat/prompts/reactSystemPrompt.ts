import type { PromptBuildOptions, ReactPromptSections } from './types'
import type { TemplateVariables } from '@shared/types/prompt'
import { getFewShotExamples, formatFewShotExample } from './toolExamples'
import { promptTemplateManager } from './PromptTemplateManager'

// 获取提示词章节配置（优先从模板管理器获取）
function getPromptSections(): ReactPromptSections {
  return promptTemplateManager.getTemplate().sections
}

/**
 * 构建 Few-shot 示例文本
 */
function buildFewShotExamplesText(count: number): string {
  const examples = getFewShotExamples(count)
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
  if (options.includeFewShotExamples && options.fewShotCount && options.fewShotCount > 0) {
    variables.fewShotExamples = buildFewShotExamplesText(options.fewShotCount)
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
    fewShotCount = 3,
    emphasizeErrorHandling = false,
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
      !customSystemPrompt.includes('{{fewShotExamples}}')
    ) {
      prompt += '\n\n# 示例\n\n以下是使用工具的示例：\n\n'
      prompt += buildFewShotExamplesText(fewShotCount)
    }

    return prompt.trim()
  }

  // 获取提示词章节（从模板管理器）
  let sections = getPromptSections()

  // 应用变量替换到各个章节
  sections = promptTemplateManager.applyVariablesToSections(sections, variables)

  // 构建标准提示词
  let prompt = ''

  // 添加各个章节
  prompt += sections.coreInstructions + '\n\n'
  prompt += sections.reactProcess + '\n\n'
  prompt += sections.toolBestPractices + '\n\n'
  prompt += sections.outputFormat

  // 根据配置决定是否强调错误处理
  if (emphasizeErrorHandling) {
    prompt += '\n\n' + sections.errorHandling
  }

  // 添加沙箱管理指南
  if (sections.sandboxManagement) {
    prompt += '\n\n' + sections.sandboxManagement
  }

  // 添加 few-shot 示例（如果模板中没有通过变量注入）
  if (includeFewShotExamples && fewShotCount > 0) {
    const examplesText = buildFewShotExamplesText(fewShotCount)
    if (examplesText) {
      prompt +=
        '\n\n# 示例\n\n以下是使用工具的示例，参考这些模式来回答用户问题：\n\n' + examplesText
    }
  }

  // 添加最终提醒
  const reminders = [
    '仔细思考后再行动，不要盲目调用工具',
    '如果不需要使用工具就能回答问题，直接给出答案',
    '始终以清晰、有用的方式回应用户',
    '工具名称格式为 `serverName__toolName`'
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
    fewShotCount: 3,
    emphasizeErrorHandling: true
  })
}

// 知识库增强提示词
// 当用户选中了知识库时添加到系统提示词中
export function buildKnowledgeEnhancedPrompt(): string {
  return `# 知识库使用指南

 当用户提问时，系统会自动从选中的知识库中检索相关信息，并将这些信息附加到用户消息中。

 ## 如何使用知识库信息

 1. **优先考虑知识库内容**
     - 知识库中的信息是经过验证的权威资料
     - 回答问题时优先基于知识库内容
     - 如果知识库中有直接相关的信息，优先使用

 2. **引用来源**
     - 当使用知识库中的信息时，请提及来源文档
     - 格式："根据《文档名》中的内容..."
     - 这有助于用户了解信息的可靠性

 3. **处理信息冲突**
     - 如果知识库中的信息与你的训练数据冲突，优先使用知识库信息
     - 如果不同文档中的信息冲突，指出冲突并说明你的判断依据

 4. **信息不足时的处理**
     - 如果知识库中没有相关信息，明确告知用户
     - 可以基于你的训练数据提供补充信息，但要说明这不是来自知识库
     - 建议用户上传更多相关文档到知识库

 5. **相关性判断**
     - 每段知识库内容都附有相似度分数
     - 相似度低于 0.5 的内容相关性较低，需谨慎使用
     - 综合考虑多段相关内容，形成完整回答

 ## 回答策略

 - 首先理解用户问题的核心意图
 - 查看知识库中提供的相关内容
 - 整合相关信息形成结构化回答
 - 如果合适，提供进一步的问题或建议
 - 保持客观、准确、有用的回答风格
 `
}
