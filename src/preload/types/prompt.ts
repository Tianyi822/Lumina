import type { ConfigSaveResult } from './config'

/**
 * 工具描述的详细程度
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 提示词生成的配置
 */
export interface PromptConfig {
  /** 是否启用增强版提示词 */
  enableEnhancedPrompt?: boolean
  /** 工具描述的详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** Few-shot 示例的数量，范围 0 到 5 */
  fewShotCount?: number
  /** 自定义系统提示词，会覆盖默认生成的提示词 */
  customSystemPrompt?: string
}

/**
 * 缓存级别统计
 */
export interface CacheLevelStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: number
  expired: number
  evicted: number
  memoryUsage: number
}

/**
 * 全局缓存统计
 */
export interface GlobalCacheStats {
  totalHits: number
  totalMisses: number
  totalHitRate: number
  totalSize: number
  totalMemoryUsage: number
  performanceScore: number
}

/**
 * 缓存统计更新事件数据
 */
export interface CacheStatsUpdatedEvent {
  timestamp: number
  systemPrompt: CacheLevelStats
  toolDescription: CacheLevelStats
  exampleFormatting: CacheLevelStats
  global: GlobalCacheStats
}

/**
 * 缓存性能警告事件数据
 */
export interface CachePerformanceWarningEvent {
  timestamp: number
  score: number
  threshold: number
}

/**
 * 提示词配置相关的 API
 */
export interface PromptApi {
  getConfig: () => Promise<PromptConfig | undefined>
  updateConfig: (config: PromptConfig) => Promise<ConfigSaveResult>
  resetConfig: () => Promise<{ success: boolean; config?: PromptConfig; error?: string }>
  // 缓存监控
  subscribeCacheStats: () => Promise<{ success: boolean }>
  unsubscribeCacheStats: () => Promise<{ success: boolean }>
  onCacheStatsUpdated: (callback: (stats: CacheStatsUpdatedEvent) => void) => () => void
  onCachePerformanceWarning: (callback: (data: CachePerformanceWarningEvent) => void) => () => void
}
