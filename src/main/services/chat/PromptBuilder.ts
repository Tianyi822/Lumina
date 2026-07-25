import type { MCPToolReference } from '@main/types/chat'
import {
  buildReactSystemPrompt,
  buildKnowledgeEnhancedPrompt,
  buildToolCoordinationGuide
} from './prompts/reactSystemPrompt'
import { buildPlanSystemPrompt, buildStepExecutionPrompt } from './prompts/planSystemPrompt'
import type { ToolPipeline } from './tools/PipelineTypes'

/** 可建议给用户的能力信息 */
export interface SuggestableCapability {
  id: string
  displayName: string
  description: string
}

/** Few-shot 示例中的工具调用描述 */
interface FewShotToolCall {
  name: string
  args: unknown
}

/** Few-shot 示例，用于在系统提示词中演示何时、如何选择工具 */
export interface FewShotExample {
  userQuery: string
  reasoning: string
  toolCalls: FewShotToolCall[]
  answer: string
}

/** Prompt 构建上下文，携带管道信息和可建议能力列表 */
export interface PromptBuildContext {
  pipeline?: ToolPipeline
  suggestableCapabilities?: SuggestableCapability[]
  /** Few-shot 示例，注入到系统提示词末尾，帮助模型理解工具选择时机 */
  fewShotExamples?: FewShotExample[]
}

/**
 * PromptBuilder 只负责选择内置系统提示词。
 * 工具调用能力依赖 OpenAI tools schema，避免通过用户配置堆叠额外提示词。
 */
export class PromptBuilder {
  async buildSystemPrompt(
    hasTools: boolean,
    selectedTools?: MCPToolReference[],
    context: PromptBuildContext = {}
  ): Promise<string> {
    const hasSelectedTools = hasTools || (selectedTools?.length ?? 0) > 0

    // 无工具时返回基础系统提示
    if (!hasSelectedTools) {
      return this.getBasicSystemPrompt()
    }

    // 从内置提示模块构建 React 系统提示（含工具调用指南）
    let prompt = buildReactSystemPrompt()

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

    // 当存在知识库工具时，追加知识库使用指南
    // 多 stage 管道时追加工具协调指南
    if (context.pipeline && context.pipeline.stages.length > 1) {
      prompt += '\n\n' + buildToolCoordinationGuide(context.pipeline.stages)
    }

    // 如果存在可建议的能力，追加能力建议提示让模型能主动推荐
    const suggestableCapabilities = [...(context.suggestableCapabilities ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id)
    )
    if (suggestableCapabilities.length > 0) {
      prompt += '\n\n' + this.buildCapabilitySuggestionPrompt(suggestableCapabilities)
    }

    // Few-shot 示例放在所有现有段之后，帮助模型理解工具选择时机
    if (context.fewShotExamples && context.fewShotExamples.length > 0) {
      prompt += '\n\n' + this.buildFewShotPrompt(context.fewShotExamples)
    }

    return prompt
  }

  /**
   * 构建基础系统提示词（无工具场景）
   */
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

  /**
   * 构建能力建议提示词
   * 当存在可建议但未激活的能力时，生成提示引导模型向用户推荐
   */
  /**
   * 构建能力建议提示词
   * 当存在可建议但未激活的能力时，生成提示引导模型向用户推荐
   */
  buildCapabilitySuggestionPrompt(suggestable: SuggestableCapability[]): string {
    if (suggestable.length === 0) return ''

    const lines = [
      '## 可建议的能力',
      '',
      '以下能力当前未启用，但可用于当前会话。如果用户的问题适合使用这些能力，可以建议用户启用：',
      ''
    ]

    for (const unit of suggestable) {
      lines.push(`- **${unit.displayName}** (\`${unit.id}\`): ${unit.description}`)
    }

    return lines.join('\n')
  }

  /**
   * 构建 Few-shot 示例提示词
   * 通过具体示例展示「思考→工具选择→回答」的决策路径，改善模型的工具选择
   */
  buildFewShotPrompt(examples: FewShotExample[]): string {
    if (examples.length === 0) return ''

    const lines = [
      '## 示例（Few-Shot）',
      '',
      '以下示例展示典型问题应如何思考、选择工具并组织回答。仅作决策参考，不要照搬内容。',
      ''
    ]

    for (const ex of examples) {
      lines.push(`### 用户：${ex.userQuery}`)
      lines.push(`思考：${ex.reasoning}`)
      const toolCallsText =
        ex.toolCalls.length > 0
          ? ex.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', ')
          : '（无需调用工具，直接回答）'
      lines.push(`工具调用：${toolCallsText}`)
      lines.push(`回答：${ex.answer}`)
      lines.push('')
    }

    return lines.join('\n').trimEnd()
  }

  /**
   * 检查工具列表中是否包含论文搜索工具
   */
  private hasPaperWebSearchTools(tools?: MCPToolReference[]): boolean {
    return tools?.some((tool) => tool.serverName === 'paper_web') ?? false
  }

  /**
   * 检查工具列表中是否包含论文上下文检索工具
   */
  private hasPaperContextTools(tools?: MCPToolReference[]): boolean {
    return tools?.some((tool) => tool.serverName === 'paper') ?? false
  }

  /**
   * 构建论文上下文检索工具的使用指南
   */
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
      '- 论文检索结果不足时，应先调整论文检索关键词或说明证据不足；不要自动改用知识库搜索。',
      '- 若联网搜索也开启，先用该工具判断论文内部上下文是否足够；只要问题涉及外部事实、最新进展、项目资源、参考文献追踪或你对外部信息不确定，就应主动调用 `paper_web__search`，无需等待用户明确说“搜索”。'
    ].join('\n')
  }

  /**
   * 构建论文联网搜索工具的使用指南
   */
  private buildPaperWebSearchGuide(): string {
    return [
      '## 论文联网搜索工具 (paper_web__search)',
      '',
      '你拥有 `paper_web__search` 工具，可以搜索学术资料补充论文信息。',
      '',
      '**重要规则：**',
      '- 搜索工具只用于论文阅读相关外部事实补充。',
      '- 搜索开关代表用户授权你主动搜索；当问题明显需要外部事实或验证时，应直接调用搜索工具，无需等待用户明确说“搜索”。',
      '- 搜索前先判断论文上下文是否足够回答问题；如果问题包含最新、最近、进展、对比、引用、开源仓库、官方实现、数据集、基准、相关工作、作者/机构背景等外部线索，默认需要搜索。',
      '- 查询必须围绕论文标题、作者、关键词、引用片段、方法名、数据集名、模型名或参考文献线索构造。',
      '- 不得生成宽泛、娱乐化、商业化或与论文无关的 query。',
      '- 使用搜索结果回答时必须标明哪些信息来自论文（「根据论文」），哪些信息来自联网补充（「根据联网搜索」）。',
      '- 搜索结果质量低时应说明未找到可靠补充资料，不要强行回答。',
      '',
      '**应主动搜索的场景：**',
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
