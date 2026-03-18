/**
 * 提示词工程相关类型定义
 * 用于前端展示和后端交互
 */

/**
 * 提示词模板
 */
export interface PromptTemplate {
  /** 版本号 */
  version: string
  /** 模板章节 */
  sections: {
    coreInstructions: string
    reactProcess: string
    errorHandling: string
    toolBestPractices: string
    outputFormat: string
    sandboxManagement?: string
  }
  /** 模板变量 */
  variables: Record<string, string>
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 缓存级别统计
 */
export interface CacheLevelStats {
  /** 当前缓存大小 */
  size: number
  /** 最大缓存大小 */
  maxSize: number
  /** 命中次数 */
  hits: number
  /** 未命中次数 */
  misses: number
  /** 命中率 (0-1) */
  hitRate: number
  /** 过期条目数 */
  expired: number
  /** 驱逐条目数 */
  evicted: number
  /** 内存使用估算（字节） */
  memoryUsage: number
}

/**
 * 全局缓存统计
 */
export interface GlobalCacheStats {
  /** 总命中次数 */
  totalHits: number
  /** 总未命中次数 */
  totalMisses: number
  /** 总命中率 (0-1) */
  totalHitRate: number
  /** 总缓存大小 */
  totalSize: number
  /** 总内存使用（字节） */
  totalMemoryUsage: number
  /** 缓存性能评分 (0-100) */
  performanceScore: number
}

/**
 * 缓存统计更新事件数据
 */
export interface CacheStatsUpdatedEvent {
  /** 时间戳 */
  timestamp: number
  /** 系统提示词缓存统计 */
  systemPrompt: CacheLevelStats
  /** 工具描述缓存统计 */
  toolDescription: CacheLevelStats
  /** 示例格式化缓存统计 */
  exampleFormatting: CacheLevelStats
  /** 全局统计 */
  global: GlobalCacheStats
}

/**
 * 缓存性能警告事件数据
 */
export interface CachePerformanceWarningEvent {
  /** 时间戳 */
  timestamp: number
  /** 当前性能评分 */
  score: number
  /** 警告阈值 */
  threshold: number
}

/**
 * 缓存统计信息（向后兼容）
 */
export interface PromptCacheStats {
  /** 缓存命中率 */
  hitRate: number
  /** 总请求数 */
  totalRequests: number
  /** 命中次数 */
  hitCount: number
  /** 未命中次数 */
  missCount: number
  /** 当前缓存条目数 */
  currentSize: number
  /** 最大缓存条目数 */
  maxSize: number
  /** 缓存过期时间（小时） */
  ttlHours: number
}

/**
 * 模板标准变量接口
 * 用于模板变量替换
 */
export interface TemplateVariables {
  /** Few-shot 示例内容 */
  fewShotExamples: string
  /** 工具描述 */
  toolDescriptions: string
  /** 知识库上下文 */
  knowledgeContext: string
  /** 当前日期时间 */
  currentDateTime: string
  /** 用户语言 */
  userLanguage: string
  /** 自定义指令 */
  customInstructions: string
  /** 会话上下文 */
  sessionContext: string
  /** 模型名称 */
  modelName: string
}

/**
 * 模板变量替换选项
 */
export interface TemplateVariableOptions {
  /** 是否保留未替换的变量占位符 */
  keepUnresolvedPlaceholders?: boolean
  /** 变量值的最大长度 */
  maxVariableLength?: number
  /** 截断后缀 */
  truncateSuffix?: string
}

// ==================== 提示词工程增强相关类型 ====================

/**
 * Few-shot 示例工具调用
 */
export interface FewShotToolCall {
  /** 工具名称 */
  name: string
  /** 工具参数 */
  arguments: Record<string, unknown>
  /** 工具执行结果 */
  result: string
}

/**
 * 增强的 Few-shot 示例
 * 包含完整的示例信息和元数据
 */
export interface EnhancedFewShotExample {
  /** 示例唯一标识 */
  id: string
  /** 用户查询 */
  userQuery: string
  /** 思考过程 */
  thought: string
  /** 工具调用列表 */
  toolCalls?: FewShotToolCall[]
  /** 最终答案 */
  finalAnswer: string
  /** 质量分数 (0-1) */
  qualityScore: number
  /** 使用次数 */
  usageCount: number
  /** 来源 */
  source: 'dynamic'
  /** 使用的工具列表 */
  toolsUsed: string[]
  /** 创建时间（ISO 8601 格式） */
  createdAt: string
  /** 最后使用时间（ISO 8601 格式，可选） */
  lastUsedAt?: string
  /** 来源会话 ID（可选） */
  sourceSessionId?: string
  /** 成功率（可选） */
  successRate?: number
}

/**
 * 示例统计信息
 * 用于展示 Few-shot 示例的整体统计数据
 */
export interface ExampleStats {
  /** 总示例数量 */
  total: number
  /** 动态示例数量 */
  dynamic: number
  /** 平均质量分数 (0-1) */
  avgQualityScore: number
  /** 最后更新时间（ISO 8601 格式） */
  lastUpdated: string
  /** UI 加载状态（可选） */
  loading?: boolean
  /** 加载错误信息（可选） */
  error?: string
  /** 低质量示例数量（质量分数低于 0.5，可选） */
  lowQualityCount?: number
  /** 未被使用的示例数量（可选） */
  unusedCount?: number
}

/**
 * 示例筛选条件
 * 用于查询和过滤 Few-shot 示例
 */
export interface ExampleFilter {
  /** 最低质量分数阈值（0-1），默认 0 */
  minQualityScore?: number
  /** 按使用过的工具筛选（单选，可选） */
  toolName?: string
  /** 按使用过的工具筛选（多选，可选） */
  toolNames?: string[]
  /** 搜索查询（匹配用户查询和最终答案），默认空字符串 */
  searchQuery?: string
  /** 时间范围筛选（可选） */
  dateRange?: {
    /** 开始时间（ISO 8601 格式） */
    start: string
    /** 结束时间（ISO 8601 格式） */
    end: string
  }
  /** 排序维度（可选） */
  sortBy?: 'quality' | 'usage' | 'date'
  /** 排序方向（可选） */
  sortOrder?: 'asc' | 'desc'
}

/**
 * 提示词变量类型
 * 用于动态变量管理
 */
export type PromptVariableType = 'system' | 'custom'

/**
 * 提示词变量值类型
 * 用于 UI 表单验证和展示
 */
export type PromptVariableValueType = 'string' | 'number' | 'json' | 'array'

/**
 * 提示词变量分类
 * 用于 UI 分组展示
 */
export type PromptVariableCategory = 'user' | 'context' | 'system' | 'custom' | 'advanced'

/**
 * 提示词变量定义
 * 表示可在提示词中使用的动态变量
 */
export interface PromptVariable {
  /** 变量名（不含花括号，如 "user_name" 对应 {{user_name}}） */
  name: string
  /** 变量描述 */
  description: string
  /** 默认值 */
  defaultValue?: string
  /** 变量类型：系统预置或用户自定义 */
  type: PromptVariableType
  /** 求值规则说明（用于系统变量） */
  evalRule?: string
  /** 变量分类（可选） */
  category?: PromptVariableCategory
  /** 是否必填（可选） */
  required?: boolean
  /** 是否允许编辑值（可选） */
  editable?: boolean
  /** 值类型（可选） */
  valueType?: PromptVariableValueType
  /** 验证规则（可选） */
  validation?: {
    /** 正则表达式模式 */
    pattern?: string
    /** 最小值/长度 */
    min?: number
    /** 最大值/长度 */
    max?: number
    /** 枚举值列表 */
    enum?: string[]
  }
  /** 示例值列表（可选） */
  examples?: string[]
  /** 是否已废弃（可选） */
  deprecated?: boolean
  /** 别名列表（可选） */
  alias?: string[]
}

/**
 * Token 使用统计
 * 用于测试沙盘的 Token 消耗统计
 */
export interface TokenUsageInfo {
  /** 输入 Token 数量 */
  prompt: number
  /** 输出 Token 数量 */
  completion: number
  /** 总 Token 数量 */
  total: number
  /** 估算成本（元，可选） */
  estimatedCost?: number
}

/**
 * 测试沙盘请求载荷
 * 用于提示词测试沙盘功能的请求参数
 */
export interface TestPromptPayload {
  /** 用户查询内容（必填） */
  userQuery: string
  /** 动态变量值映射（变量名 -> 值，可选） */
  variables?: Record<string, string>
  /** 是否包含 Few-shot 示例，默认 true */
  includeExamples?: boolean
  /** 包含的示例数量（0-5，默认 3，当 includeExamples 为 true 时） */
  exampleCount?: number
  /** 临时覆盖温度参数（0-1，可选） */
  temperature?: number
  /** 临时选择测试模型（可选） */
  selectedModel?: string
  /** 是否启用知识库检索（可选） */
  enableKnowledge?: boolean
  /** 选中的知识库 ID 列表（可选） */
  knowledgeBaseIds?: string[]
}

/**
 * 测试沙盘响应结果
 * 提示词测试沙盘的返回数据
 */
export interface TestPromptResult {
  /** 测试是否成功 */
  success: boolean
  /** 组装后的完整提示词（成功时） */
  assembledPrompt?: string
  /** 模型响应内容（成功时） */
  response?: string
  /** 错误信息（失败时） */
  error?: string
  /** Token 使用统计 */
  tokenUsage?: TokenUsageInfo
  /** 响应耗时（毫秒，可选） */
  duration?: number
  /** 是否为流式响应（可选） */
  streaming?: boolean
  /** 实际使用的模型（可选） */
  modelUsed?: string
  /** 响应时间戳（ISO 8601 格式，可选） */
  timestamp?: string
  /** 警告信息列表（可选） */
  warnings?: string[]
}

/**
 * 示例导入导出结果
 * 用于批量导入/导出 Few-shot 示例
 */
export interface ImportResult {
  /** 操作是否成功 */
  success: boolean
  /** 成功导入的示例数量 */
  imported: number
  /** 跳过的示例数量（如重复） */
  skipped: number
  /** 错误信息列表 */
  errors: string[]
  /** 警告信息列表（可选） */
  warnings?: string[]
  /** 导入的示例 ID 列表（可选） */
  importedIds?: string[]
  /** 结果摘要文本（可选） */
  summary?: string
  /** 详细条目信息（可选） */
  details?: Array<{
    /** 条目 ID */
    id: string
    /** 条目状态 */
    status: 'success' | 'skipped' | 'error'
    /** 状态消息 */
    message?: string
  }>
}
