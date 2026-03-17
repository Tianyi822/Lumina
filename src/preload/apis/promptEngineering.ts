import { ipcRenderer } from 'electron'
import type { PromptEngineeringApi } from '../types/promptEngineering'

/**
 * 提示词工程统一 API
 */
export const promptEngineeringApi: PromptEngineeringApi = {
  getConfig: () => ipcRenderer.invoke('prompt:getConfig'),

  updateConfig: (config) => ipcRenderer.invoke('prompt:updateConfig', config),

  resetConfig: () => ipcRenderer.invoke('prompt:resetConfig'),

  getTemplate: () => ipcRenderer.invoke('prompt:getTemplate'),

  updateTemplate: (template) => ipcRenderer.invoke('prompt:updateTemplate', template),

  updateTemplateSection: (sectionName, content) =>
    ipcRenderer.invoke('prompt:updateTemplateSection', sectionName, content),

  resetTemplate: () => ipcRenderer.invoke('prompt:resetTemplate'),

  exportTemplate: () => ipcRenderer.invoke('prompt:exportTemplate'),

  importTemplate: (json) => ipcRenderer.invoke('prompt:importTemplate', json),

  getCacheStats: () => ipcRenderer.invoke('prompt:getCacheStats'),

  getCacheReport: () => ipcRenderer.invoke('prompt:getCacheReport'),

  clearCache: () => ipcRenderer.invoke('prompt:clearCache'),

  subscribeCacheStats: () => ipcRenderer.invoke('prompt:subscribeCacheStats'),

  unsubscribeCacheStats: () => ipcRenderer.invoke('prompt:unsubscribeCacheStats'),

  onCacheStatsUpdated: (callback) => {
    const handler = (_event: unknown, stats: Parameters<typeof callback>[0]): void => {
      callback(stats)
    }

    ipcRenderer.on('prompt:cacheStatsUpdated', handler)

    return () => {
      ipcRenderer.removeListener('prompt:cacheStatsUpdated', handler)
    }
  },

  onCachePerformanceWarning: (callback) => {
    const handler = (_event: unknown, data: Parameters<typeof callback>[0]): void => {
      callback(data)
    }

    ipcRenderer.on('prompt:cachePerformanceWarning', handler)

    return () => {
      ipcRenderer.removeListener('prompt:cachePerformanceWarning', handler)
    }
  },

  listExamples: (filter) => ipcRenderer.invoke('example:list', filter),

  getExample: (id) => ipcRenderer.invoke('example:get', id),

  addExample: (example) => ipcRenderer.invoke('example:add', example),

  updateExample: (example) => ipcRenderer.invoke('example:update', example),

  deleteExamples: (ids) => ipcRenderer.invoke('example:delete', ids),

  importExamples: (json) => ipcRenderer.invoke('example:import', json),

  exportExamples: () => ipcRenderer.invoke('example:export'),

  extractExamplesFromSessions: () => ipcRenderer.invoke('example:extractFromSessions'),

  getExampleStats: () => ipcRenderer.invoke('example:getStats'),

  clearDynamicExamples: () => ipcRenderer.invoke('example:clearDynamic'),

  previewPrompt: (payload) => ipcRenderer.invoke('prompt:preview', payload),

  testPrompt: (payload) => ipcRenderer.invoke('prompt:test', payload)
}
