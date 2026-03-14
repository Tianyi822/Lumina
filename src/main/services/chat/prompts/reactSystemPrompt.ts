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

// PPT 模板增强提示词
// 当用户在生成 PPT 场景中对话时添加到系统提示词中
export function buildPresentationEnhancedPrompt(): string {
  return `# PPT 模板工具使用指南

这些工具只用于 PPT / 幻灯片 / 演示文稿相关任务。
如果用户当前不是在请求制作 PPT、选择模板、分析模板或规划演示文稿内容，则忽略这些工具，按普通对话处理。

## 可用工具

1. **presentation__list_templates**
   - 查看当前有哪些已完成解析的 PPT 模板可用
   - 适用场景：用户问“有哪些模板”、想比较模板，或你需要先了解可选模板范围

2. **presentation__request_template_selection**
   - 让用户直接从现有模板中做选择
   - 适用场景：用户要生成 PPT，但还没有明确选定模板时
   - 如果当前没有可用模板，此工具会返回“请先上传模板”的提示，而不是空选项

3. **presentation__get_template_analysis**
   - 读取指定模板的结构分析结果
   - 参数：
     - templateId: 模板 ID（必需）
     - detailLevel: summary 或 full（可选，默认 summary）
   - 适用场景：用户选定模板后，你需要根据模板结构规划 PPT 内容

## 使用策略

1. 先判断当前任务是否真的是 PPT 任务：
   - 用户明确要“做 PPT / 写幻灯片 / 准备演示文稿 / 选模板 / 分析模板”时，再考虑这些工具
   - 如果只是普通问答、闲聊、写文章、总结文档、代码问题，不要调用这些工具

2. 当用户要求生成 PPT / 幻灯片 / 演示文稿且还没有明确模板时：
   - 优先调用 **presentation__request_template_selection**
   - 在用户完成模板选择前，不要直接输出大纲、页数规划或正文内容
   - 不要直接假设模板

3. 当用户已经选定模板，或历史对话里出现了类似：
   - “我选择了 PPT 模板「...」（templateId: ...）”
   - 这时优先调用 **presentation__get_template_analysis** 读取结构摘要，再继续规划内容

4. 当用户想先看看有哪些模板，但还不确定选哪个时：
   - 先调用 **presentation__list_templates**
   - 如果用户接下来需要你推动选择，再调用 **presentation__request_template_selection**

5. 当没有模板可用时：
   - 明确告诉用户先去设置页上传 PPT 模板
   - 不要编造模板结构

6. 回答时重点关注：
   - 页面数量、标题页/目录页/内容页等结构
   - 每页的文本摘要、布局名称、常见占位符类型
   - 模板是否适合当前用户要表达的内容

7. 执行约束：
   - 只有在用户确实在进行 PPT 相关任务时，才调用 PPT 工具
   - 一旦已经判断当前任务是 PPT 生成且会话还没有选定模板，就先让用户选模板
   - 除非工具明确告知“当前没有可用模板”，否则不要跳过模板选择步骤

## PPT 规划输出契约

当用户是在为“后续导出 PPT”准备内容，尤其是已经选定模板、分析模板或要求你生成分页规划时，你的最终回复必须被下游程序稳定解析，因此必须严格遵守以下规则：

1. 最终回复只输出 PPT 规划正文，不要输出任何寒暄、解释、总结、确认语或额外提问。
2. 禁止出现以下类型的句子：
   - “好的，我已经分析了……”
   - “现在我来为您规划……”
   - “请问您是否满意……”
   - “如果需要调整……”
   - “确认后我将开始……”
3. 不要使用代码块、引用块、Markdown 分隔线，也不要给页码行加 \`#\`、\`##\`、\`###\` 等标题标记。
4. 每个页面或页段必须以单独一行的页码标记开头，且格式只能是：
   - \`第1页 - 标题\`
   - \`第2-3页 - 标题\`
5. 页码标记下面只写该页内容，每行一条；不要把所有页面写成一整段长文。
6. 如果模板总页数已知，页码覆盖总数必须与模板页数完全一致，不能多页，也不能少页。
7. 优先使用 1-based 页码，与模板显示页数保持一致；不要写“第0页”这类编号，除非用户明确要求。
8. 封面、目录、总结、结束页都必须显式纳入页码规划，不能放在页码规划之外单独说明。
9. 输出中不要描述你的推理过程、工具调用过程、模板分析过程，只保留最终分页结果。

## 推荐输出示例

\`第1页 - 封面\`
\`标题：EM-Net: Efficient 3D Medical Image Segmentation with Mamba\`
\`副标题：高效 3D 医学图像分割框架\`
\`汇报人：XXX\`

\`第2页 - 目录\`
\`研究背景与动机\`
\`核心方法\`
\`实验结果\`

\`第3-4页 - 研究背景\`
\`医学图像分割的重要性\`
\`现有方法的主要挑战\`
\`Transformer 与 Mamba 的应用现状\`

如果你不能在一次回复中满足以上格式要求，就先停下来重新组织输出，而不是输出近似格式。
`
}
