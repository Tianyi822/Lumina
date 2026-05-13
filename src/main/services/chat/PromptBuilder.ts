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

    if (this.hasPaperContextTools(selectedTools)) {
      prompt += '\n\n' + this.buildPaperContextGuide()
    }

    // 当 paper_web 搜索工具可用时，添加论文搜索行为指南
    if (this.hasPaperWebSearchTools(selectedTools)) {
      prompt += '\n\n' + this.buildPaperWebSearchGuide()
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
    return buildPlanSystemPrompt(tools, paperContext)
  }

  /**
   * 构建单步骤执行的上下文注入提示词
   */
  buildStepExecutionPrompt(
    stepTitle: string,
    stepDescription: string,
    previousResults: string[],
    previousFailure?: string
  ): string {
    return buildStepExecutionPrompt(stepTitle, stepDescription, previousResults, previousFailure)
  }

  private hasPaperWebSearchTools(tools?: MCPToolReference[]): boolean {
    return tools?.some((tool) => tool.serverName === 'paper_web') ?? false
  }

  private hasPaperContextTools(tools?: MCPToolReference[]): boolean {
    return tools?.some((tool) => tool.serverName === 'paper') ?? false
  }

  private buildPaperContextGuide(): string {
    return [
      '## 论文内容检索工具 (paper__search_context)',
      '',
      '你拥有 `paper__search_context` 工具，可以按需检索当前论文 OCR/解析后的原文与译文文本。',
      '',
      '**重要规则：**',
      '- 回答当前论文内容、解释选中文本、总结局部段落或定位证据前，必须先调用该工具获取相关句子。',
      '- 不要假设整篇论文已经在上下文中；最终回答只能基于用户消息、附件和工具返回的关键上下文。',
      '- 用户提供选中文本时，把选中文本原样放入 `selectedText`，并根据来源选择 `source`；不确定来源时用 `both`。',
      '- 用户未选择文本时，把用户问题放入 `query`，用 `source: "both"` 检索原文和译文。',
      '- 工具会自动做句子级匹配、关键词递归和阅读进度兜底，不要要求用户再手动提供全文。',
      '- 工具返回 warning 或匹配不足时，应说明上下文不足，避免编造论文结论。',
      '- 若联网搜索也开启，先用该工具判断论文内部上下文是否足够；只有需要外部事实补充时才调用 `paper_web__search`。'
    ].join('\n')
  }

  private buildPaperWebSearchGuide(): string {
    return [
      '## 论文联网搜索工具 (paper_web__search)',
      '',
      '你拥有 `paper_web__search` 工具，可以搜索学术资料补充论文信息。',
      '',
      '**重要规则：**',
      '- 搜索工具只用于论文阅读相关外部事实补充。',
      '- 搜索开关代表用户授权，不代表你必须搜索。',
      '- 搜索前必须先判断论文上下文是否足够回答问题。',
      '- 查询必须围绕论文标题、作者、关键词、引用片段、方法名、数据集名、模型名或参考文献线索构造。',
      '- 不得生成宽泛、娱乐化、商业化或与论文无关的 query。',
      '- 使用搜索结果回答时必须标明哪些信息来自论文（「根据论文」），哪些信息来自联网补充（「根据联网搜索」）。',
      '- 搜索结果质量低时应说明未找到可靠补充资料，不要强行回答。',
      '',
      '**允许搜索的场景：**',
      '- 用户询问论文中提到的外部工作、数据集、方法的最新信息',
      '- 用户要求对比当前论文与最新研究进展',
      '- 用户询问论文参考文献之外的补充资料',
      '- 用户要求查找官方项目仓库、官方文档、基准榜单等外部事实',
      '- 你判断如果不验证外部事实容易产生幻觉',
      '',
      '**不应该搜索的场景：**',
      '- 用户只是要求解释当前选中的论文内容',
      '- 用户要求总结、翻译、改写论文片段',
      '- 用户询问论文中已经明确给出的实验结果、定义、方法流程或结论',
      '- 普通上下文推理可以完成的问题'
    ].join('\n')
  }
}

export const promptBuilder = new PromptBuilder()
