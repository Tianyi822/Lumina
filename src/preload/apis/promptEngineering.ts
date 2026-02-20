import { ipcRenderer } from 'electron'
import type {
  PromptTemplate,
  PromptCacheStats,
  CacheStatsUpdatedEvent,
  CachePerformanceWarningEvent
} from '@shared/types/prompt'

/**
 * 提示词模板 API
 */
export const promptTemplateApi = {
  /**
   * 获取当前模板
   */
  getTemplate: (): Promise<PromptTemplate> => ipcRenderer.invoke('prompt:template:get'),

  /**
   * 更新模板
   */
  updateTemplate: (
    template: Partial<PromptTemplate>
  ): Promise<{
    success: boolean
    error?: string
  }> => ipcRenderer.invoke('prompt:template:update', template),

  /**
   * 重置为默认模板
   */
  resetTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:template:reset')
}

/**
 * 缓存统计 API
 */
export const cacheStatsApi = {
  /**
   * 获取缓存统计
   */
  getStats: (): Promise<{ success: boolean; stats?: PromptCacheStats; error?: string }> =>
    ipcRenderer.invoke('prompt:getCacheStats'),

  /**
   * 获取缓存报告
   */
  getReport: (): Promise<{ success: boolean; report?: string; error?: string }> =>
    ipcRenderer.invoke('prompt:getCacheReport'),

  /**
   * 清空缓存
   */
  clearCache: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:clearCache'),

  /**
   * 订阅缓存统计更新
   */
  subscribe: (): Promise<{ success: boolean }> => ipcRenderer.invoke('prompt:subscribeCacheStats'),

  /**
   * 取消订阅缓存统计更新
   */
  unsubscribe: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('prompt:unsubscribeCacheStats'),

  /**
   * 监听缓存统计更新事件
   */
  onStatsUpdated: (callback: (stats: CacheStatsUpdatedEvent) => void): (() => void) => {
    const handler = (_event: unknown, stats: CacheStatsUpdatedEvent) => callback(stats)
    ipcRenderer.on('prompt:cacheStatsUpdated', handler)
    return () => {
      ipcRenderer.removeListener('prompt:cacheStatsUpdated', handler)
    }
  },

  /**
   * 监听缓存性能警告事件
   */
  onPerformanceWarning: (callback: (data: CachePerformanceWarningEvent) => void): (() => void) => {
    const handler = (_event: unknown, data: CachePerformanceWarningEvent) => callback(data)
    ipcRenderer.on('prompt:cachePerformanceWarning', handler)
    return () => {
      ipcRenderer.removeListener('prompt:cachePerformanceWarning', handler)
    }
  }
}
