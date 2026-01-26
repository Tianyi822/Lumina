/**
 * 提示词配置级别
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 提示词构建选项
 */
export interface PromptBuildOptions {
  /** 是否包含 few-shot 示例 */
  includeFewShotExamples?: boolean
  /** Few-shot 示例数量 (0-5) */
  fewShotCount?: number
  /** 是否强调错误处理 */
  emphasizeErrorHandling?: boolean
  /** 工具描述详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** 自定义系统提示词 (覆盖默认提示词) */
  customSystemPrompt?: string
}

/**
 * Few-shot 示例
 */
export interface FewShotExample {
  /** 用户查询 */
  userQuery: string
  /** 助手思考过程 */
  thought: string
  /** 使用的工具 */
  toolCalls?: Array<{
    name: string
    arguments: Record<string, unknown>
    result: string
  }>
  /** 最终答案 */
  finalAnswer: string
}

/**
 * ReAct 提示词章节
 */
export interface ReactPromptSections {
  /** 核心角色和指令 */
  coreInstructions: string
  /** ReAct 推理流程 */
  reactProcess: string
  /** 错误处理策略 */
  errorHandling: string
  /** 工具使用最佳实践 */
  toolBestPractices: string
  /** 输出格式要求 */
  outputFormat: string
}
