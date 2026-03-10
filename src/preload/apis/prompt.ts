import { ipcRenderer } from 'electron'

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
  /** 是否启用提示词缓存 */
  enablePromptCache?: boolean
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
 * 提示词模板章节
 */
export interface ReactPromptSections {
  coreInstructions: string
  reactProcess: string
  errorHandling: string
  toolBestPractices: string
  outputFormat: string
  sandboxManagement?: string
}

/**
 * 提示词模板
 */
export interface PromptTemplate {
  version: string
  sections: ReactPromptSections
  variables: Record<string, string>
}

/**
 * 提示词配置相关的 API
 */
export const promptApi = {
  /**
   * 获取提示词配置
   */
  getConfig: (): Promise<PromptConfig | undefined> => ipcRenderer.invoke('prompt:getConfig'),

  /**
   * 更新提示词配置
   */
  updateConfig: (config: PromptConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateConfig', config),

  /**
   * 重置提示词配置为默认值
   */
  resetConfig: (): Promise<{ success: boolean; config?: PromptConfig; error?: string }> =>
    ipcRenderer.invoke('prompt:resetConfig'),

  // ============ 模板管理 API ============

  /**
   * 获取当前提示词模板
   */
  getTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:getTemplate'),

  /**
   * 更新整个提示词模板
   */
  updateTemplate: (template: PromptTemplate): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateTemplate', template),

  /**
   * 更新单个模板章节
   */
  updateTemplateSection: (
    sectionName: keyof ReactPromptSections,
    content: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateTemplateSection', sectionName, content),

  /**
   * 重置模板为默认值
   */
  resetTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:resetTemplate'),

  /**
   * 导出模板为 JSON 字符串
   */
  exportTemplate: (): Promise<{ success: boolean; json?: string; error?: string }> =>
    ipcRenderer.invoke('prompt:exportTemplate'),

  /**
   * 从 JSON 字符串导入模板
   */
  importTemplate: (json: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:importTemplate', json),

  // ============ 缓存监控 API ============

  /**
   * 订阅缓存统计更新
   */
  subscribeCacheStats: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('prompt:subscribeCacheStats'),

  /**
   * 取消订阅缓存统计更新
   */
  unsubscribeCacheStats: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('prompt:unsubscribeCacheStats'),

  /**
   * 监听缓存统计更新事件
   */
  onCacheStatsUpdated: (callback: (stats: CacheStatsUpdatedEvent) => void): (() => void) => {
    const handler = (_event: unknown, stats: CacheStatsUpdatedEvent): void => {
      callback(stats)
    }
    ipcRenderer.on('prompt:cacheStatsUpdated', handler)
    return () => {
      ipcRenderer.removeListener('prompt:cacheStatsUpdated', handler)
    }
  },

  /**
   * 监听缓存性能警告事件
   */
  onCachePerformanceWarning: (
    callback: (data: CachePerformanceWarningEvent) => void
  ): (() => void) => {
    const handler = (_event: unknown, data: CachePerformanceWarningEvent): void => {
      callback(data)
    }
    ipcRenderer.on('prompt:cachePerformanceWarning', handler)
    return () => {
      ipcRenderer.removeListener('prompt:cachePerformanceWarning', handler)
    }
  }
}
