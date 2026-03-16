import type { CacheStatsUpdatedEvent, CachePerformanceWarningEvent } from './prompt'

/**
 * 提示词模板
 */
export interface PromptTemplate {
  version: string
  sections: {
    coreInstructions: string
    reactProcess: string
    errorHandling: string
    toolBestPractices: string
    outputFormat: string
    sandboxManagement?: string
  }
  variables: Record<string, string>
  updatedAt: string
}

/**
 * 提示词模板 API
 */
export interface PromptTemplateApi {
  getTemplate: () => Promise<PromptTemplate>
  updateTemplate: (template: Partial<PromptTemplate>) => Promise<{
    success: boolean
    error?: string
  }>
  resetTemplate: () => Promise<{
    success: boolean
    template?: PromptTemplate
    error?: string
  }>
}

/**
 * 缓存统计信息（向后兼容）
 */
export interface PromptCacheStats {
  hitRate: number
  totalRequests: number
  hitCount: number
  missCount: number
  currentSize: number
  maxSize: number
  ttlHours: number
}

/**
 * 缓存统计 API
 */
export interface CacheStatsApi {
  getStats: () => Promise<{
    success: boolean
    stats?: PromptCacheStats
    error?: string
  }>
  getReport: () => Promise<{
    success: boolean
    report?: string
    error?: string
  }>
  clearCache: () => Promise<{ success: boolean; error?: string }>
  subscribe: () => Promise<{ success: boolean }>
  unsubscribe: () => Promise<{ success: boolean }>
  onStatsUpdated: (callback: (stats: CacheStatsUpdatedEvent) => void) => () => void
  onPerformanceWarning: (callback: (data: CachePerformanceWarningEvent) => void) => () => void
}
