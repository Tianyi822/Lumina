// 提示词配置级别
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

// 提示词构建选项
export interface PromptBuildOptions {
  // 是否包含 few-shot 示例
  includeFewShotExamples?: boolean
  // Few-shot 示例数量 (0-5)
  fewShotCount?: number
  // 是否强调错误处理
  emphasizeErrorHandling?: boolean
  // 工具描述详细程度
  toolDescriptionLevel?: ToolDescriptionLevel
  // 自定义系统提示词 (覆盖默认提示词）
  customSystemPrompt?: string
}

// Few-shot 示例
export interface FewShotExample {
  // 用户查询
  userQuery: string
  // 助手思考过程
  thought: string
  // 使用的工具
  toolCalls?: Array<{
    name: string
    arguments: Record<string, unknown>
    result: string
  }>
  // 最终答案
  finalAnswer: string
}

// 增强的 Few-shot 示例（动态示例系统）
export interface EnhancedFewShotExample extends FewShotExample {
  // 示例唯一标识
  id: string
  // 质量分数 (0-1)
  qualityScore: number
  // 使用次数
  usageCount: number
  // 来源类型
  source: 'static' | 'dynamic'
  // 使用的工具列表
  toolsUsed: string[]
  // 创建时间
  createdAt: string
  // 最后使用时间
  lastUsedAt?: string
  // 成功率 (如果已计算）
  successRate?: number
  // 源会话 ID (动态示例）
  sourceSessionId?: string
}

// 示例选择标准
export interface ExampleSelectionCriteria {
  // 最大示例数量
  maxCount: number
  // 最小质量分数
  minQualityScore: number
  // 必需的工具列表
  requiredTools?: string[]
  // 是否包含静态示例
  includeStatic: boolean
  // 是否包含动态示例
  includeDynamic: boolean
  // 最大静态示例数量
  maxStaticCount?: number
  // 最大动态示例数量
  maxDynamicCount?: number
}

// 示例提取结果
export interface ExampleExtractionResult {
  // 提取的示例
  examples: EnhancedFewShotExample[]
  // 跳过的会话数
  skippedSessions: number
  // 处理的会话数
  processedSessions: number
  // 错误信息
  errors: string[]
}

// ReAct 提示词章节
export interface ReactPromptSections {
  // 核心角色和指令
  coreInstructions: string
  // ReAct 推理流程
  reactProcess: string
  // 错误处理策略
  errorHandling: string
  // 工具使用最佳实践
  toolBestPractices: string
  // 输出格式要求
  outputFormat: string
  // 沙箱管理指南
  sandboxManagement?: string
}
