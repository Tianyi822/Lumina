import { ipcMain, BrowserWindow } from 'electron'
import { configManager } from '../../services/config'
import { logger } from '../../services/logger'
import { exampleManager } from '../../services/chat/prompts/ExampleManager'
import { promptBuilder } from '../../services/chat/PromptBuilder'
import { promptTemplateManager } from '../../services/chat/prompts/PromptTemplateManager'
import { promptVersionManager } from '../../services/chat/prompts/PromptVersionManager'
import { modelSpecificOptimizer } from '../../services/chat/prompts/ModelSpecificOptimizer'
import { promptMetricsCollector } from '../../services/chat/prompts/PromptMetricsCollector'
import { sectionPriorityManager, type PromptSectionPriority } from '../../services/chat/prompts/SectionPriorityManager'
import { cacheMonitor, CacheMonitorEvent, type StatsUpdatedEvent } from '../../services/chat/cache/CacheMonitor'
import type { PromptConfig } from '@main/types/config'
import type { ReactPromptSections } from '../../services/chat/prompts/types'
import type { VersionChange, VersionQueryOptions } from '../../services/chat/prompts/PromptVersionManager'
import type { ModelSpecificConfig } from '../../services/chat/prompts/ModelSpecificOptimizer'

// 获取提示词配置，返回当前应用的提示词配置对象
export async function handleGetPromptConfig(): Promise<PromptConfig | undefined> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      logger.error('无法获取提示词配置：配置未加载')
      return undefined
    }

    return config.promptConfig
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取提示词配置失败', 'main', { error: errorMessage })
    throw error
  }
}

// 更新提示词配置，保存新的配置设置到应用配置文件
export async function handleUpdatePromptConfig(
  _event: Electron.IpcMainInvokeEvent,
  promptConfig: PromptConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      const error = '无法更新提示词配置：配置未加载'
      logger.error(error)
      return { success: false, error }
    }

    // 更新配置
    const result = configManager.updateConfig({ promptConfig })

    if (result.success) {
      logger.info('提示词配置已更新', 'main', { promptConfig })
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新提示词配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 重置提示词配置为默认值，恢复到系统预设的默认配置
export async function handleResetPromptConfig(): Promise<{
  success: boolean
  config?: PromptConfig
  error?: string
}> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      const error = '无法重置提示词配置：配置未加载'
      logger.error(error)
      return { success: false, error }
    }

    // 默认配置
    const defaultPromptConfig: PromptConfig = {
      enableEnhancedPrompt: true,
      toolDescriptionLevel: 'detailed',
      fewShotCount: 3,
      customSystemPrompt: ''
    }

    // 更新配置
    const result = configManager.updateConfig({ promptConfig: defaultPromptConfig })

    if (result.success) {
      logger.info('提示词配置已重置为默认值', 'main')
      return { success: true, config: defaultPromptConfig }
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('重置提示词配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 注册提示词配置相关的 IPC 处理器，包括配置管理、示例管理和性能监控
export function registerPromptHandlers(): void {
  ipcMain.handle('prompt:getConfig', handleGetPromptConfig)
  ipcMain.handle('prompt:updateConfig', handleUpdatePromptConfig)
  ipcMain.handle('prompt:resetConfig', handleResetPromptConfig)

  // 示例管理 handlers
  ipcMain.handle('prompt:extractExamples', handleExtractExamples)
  ipcMain.handle('prompt:getExampleStats', handleGetExampleStats)
  ipcMain.handle('prompt:cleanupExamples', handleCleanupExamples)
  ipcMain.handle('prompt:exportExamples', handleExportExamples)
  ipcMain.handle('prompt:importExamples', handleImportExamples)

  // 性能监控 handlers
  ipcMain.handle('prompt:getCacheStats', handleGetCacheStats)
  ipcMain.handle('prompt:getCacheReport', handleGetCacheReport)
  ipcMain.handle('prompt:clearCache', handleClearCache)
  ipcMain.handle('prompt:subscribeCacheStats', handleSubscribeCacheStats)
  ipcMain.handle('prompt:unsubscribeCacheStats', handleUnsubscribeCacheStats)

  // 模板管理 handlers
  ipcMain.handle('prompt:getTemplate', handleGetTemplate)
  ipcMain.handle('prompt:updateTemplate', handleUpdateTemplate)
  ipcMain.handle('prompt:updateTemplateSection', handleUpdateTemplateSection)
  ipcMain.handle('prompt:resetTemplate', handleResetTemplate)
  ipcMain.handle('prompt:exportTemplate', handleExportTemplate)
  ipcMain.handle('prompt:importTemplate', handleImportTemplate)

  // 版本管理 handlers
  ipcMain.handle('prompt:getVersions', handleGetVersions)
  ipcMain.handle('prompt:getVersion', handleGetVersion)
  ipcMain.handle('prompt:createVersion', handleCreateVersion)
  ipcMain.handle('prompt:rollbackToVersion', handleRollbackToVersion)
  ipcMain.handle('prompt:compareVersions', handleCompareVersions)
  ipcMain.handle('prompt:addVersionTag', handleAddVersionTag)
  ipcMain.handle('prompt:removeVersionTag', handleRemoveVersionTag)
  ipcMain.handle('prompt:deleteVersion', handleDeleteVersion)
  ipcMain.handle('prompt:getVersionStats', handleGetVersionStats)
  ipcMain.handle('prompt:exportVersions', handleExportVersions)
  ipcMain.handle('prompt:importVersions', handleImportVersions)

  // 模型特定优化 handlers
  ipcMain.handle('prompt:recognizeModel', handleRecognizeModel)
  ipcMain.handle('prompt:optimizeForModel', handleOptimizeForModel)
  ipcMain.handle('prompt:getModelRecommendation', handleGetModelRecommendation)
  ipcMain.handle('prompt:getAllModelConfigs', handleGetAllModelConfigs)
  ipcMain.handle('prompt:addModelConfig', handleAddModelConfig)
  ipcMain.handle('prompt:removeModelConfig', handleRemoveModelConfig)

  // 提示词效果监控 handlers
  ipcMain.handle('prompt:metrics:getCurrent', handleGetCurrentMetrics)
  ipcMain.handle('prompt:metrics:getByVersion', handleGetMetricsByVersion)
  ipcMain.handle('prompt:metrics:getTrend', handleGetTrendData)
  ipcMain.handle('prompt:metrics:export', handleExportMetrics)
  ipcMain.handle('prompt:metrics:clear', handleClearMetrics)

  // 章节优先级管理 handlers
  ipcMain.handle('prompt:priority:getAll', handleGetAllPriorities)
  ipcMain.handle('prompt:priority:update', handleUpdatePriority)
  ipcMain.handle('prompt:priority:reset', handleResetPriorities)
  ipcMain.handle('prompt:priority:export', handleExportPriorities)
  ipcMain.handle('prompt:priority:import', handleImportPriorities)

  // 设置缓存监控事件推送
  setupCacheMonitorEvents()

  logger.debug('提示词配置 IPC 处理器已注册', 'main')
}

// 缓存统计事件订阅的窗口集合
const cacheStatsSubscribers = new Set<number>()

// 是否已设置缓存监控事件
let cacheMonitorEventsSetup = false

/**
 * 设置缓存监控事件推送
 * 当缓存统计更新时，推送到所有订阅的窗口
 */
function setupCacheMonitorEvents(): void {
  if (cacheMonitorEventsSetup) return
  cacheMonitorEventsSetup = true

  cacheMonitor.on(CacheMonitorEvent.STATS_UPDATED, (stats: StatsUpdatedEvent) => {
    // 向所有订阅的窗口推送缓存统计
    for (const webContentsId of cacheStatsSubscribers) {
      const win = BrowserWindow.fromWebContents(
        require('electron').webContents.fromId(webContentsId)
      )
      if (win && !win.isDestroyed()) {
        win.webContents.send('prompt:cacheStatsUpdated', stats)
      } else {
        // 窗口已销毁，移除订阅
        cacheStatsSubscribers.delete(webContentsId)
      }
    }
  })

  // 性能警告事件
  cacheMonitor.on('performance:warning', (data: { timestamp: number; score: number; threshold: number }) => {
    for (const webContentsId of cacheStatsSubscribers) {
      const win = BrowserWindow.fromWebContents(
        require('electron').webContents.fromId(webContentsId)
      )
      if (win && !win.isDestroyed()) {
        win.webContents.send('prompt:cachePerformanceWarning', data)
      }
    }
  })
}

// 订阅缓存统计更新
export async function handleSubscribeCacheStats(
  event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean }> {
  try {
    const webContentsId = event.sender.id
    cacheStatsSubscribers.add(webContentsId)

    // 立即推送一次当前统计
    const stats = cacheMonitor.getCurrentStats()
    if (stats) {
      event.sender.send('prompt:cacheStatsUpdated', stats)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('订阅缓存统计失败', 'main', { error: errorMessage })
    return { success: false }
  }
}

// 取消订阅缓存统计更新
export async function handleUnsubscribeCacheStats(
  event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean }> {
  try {
    const webContentsId = event.sender.id
    cacheStatsSubscribers.delete(webContentsId)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('取消订阅缓存统计失败', 'main', { error: errorMessage })
    return { success: false }
  }
}

// 提取示例，从历史会话中提取高质量的示例用于 Few-shot 学习
export async function handleExtractExamples(
  _event: Electron.IpcMainInvokeEvent,
  sessionIds?: string[]
): Promise<{ success: boolean; extracted?: number; saved?: number; errors?: string[] }> {
  try {
    const result = await exampleManager.extractAndSave(sessionIds)
    return { success: true, ...result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('提取示例失败', 'main', { error: errorMessage })
    return { success: false, errors: [errorMessage] }
  }
}

// 获取示例统计信息，包括示例数量、平均质量分数等统计数据
export async function handleGetExampleStats(): Promise<{
  success: boolean
  stats?: {
    total: number
    static: number
    dynamic: number
    avgQualityScore: number
    lastUpdated: string
  }
  error?: string
}> {
  try {
    const stats = await exampleManager.getStats()
    return { success: true, stats }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取示例统计失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 清理示例，根据质量分数或时间清理低质量或过期的示例
export async function handleCleanupExamples(
  _event: Electron.IpcMainInvokeEvent,
  options: { type: 'quality' | 'age'; value?: number }
): Promise<{ success: boolean; cleaned?: number; error?: string }> {
  try {
    let cleaned = 0
    if (options.type === 'quality') {
      cleaned = await exampleManager.cleanup(options.value || 0.6)
    } else if (options.type === 'age') {
      cleaned = await exampleManager.cleanupOldExamples(options.value || 30)
    }

    logger.info('示例清理完成', 'main', { type: options.type, count: cleaned })
    return { success: true, cleaned }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('清理示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导出示例，将示例数据导出为 JSON 格式
export async function handleExportExamples(): Promise<{
  success: boolean
  json?: string
  error?: string
}> {
  try {
    const json = await exampleManager.exportExamples()
    return { success: true, json }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导入示例，从 JSON 格式的数据导入示例
export async function handleImportExamples(
  _event: Electron.IpcMainInvokeEvent,
  json: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await exampleManager.importExamples(json)
    logger.info('示例导入成功')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导入示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取缓存统计，包括系统提示词、工具描述和示例格式化的缓存命中率和大小等信息
export async function handleGetCacheStats(): Promise<{
  success: boolean
  stats?: {
    systemPrompt: {
      size: number
      maxSize: number
      hits: number
      misses: number
      hitRate: number
    }
    toolDescription: {
      size: number
      maxSize: number
      hits: number
      misses: number
      hitRate: number
    }
    exampleFormatting: {
      size: number
      maxSize: number
      hits: number
      misses: number
      hitRate: number
    }
  }
  error?: string
}> {
  try {
    const stats = promptBuilder.getCache().getStats()
    return { success: true, stats }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取缓存统计失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取缓存性能报告，生成详细的缓存性能报告文本
export async function handleGetCacheReport(): Promise<{
  success: boolean
  report?: string
  error?: string
}> {
  try {
    const report = promptBuilder.getCache().generateReport()
    return { success: true, report }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('生成缓存报告失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 清空缓存，清除所有提示词相关的缓存数据
export async function handleClearCache(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    promptBuilder.getCache().clear()
    logger.info('缓存已清空')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('清空缓存失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 模板管理 Handlers ============

// 获取当前模板
export async function handleGetTemplate(): Promise<{
  success: boolean
  template?: {
    version: string
    sections: ReactPromptSections
    variables: Record<string, string>
  }
  error?: string
}> {
  try {
    const template = promptTemplateManager.getTemplate()
    return { success: true, template }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取模板失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 更新整个模板
export async function handleUpdateTemplate(
  _event: Electron.IpcMainInvokeEvent,
  template: {
    version: string
    sections: ReactPromptSections
    variables: Record<string, string>
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptTemplateManager.updateTemplate(template)
    if (result) {
      // 清空缓存以使用新模板
      promptBuilder.getCache().clear()
      logger.info('提示词模板已更新', 'main', { version: template.version })
    }
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新模板失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 更新单个章节
export async function handleUpdateTemplateSection(
  _event: Electron.IpcMainInvokeEvent,
  sectionName: keyof ReactPromptSections,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptTemplateManager.updateSection(sectionName, content)
    if (result) {
      // 清空缓存以使用新章节
      promptBuilder.getCache().clear()
      logger.info('提示词模板章节已更新', 'main', { sectionName })
    }
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新模板章节失败', 'main', { sectionName, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 重置模板为默认值
export async function handleResetTemplate(): Promise<{
  success: boolean
  template?: {
    version: string
    sections: ReactPromptSections
    variables: Record<string, string>
  }
  error?: string
}> {
  try {
    const result = await promptTemplateManager.resetToDefault()
    if (result) {
      // 清空缓存以使用默认模板
      promptBuilder.getCache().clear()
      const template = promptTemplateManager.getTemplate()
      logger.info('提示词模板已重置为默认值', 'main')
      return { success: true, template }
    }
    return { success: false, error: '重置失败' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('重置模板失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导出模板
export async function handleExportTemplate(): Promise<{
  success: boolean
  json?: string
  error?: string
}> {
  try {
    const json = promptTemplateManager.exportTemplate()
    return { success: true, json }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出模板失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导入模板
export async function handleImportTemplate(
  _event: Electron.IpcMainInvokeEvent,
  json: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptTemplateManager.importTemplate(json)
    if (result) {
      // 清空缓存以使用新模板
      promptBuilder.getCache().clear()
      logger.info('提示词模板已导入', 'main')
    }
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导入模板失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 提示词效果监控 Handlers ============

// 获取当前指标
export async function handleGetCurrentMetrics(): Promise<{
  success: boolean
  metrics?: {
    version: string
    period: { start: string; end: string }
    toolCallSuccessRate: number
    avgToolCallsPerSession: number
    tokenEfficiency: number
    avgResponseTime: number
    userSatisfactionScore?: number
    sampleCount: number
  }
  error?: string
}> {
  try {
    const metrics = promptMetricsCollector.getCurrentMetrics()
    return { success: true, metrics }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取当前指标失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取指定版本的指标
export async function handleGetMetricsByVersion(
  _event: Electron.IpcMainInvokeEvent,
  version: string
): Promise<{
  success: boolean
  metrics?: {
    version: string
    period: { start: string; end: string }
    toolCallSuccessRate: number
    avgToolCallsPerSession: number
    tokenEfficiency: number
    avgResponseTime: number
    userSatisfactionScore?: number
    sampleCount: number
  }
  error?: string
}> {
  try {
    const metrics = promptMetricsCollector.getMetricsByVersion(version)
    return { success: true, metrics }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取版本指标失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取趋势数据
export async function handleGetTrendData(
  _event: Electron.IpcMainInvokeEvent,
  options: {
    metricType: 'toolCallSuccessRate' | 'tokenEfficiency' | 'avgResponseTime'
    days?: number
    version?: string
  }
): Promise<{
  success: boolean
  data?: Array<{
    timestamp: number
    date: string
    value: number
    sampleCount: number
  }>
  error?: string
}> {
  try {
    const data = promptMetricsCollector.getTrendData(
      options.metricType,
      options.days || 7,
      options.version
    )
    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取趋势数据失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导出报表
export async function handleExportMetrics(
  _event: Electron.IpcMainInvokeEvent,
  options: {
    startDate: string
    endDate: string
    version?: string
  }
): Promise<{
  success: boolean
  report?: {
    summary: {
      version: string
      period: { start: string; end: string }
      toolCallSuccessRate: number
      avgToolCallsPerSession: number
      tokenEfficiency: number
      avgResponseTime: number
      userSatisfactionScore?: number
      sampleCount: number
    }
    dailyData: Array<{
      date: string
      toolCallSuccessRate: number
      avgToolCalls: number
      tokenEfficiency: number
      avgResponseTime: number
      sessionCount: number
    }>
  }
  error?: string
}> {
  try {
    const report = promptMetricsCollector.exportReport(
      options.startDate,
      options.endDate,
      options.version
    )
    return { success: true, report }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出报表失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 清空监控数据
export async function handleClearMetrics(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    promptMetricsCollector.clearAll()
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('清空监控数据失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 章节优先级管理 Handlers ============

// 获取所有章节优先级
export async function handleGetAllPriorities(): Promise<{
  success: boolean
  priorities?: PromptSectionPriority[]
  error?: string
}> {
  try {
    const priorities = sectionPriorityManager.getAllPriorities()
    return { success: true, priorities }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取章节优先级失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 更新章节优先级
export async function handleUpdatePriority(
  _event: Electron.IpcMainInvokeEvent,
  options: {
    section: keyof ReactPromptSections
    updates: Partial<Omit<PromptSectionPriority, 'section'>>
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = sectionPriorityManager.updatePriority(options.section, options.updates)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新章节优先级失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 重置为默认优先级
export async function handleResetPriorities(): Promise<{
  success: boolean
  priorities?: PromptSectionPriority[]
  error?: string
}> {
  try {
    sectionPriorityManager.resetToDefault()
    const priorities = sectionPriorityManager.getAllPriorities()
    return { success: true, priorities }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('重置章节优先级失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导出优先级配置
export async function handleExportPriorities(): Promise<{
  success: boolean
  json?: string
  error?: string
}> {
  try {
    const config = sectionPriorityManager.exportConfig()
    return { success: true, json: JSON.stringify(config, null, 2) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出优先级配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导入优先级配置
export async function handleImportPriorities(
  _event: Electron.IpcMainInvokeEvent,
  json: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = JSON.parse(json)
    const result = sectionPriorityManager.importConfig(config)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导入优先级配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 版本管理 Handlers ============

// 获取版本列表
export async function handleGetVersions(
  _event: Electron.IpcMainInvokeEvent,
  options: VersionQueryOptions = {}
): Promise<{
  success: boolean
  versions?: Array<{
    id: string
    version: string
    summary: string
    createdAt: string
    author?: string
    tags?: string[]
  }>
  total?: number
  error?: string
}> {
  try {
    const result = await promptVersionManager.getVersions(options)
    return {
      success: true,
      versions: result.versions.map(v => ({
        id: v.id,
        version: v.version,
        summary: v.summary,
        createdAt: v.createdAt,
        author: v.author,
        tags: v.tags
      })),
      total: result.total
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取版本列表失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取单个版本
export async function handleGetVersion(
  _event: Electron.IpcMainInvokeEvent,
  versionId: string
): Promise<{
  success: boolean
  version?: {
    id: string
    version: string
    summary: string
    changes: VersionChange[]
    template: {
      version: string
      sections: ReactPromptSections
      variables: Record<string, string>
    }
    createdAt: string
    author?: string
    tags?: string[]
  }
  error?: string
}> {
  try {
    const version = await promptVersionManager.getVersion(versionId)
    if (!version) {
      return { success: false, error: '版本不存在' }
    }
    return {
      success: true,
      version: {
        id: version.id,
        version: version.version,
        summary: version.summary,
        changes: version.changes,
        template: version.template,
        createdAt: version.createdAt,
        author: version.author,
        tags: version.tags
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 创建新版本
export async function handleCreateVersion(
  _event: Electron.IpcMainInvokeEvent,
  params: {
    summary: string
    changes: VersionChange[]
    options?: {
      author?: string
      tags?: string[]
    }
  }
): Promise<{
  success: boolean
  version?: {
    id: string
    version: string
    summary: string
    createdAt: string
  }
  error?: string
}> {
  try {
    const template = promptTemplateManager.getTemplate()
    const version = await promptVersionManager.createVersion(
      template,
      params.summary,
      params.changes,
      params.options
    )
    return {
      success: true,
      version: {
        id: version.id,
        version: version.version,
        summary: version.summary,
        createdAt: version.createdAt
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('创建版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 回滚到指定版本
export async function handleRollbackToVersion(
  _event: Electron.IpcMainInvokeEvent,
  versionId: string
): Promise<{
  success: boolean
  template?: {
    version: string
    sections: ReactPromptSections
    variables: Record<string, string>
  }
  error?: string
}> {
  try {
    const template = await promptVersionManager.rollbackToVersion(versionId)
    if (!template) {
      return { success: false, error: '版本不存在' }
    }

    // 应用回滚的模板
    await promptTemplateManager.updateTemplate(template)
    promptBuilder.getCache().clear()

    logger.info('已回滚到指定版本', 'main', { versionId })
    return {
      success: true,
      template
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('回滚版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 对比两个版本
export async function handleCompareVersions(
  _event: Electron.IpcMainInvokeEvent,
  fromVersionId: string,
  toVersionId: string
): Promise<{
  success: boolean
  diff?: {
    fromVersion: string
    toVersion: string
    differences: VersionChange[]
    stats: {
      added: number
      modified: number
      deleted: number
    }
  }
  error?: string
}> {
  try {
    const diff = await promptVersionManager.compareVersions(fromVersionId, toVersionId)
    if (!diff) {
      return { success: false, error: '版本不存在' }
    }
    return { success: true, diff }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('对比版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 添加版本标签
export async function handleAddVersionTag(
  _event: Electron.IpcMainInvokeEvent,
  versionId: string,
  tag: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptVersionManager.addTag(versionId, tag)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('添加版本标签失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 移除版本标签
export async function handleRemoveVersionTag(
  _event: Electron.IpcMainInvokeEvent,
  versionId: string,
  tag: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptVersionManager.removeTag(versionId, tag)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('移除版本标签失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 删除版本
export async function handleDeleteVersion(
  _event: Electron.IpcMainInvokeEvent,
  versionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await promptVersionManager.deleteVersion(versionId)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('删除版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取版本统计
export async function handleGetVersionStats(): Promise<{
  success: boolean
  stats?: {
    totalVersions: number
    oldestVersion: string | null
    latestVersion: string | null
    tags: Record<string, number>
  }
  error?: string
}> {
  try {
    const stats = await promptVersionManager.getStats()
    return { success: true, stats }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取版本统计失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导出版本
export async function handleExportVersions(
  _event: Electron.IpcMainInvokeEvent,
  versionIds?: string[]
): Promise<{ success: boolean; json?: string; error?: string }> {
  try {
    const json = await promptVersionManager.exportVersions(versionIds)
    return { success: true, json }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导入版本
export async function handleImportVersions(
  _event: Electron.IpcMainInvokeEvent,
  jsonData: string
): Promise<{
  success: boolean
  result?: {
    imported: number
    skipped: number
    errors: string[]
  }
  error?: string
}> {
  try {
    const result = await promptVersionManager.importVersions(jsonData)
    return { success: true, result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导入版本失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 模型特定优化 Handlers ============

// 识别模型类型
export async function handleRecognizeModel(
  _event: Electron.IpcMainInvokeEvent,
  modelName: string
): Promise<{
  success: boolean
  result?: {
    recognized: boolean
    modelType: string
    confidence: number
  }
  error?: string
}> {
  try {
    const result = modelSpecificOptimizer.recognizeModel(modelName)
    return {
      success: true,
      result: {
        recognized: result.recognized,
        modelType: result.modelType,
        confidence: result.confidence
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('识别模型失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 为模型优化提示词
export async function handleOptimizeForModel(
  _event: Electron.IpcMainInvokeEvent,
  modelName: string
): Promise<{
  success: boolean
  result?: {
    template: {
      version: string
      sections: ReactPromptSections
      variables: Record<string, string>
    }
    appliedSuggestions: string[]
    warnings: string[]
  }
  error?: string
}> {
  try {
    const template = promptTemplateManager.getTemplate()
    const result = modelSpecificOptimizer.optimizeTemplate(template, modelName)
    return {
      success: true,
      result: {
        template: result.template,
        appliedSuggestions: result.appliedSuggestions,
        warnings: result.warnings
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('优化提示词失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取模型推荐配置
export async function handleGetModelRecommendation(
  _event: Electron.IpcMainInvokeEvent,
  modelName: string
): Promise<{
  success: boolean
  recommendation?: {
    temperature: number
    maxTokens: number
    supportsTools: boolean
    supportsSystemPrompt: boolean
  } | null
  error?: string
}> {
  try {
    const recommendation = modelSpecificOptimizer.getModelRecommendation(modelName)
    return { success: true, recommendation }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取模型推荐配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取所有模型配置
export async function handleGetAllModelConfigs(): Promise<{
  success: boolean
  configs?: ModelSpecificConfig[]
  error?: string
}> {
  try {
    const configs = modelSpecificOptimizer.getAllModelConfigs()
    return { success: true, configs }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取模型配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 添加模型配置
export async function handleAddModelConfig(
  _event: Electron.IpcMainInvokeEvent,
  config: ModelSpecificConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    modelSpecificOptimizer.addModelConfig(config)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('添加模型配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 移除模型配置
export async function handleRemoveModelConfig(
  _event: Electron.IpcMainInvokeEvent,
  pattern: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = modelSpecificOptimizer.removeModelConfig(pattern)
    return { success: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('移除模型配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}
