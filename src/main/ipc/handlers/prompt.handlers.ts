import { ipcMain } from 'electron'
import { configManager } from '../../services/config'
import { logger } from '../../services/logger'
import { exampleManager } from '../../services/chat/prompts/ExampleManager'
import { promptBuilder } from '../../services/chat/PromptBuilder'
import { promptTemplateManager } from '../../services/chat/prompts/PromptTemplateManager'
import { promptVersionManager } from '../../services/chat/prompts/PromptVersionManager'
import { modelSpecificOptimizer } from '../../services/chat/prompts/ModelSpecificOptimizer'
import { promptMetricsCollector } from '../../services/chat/prompts/PromptMetricsCollector'
import { sectionPriorityManager, type PromptSectionPriority } from '../../services/chat/prompts/SectionPriorityManager'
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

  logger.debug('提示词配置 IPC 处理器已注册', 'main')
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
