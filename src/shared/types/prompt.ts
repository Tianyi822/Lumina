/**
 * 提示词工程相关类型定义
 * 用于前端展示和后端交互
 */

/**
 * 提示词版本信息
 */
export interface PromptVersion {
  /** 版本唯一标识 */
  id: string
  /** 版本号（语义化版本） */
  version: string
  /** 版本标签（如 v1.0.0-stable） */
  tag?: string
  /** 变更摘要 */
  summary: string
  /** 完整提示词内容 */
  content: string
  /** 创建时间 */
  createdAt: string
  /** 创建人 */
  createdBy?: string
  /** 是否为当前激活版本 */
  isActive: boolean
}

/**
 * 提示词版本对比结果
 */
export interface PromptVersionDiff {
  /** 旧版本 */
  oldVersion: PromptVersion
  /** 新版本 */
  newVersion: PromptVersion
  /** 差异内容（行级别） */
  diff: Array<{
    type: 'added' | 'removed' | 'unchanged'
    line: string
    lineNumber: { old?: number; new?: number }
  }>
}

/**
 * 提示词效果指标
 */
export interface PromptEffectivenessMetrics {
  /** 版本号 */
  version: string
  /** 统计时间段 */
  period: { start: string; end: string }
  /** 工具调用成功率（0-1） */
  toolCallSuccessRate: number
  /** 平均每会话工具调用数 */
  avgToolCallsPerSession: number
  /** Token 效率（输出/输入比） */
  tokenEfficiency: number
  /** 平均响应时间（毫秒） */
  avgResponseTime: number
  /** 用户满意度评分（1-5） */
  userSatisfactionScore?: number
  /** 总会话数 */
  totalSessions: number
  /** 总消息数 */
  totalMessages: number
}

/**
 * 提示词效果趋势数据点
 */
export interface MetricsTrendPoint {
  /** 时间点 */
  timestamp: string
  /** 工具调用成功率 */
  toolCallSuccessRate: number
  /** Token 效率 */
  tokenEfficiency: number
  /** 平均响应时间 */
  avgResponseTime: number
  /** 用户满意度 */
  userSatisfactionScore?: number
}

/**
 * Few-shot 示例
 */
export interface FewShotExample {
  /** 示例唯一标识 */
  id: string
  /** 示例名称/标题 */
  name: string
  /** 示例描述 */
  description: string
  /** 示例分类 */
  category: string
  /** 用户输入 */
  userInput: string
  /** AI 思考过程 */
  reasoning: string
  /** AI 响应 */
  assistantResponse: string
  /** 质量评分（0-100） */
  qualityScore: number
  /** 是否启用 */
  enabled: boolean
  /** 创建时间 */
  createdAt: string
  /** 来源（静态/动态提取） */
  source: 'static' | 'dynamic'
}

/**
 * 用户反馈
 */
export interface UserFeedback {
  /** 反馈唯一标识 */
  id: string
  /** 关联的消息 ID */
  messageId: string
  /** 关联的会话 ID */
  sessionId: string
  /** 提示词版本 */
  promptVersion: string
  /** 反馈类型 */
  type: 'thumbs_up' | 'thumbs_down'
  /** 反馈原因 */
  reason?: string
  /** 是否匿名 */
  isAnonymous: boolean
  /** 创建时间 */
  createdAt: string
}

/**
 * A/B 测试配置
 */
export interface ABTestConfig {
  /** 测试唯一标识 */
  id: string
  /** 测试名称 */
  name: string
  /** 测试描述 */
  description?: string
  /** 测试状态 */
  status: 'draft' | 'running' | 'paused' | 'completed'
  /** 版本 A（对照组） */
  versionA: string
  /** 版本 B（实验组） */
  versionB: string
  /** 流量分配比例（0-1，表示 B 组的流量比例） */
  trafficSplit: number
  /** 测试指标 */
  metrics: Array<'success_rate' | 'token_efficiency' | 'response_time' | 'satisfaction'>
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 创建时间 */
  createdAt: string
}

/**
 * A/B 测试结果
 */
export interface ABTestResult {
  /** 测试 ID */
  testId: string
  /** 版本 A 数据 */
  versionA: {
    version: string
    sessions: number
    metrics: PromptEffectivenessMetrics
  }
  /** 版本 B 数据 */
  versionB: {
    version: string
    sessions: number
    metrics: PromptEffectivenessMetrics
  }
  /** 统计显著性（p-value） */
  statisticalSignificance: number
  /** 优胜版本 */
  winner?: 'A' | 'B' | 'tie'
  /** 置信度 */
  confidence: number
}

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
 * 章节优先级配置
 */
export interface PromptSectionPriority {
  /** 章节名称 */
  section: keyof PromptTemplate['sections']
  /** 优先级 */
  priority: 'essential' | 'high' | 'medium' | 'low'
  /** 最少需要的 tokens */
  minTokens: number
  /** 是否可压缩 */
  compressible: boolean
}

/**
 * 模型特定优化配置
 */
export interface ModelSpecificConfig {
  /** 模型名称匹配模式（正则） */
  modelPattern: string
  /** 优化配置 */
  optimizations: {
    /** 适合的示例数量 */
    fewShotCount?: number
    /** 是否强调思维链 */
    emphasisOnCOT?: boolean
    /** 工具描述风格 */
    toolDescriptionStyle?: 'concise' | 'detailed'
    /** 模型特定指令 */
    specialInstructions?: string
  }
}

/**
 * 缓存统计信息
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
