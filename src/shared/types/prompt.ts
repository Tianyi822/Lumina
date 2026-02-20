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
