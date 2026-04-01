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
    fewShotCount = 3,
    fewShotExamples = [],
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
    const examplesText = buildFewShotExamplesText(fewShotExamples)
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
// 现在知识库作为工具提供给模型，由模型决定是否调用
export function buildKnowledgeEnhancedPrompt(): string {
  return `# 知识库工具使用指南

你可以使用以下知识库工具来获取相关信息：

## 可用工具

1. **knowledge__search** - 在知识库中搜索相关内容
   - 参数：
     - query: 搜索查询文本（必需）
     - knowledgeBaseId: 知识库ID（可选，不指定则搜索所有可用知识库）
     - limit: 返回结果数量（可选，默认5，最大20）
   - 使用场景：当用户问题需要参考知识库中的特定信息时

2. **knowledge__list** - 获取可用知识库列表
   - 无参数
   - 使用场景：需要了解有哪些知识库可用时

3. **knowledge__documents** - 获取知识库文档列表
   - 参数：
     - knowledgeBaseId: 知识库ID（必需）
   - 使用场景：需要了解知识库中有哪些文档时

## 使用建议

1. **何时搜索知识库**：
   - 用户问题涉及特定领域的专业知识
   - 用户明确要求从知识库中查找信息
   - 你的训练数据可能不够准确或过时
   - 用户提到知识库中可能有的特定内容

2. **何时不需搜索**：
   - 通用常识问题（如问候、闲聊）
   - 你已有足够信心回答的通用问题
   - 编程、数学等通用知识问题
   - 用户没有明确需要知识库信息的意图

3. **最佳实践**：
   - 先理解用户意图，再决定是否搜索
   - 使用精确的搜索查询词以获得更好的结果
   - 基于搜索结果回答时，注明来源
   - 如果搜索结果不相关，告知用户并尝试其他方式回答

## 回答策略

- 首先判断用户问题是否需要知识库信息
- 如需知识库，调用 knowledge__search 工具搜索
- 整合搜索结果形成结构化回答
- 引用来源时格式："根据知识库中的《文档名》..."
- 如果知识库中没有相关信息，明确告知用户
`
}

// PPT 生成增强提示词
// 当用户在生成 PPT 场景中对话时添加到系统提示词中
export function buildPresentationEnhancedPrompt(): string {
  return `# PPT 生成工具使用指南

这些工具只用于 PPT / 幻灯片 / 演示文稿相关任务。
如果用户当前不是在请求制作 PPT、幻灯片或演示文稿，则忽略这些工具，按普通对话处理。

## 可用工具

1. **presentation__generate_ppt**
   - 根据用户描述生成 PPT 大纲
   - 参数：
     - prompt: PPT 主题或用户需求描述（必需）
   - 适用场景：用户要制作 PPT、幻灯片、演示文稿时
   - 此工具会调用云端服务生成大纲，返回 taskId 和 outline 内容

2. **presentation__request_outline_confirmation**
   - 在 PPT 大纲生成完成后，将大纲展示给用户确认或修改
   - 无参数
   - 适用场景：大纲已生成，需要用户确认后才能继续创建 PPT
   - 调用此工具后会暂停等待用户操作

## 使用策略

1. 先判断当前任务是否真的是 PPT 任务：
   - 用户明确要”做 PPT / 写幻灯片 / 准备演示文稿”时，再考虑这些工具
   - 如果只是普通问答、闲聊、写文章、总结文档、代码问题，不要调用这些工具

2. 当用户要求生成 PPT / 幻灯片 / 演示文稿时：
   - 调用 **presentation__generate_ppt** 并传入用户的 PPT 需求描述
   - prompt 参数应包含主题、目标受众、页数期望、风格偏好等信息
   - 等待大纲生成完成

3. 大纲生成完成后：
   - 调用 **presentation__request_outline_confirmation** 让用户确认大纲
   - 用户可以确认使用当前大纲，也可以要求修改

4. 内容质量要求：
   - 大纲结构清晰，包含封面、目录、正文内容、总结等完整结构
   - 每页内容充实，标题简洁有力
   - 根据用户描述的主题提供专业、有价值的内容
   - 考虑 PPT 演示的逻辑流畅性

5. 执行约束：
   - 只有在用户确实在进行 PPT 相关任务时，才调用 PPT 工具
   - 不要在没有用户请求的情况下主动调用 PPT 工具
`
}
