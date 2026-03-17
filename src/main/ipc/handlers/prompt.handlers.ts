import { ipcMain, BrowserWindow, webContents } from 'electron'
import { configManager } from '../../services/config'
import { logger } from '../../services/logger'
import { promptBuilder } from '../../services/chat/PromptBuilder'
import { promptTemplateManager } from '../../services/chat/prompts/PromptTemplateManager'
import {
  cacheMonitor,
  CacheMonitorEvent,
  type StatsUpdatedEvent
} from '../../services/chat/cache/CacheMonitor'
import type { PromptConfig } from '@main/types/config'
import type { ReactPromptSections } from '../../services/chat/prompts/types'
import type {
  EnhancedFewShotExample,
  TestPromptPayload,
  TestPromptResult
} from '@shared/types/prompt'
import {
  buildPromptVariableValueMap,
  normalizeCustomPromptVariables,
  replacePromptVariables
} from '@shared/utils'
import OpenAI from 'openai'

const DEFAULT_SANDBOX_SYSTEM_PROMPT = '你是一个智能助手，请帮助用户解决问题。'

/**
 * 构建默认提示词配置
 */
function createDefaultPromptConfig(): PromptConfig {
  return {
    enableEnhancedPrompt: true,
    toolDescriptionLevel: 'detailed',
    fewShotCount: 3,
    customSystemPrompt: '',
    enablePromptCache: false,
    enableDynamicExamples: false,
    autoExtractIntervalDays: 7,
    dynamicExampleMinQuality: 0.6,
    maxStaticExamples: 10,
    maxDynamicExamples: 20,
    enablePromptOptimization: false,
    optimizationAggressiveness: 'balanced',
    customVariables: []
  }
}

/**
 * 格式化 Few-shot 示例文本
 */
function formatSandboxExampleText(examples: EnhancedFewShotExample[]): string {
  if (examples.length === 0) {
    return ''
  }

  let text = '\n\n# Few-shot 示例\n\n'

  examples.forEach((example, index) => {
    text += `## 示例 ${index + 1}\n`
    text += `用户问题: ${example.userQuery}\n`

    if (example.thought) {
      text += `思考过程: ${example.thought}\n`
    }

    if (example.toolCalls && example.toolCalls.length > 0) {
      example.toolCalls.forEach((toolCall) => {
        text += `工具调用: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})\n`
        text += `结果: ${toolCall.result}\n`
      })
    }

    text += `最终答案: ${example.finalAnswer}\n\n`
  })

  return text.trimEnd()
}

/**
 * 构建沙盘提示词
 */
async function buildSandboxPrompt(
  payload: TestPromptPayload,
  promptConfig: PromptConfig
): Promise<string> {
  const resolvedVariables = buildPromptVariableValueMap(
    promptConfig.customVariables,
    payload.variables
  )

  const basePrompt = promptConfig.customSystemPrompt || DEFAULT_SANDBOX_SYSTEM_PROMPT
  let assembledPrompt = replacePromptVariables(basePrompt, resolvedVariables)

  if (payload.includeExamples) {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const exampleCount = Math.max(0, Math.min(5, payload.exampleCount ?? 3))
    const selectedExamples = (await exampleRepository.getAll())
      .sort((left, right) => right.qualityScore - left.qualityScore)
      .slice(0, exampleCount)

    const examplesText = formatSandboxExampleText(selectedExamples)
    if (examplesText) {
      assembledPrompt += examplesText
    }
  }

  assembledPrompt += `\n\n# 用户问题\n${payload.userQuery}`

  return assembledPrompt
}

// 获取提示词配置，返回当前应用的提示词配置对象
export async function handleGetPromptConfig(): Promise<PromptConfig | undefined> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      logger.error('无法获取提示词配置：配置未加载')
      return undefined
    }

    return {
      ...createDefaultPromptConfig(),
      ...config.promptConfig,
      customVariables: normalizeCustomPromptVariables(config.promptConfig?.customVariables)
    }
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

    const normalizedPromptConfig: PromptConfig = {
      ...createDefaultPromptConfig(),
      ...promptConfig,
      customVariables: normalizeCustomPromptVariables(promptConfig.customVariables)
    }

    // 更新配置
    const result = configManager.updateConfig({ promptConfig: normalizedPromptConfig })

    if (result.success) {
      logger.info('提示词配置已更新', 'main', { promptConfig: normalizedPromptConfig })
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
    const defaultPromptConfig = createDefaultPromptConfig()

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

// 注册提示词配置相关的 IPC 处理器
export function registerPromptHandlers(): void {
  ipcMain.handle('prompt:getConfig', handleGetPromptConfig)
  ipcMain.handle('prompt:updateConfig', handleUpdatePromptConfig)
  ipcMain.handle('prompt:resetConfig', handleResetPromptConfig)

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

  // 示例管理 handlers
  ipcMain.handle('example:list', handleListExamples)
  ipcMain.handle('example:get', handleGetExample)
  ipcMain.handle('example:update', handleUpdateExample)
  ipcMain.handle('example:delete', handleDeleteExamples)
  ipcMain.handle('example:import', handleImportExamples)
  ipcMain.handle('example:export', handleExportExamples)
  ipcMain.handle('example:getStats', handleGetExampleStats)
  ipcMain.handle('example:extractFromSessions', handleExtractFromSessions)
  ipcMain.handle('example:clearDynamic', handleClearDynamicExamples)

  // 测试沙盘 handlers
  ipcMain.handle('prompt:preview', handlePromptPreview)
  ipcMain.handle('prompt:test', handlePromptTest)

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
      const wc = webContents.fromId(webContentsId)
      const win = wc ? BrowserWindow.fromWebContents(wc) : null
      if (win && !win.isDestroyed()) {
        win.webContents.send('prompt:cacheStatsUpdated', stats)
      } else {
        // 窗口已销毁，移除订阅
        cacheStatsSubscribers.delete(webContentsId)
      }
    }
  })

  // 性能警告事件
  cacheMonitor.on(
    'performance:warning',
    (data: { timestamp: number; score: number; threshold: number }) => {
      for (const webContentsId of cacheStatsSubscribers) {
        const wc = webContents.fromId(webContentsId)
        const win = wc ? BrowserWindow.fromWebContents(wc) : null
        if (win && !win.isDestroyed()) {
          win.webContents.send('prompt:cachePerformanceWarning', data)
        }
      }
    }
  )
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

// ============ 示例管理 Handlers ============

import type { ExampleStats, ExampleFilter, ImportResult } from '@shared/types/prompt'

// 获取示例统计信息
export async function handleGetExampleStats(): Promise<{
  success: boolean
  stats?: ExampleStats
  error?: string
}> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const repoStats = await exampleRepository.getStats()
    const allExamples = await exampleRepository.getAll()

    // 计算额外统计信息
    const lowQualityCount = allExamples.filter((ex) => ex.qualityScore < 0.5).length
    const unusedCount = allExamples.filter((ex) => ex.usageCount === 0).length

    const stats: ExampleStats = {
      total: repoStats.total,
      static: repoStats.static,
      dynamic: repoStats.dynamic,
      avgQualityScore: repoStats.avgQualityScore,
      lastUpdated: repoStats.lastUpdated,
      lowQualityCount,
      unusedCount
    }

    logger.info('获取示例统计成功', 'main', { ...stats } as Record<string, unknown>)
    return { success: true, stats }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取示例统计失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取示例列表（支持筛选）
export async function handleListExamples(
  _event: Electron.IpcMainInvokeEvent,
  filter?: ExampleFilter
): Promise<{
  success: boolean
  examples?: EnhancedFewShotExample[]
  error?: string
}> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    let examples = await exampleRepository.getAll()

    // 应用筛选条件
    if (filter) {
      // 按来源筛选
      if (filter.source && filter.source !== 'all') {
        examples = examples.filter((ex) => ex.source === filter.source)
      }

      // 按质量分数筛选
      if (filter.minQualityScore !== undefined) {
        examples = examples.filter((ex) => ex.qualityScore >= filter.minQualityScore!)
      }

      // 按工具筛选（优先使用多选）
      const toolsToFilter = filter.toolNames || (filter.toolName ? [filter.toolName] : [])
      if (toolsToFilter.length > 0) {
        examples = examples.filter((ex) =>
          ex.toolsUsed.some((tool) => toolsToFilter.includes(tool))
        )
      }

      // 按日期范围筛选
      if (filter.dateRange) {
        const startDate = new Date(filter.dateRange.start).getTime()
        const endDate = new Date(filter.dateRange.end).getTime()
        examples = examples.filter((ex) => {
          const createdDate = new Date(ex.createdAt).getTime()
          return createdDate >= startDate && createdDate <= endDate
        })
      }

      // 搜索查询
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase()
        examples = examples.filter(
          (ex) =>
            ex.userQuery.toLowerCase().includes(query) ||
            ex.finalAnswer.toLowerCase().includes(query) ||
            ex.thought.toLowerCase().includes(query)
        )
      }

      // 排序
      const sortBy = filter.sortBy || 'quality'
      const sortOrder = filter.sortOrder || 'desc'
      examples.sort((a, b) => {
        let comparison = 0
        switch (sortBy) {
          case 'quality':
            comparison = a.qualityScore - b.qualityScore
            break
          case 'usage':
            comparison = a.usageCount - b.usageCount
            break
          case 'date':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            break
        }
        return sortOrder === 'asc' ? comparison : -comparison
      })
    }

    logger.info('获取示例列表成功', 'main', { count: examples.length })
    return { success: true, examples }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取示例列表失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 获取单个示例详情
export async function handleGetExample(
  _event: Electron.IpcMainInvokeEvent,
  id: string
): Promise<{
  success: boolean
  example?: EnhancedFewShotExample
  error?: string
}> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const example = await exampleRepository.getById(id)
    if (!example) {
      return { success: false, error: '示例不存在' }
    }

    return { success: true, example }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取示例详情失败', 'main', { error: errorMessage, id })
    return { success: false, error: errorMessage }
  }
}

// 更新示例
export async function handleUpdateExample(
  _event: Electron.IpcMainInvokeEvent,
  example: EnhancedFewShotExample
): Promise<{ success: boolean; error?: string }> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    await exampleRepository.update([example])

    logger.info('更新示例成功', 'main', { id: example.id })
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 批量删除示例
export async function handleDeleteExamples(
  _event: Electron.IpcMainInvokeEvent,
  ids: string[]
): Promise<{ success: boolean; error?: string; deleted?: number }> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const beforeCount = (await exampleRepository.getAll()).length
    await exampleRepository.delete(ids)
    const afterCount = (await exampleRepository.getAll()).length
    const deleted = beforeCount - afterCount

    logger.info('删除示例成功', 'main', { ids, deleted })
    return { success: true, deleted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('删除示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 导入示例
export async function handleImportExamples(
  _event: Electron.IpcMainInvokeEvent,
  json: string
): Promise<ImportResult> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const data = JSON.parse(json) as { examples: EnhancedFewShotExample[] }

    if (!Array.isArray(data.examples)) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['无效的数据格式：缺少 examples 数组']
      }
    }

    const allExamples = await exampleRepository.getAll()
    const existingIds = new Set(allExamples.map((ex) => ex.id))

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const example of data.examples) {
      // 验证必需字段
      if (!example.id || !example.userQuery || !example.finalAnswer) {
        errors.push(`示例缺少必需字段: ${example.id || '未知'}`)
        continue
      }

      if (existingIds.has(example.id)) {
        skipped++
      } else {
        imported++
      }
    }

    // 执行导入
    await exampleRepository.importFromJSON(json)

    logger.info('导入示例成功', 'main', { imported, skipped, errors: errors.length })
    return {
      success: true,
      imported,
      skipped,
      errors
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导入示例失败', 'main', { error: errorMessage })
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [errorMessage]
    }
  }
}

// 导出示例
export async function handleExportExamples(): Promise<{
  success: boolean
  json?: string
  error?: string
}> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    const json = await exampleRepository.exportAsJSON()

    logger.info('导出示例成功')
    return { success: true, json }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('导出示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 从会话提取示例
export async function handleExtractFromSessions(): Promise<{
  success: boolean
  result?: { extracted: number }
  error?: string
}> {
  try {
    const { exampleManager } = await import('../../services/chat/examples')
    const { sessionService } = await import('../../services/session')

    // 确保会话服务已初始化
    sessionService.initialize()

    // 异步加载全部会话，避免主线程长时间阻塞
    const sessions = await sessionService.loadAllSessionsAsync()

    if (sessions.length === 0) {
      return { success: true, result: { extracted: 0 } }
    }

    // 使用 exampleManager 提取并评分示例
    const extractionResult = await exampleManager.extractAndScoreFromSessionsAsync(sessions, {
      minQualityScore: 0.5,
      maxExamples: 100
    })

    if (extractionResult.examples.length > 0) {
      // 将提取的示例添加到仓库
      const { exampleRepository } = await import('../../services/chat/examples')
      await exampleRepository.initialize()
      await exampleRepository.add(extractionResult.examples)
    }

    logger.info('从会话提取示例成功', 'main', {
      sessionsProcessed: extractionResult.processedSessions,
      examplesExtracted: extractionResult.examples.length
    })

    return { success: true, result: { extracted: extractionResult.examples.length } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('从会话提取示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// 清空动态示例
export async function handleClearDynamicExamples(): Promise<{
  success: boolean
  deletedCount?: number
  error?: string
}> {
  try {
    const { exampleRepository } = await import('../../services/chat/examples')
    await exampleRepository.initialize()

    // 获取清空前的动态示例数量
    const beforeStats = await exampleRepository.getStats()
    const beforeDynamicCount = beforeStats.dynamic

    // 清空动态示例
    await exampleRepository.clearDynamicExamples()

    // 获取清空后的统计
    const afterStats = await exampleRepository.getStats()
    const deletedCount = beforeDynamicCount - afterStats.dynamic

    logger.info('清空动态示例成功', 'main', { deletedCount })

    return { success: true, deletedCount }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('清空动态示例失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// ============ 测试沙盘 Handlers ============

/**
 * 预览组装后的提示词（不调用模型）
 */
export async function handlePromptPreview(
  _event: Electron.IpcMainInvokeEvent,
  payload: TestPromptPayload
): Promise<{ success: boolean; prompt?: string; error?: string }> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    const promptConfig: PromptConfig = {
      ...createDefaultPromptConfig(),
      ...config.promptConfig,
      customVariables: normalizeCustomPromptVariables(config.promptConfig?.customVariables)
    }
    const assembledPrompt = await buildSandboxPrompt(payload, promptConfig)

    logger.info('预览提示词成功', 'main', { promptLength: assembledPrompt.length })
    return { success: true, prompt: assembledPrompt }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('预览提示词失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * 执行测试（调用模型）
 */
export async function handlePromptTest(
  _event: Electron.IpcMainInvokeEvent,
  payload: TestPromptPayload
): Promise<TestPromptResult> {
  try {
    // 先获取预览提示词
    const previewResult = await handlePromptPreview(_event, payload)
    if (!previewResult.success || !previewResult.prompt) {
      return { success: false, error: previewResult.error || '生成提示词失败' }
    }

    const assembledPrompt = previewResult.prompt

    // 获取配置
    const config = configManager.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    // 获取 LLM 配置
    const modelKey = payload.selectedModel || config.llm_config?.default_model
    const llmConfig = config.llm_config?.models?.find((m) => m.model_name === modelKey)
    if (!llmConfig) {
      return { success: false, error: `模型配置不存在: ${modelKey}` }
    }

    // 创建 OpenAI 客户端
    const client = new OpenAI({
      apiKey: llmConfig.api_key,
      baseURL: llmConfig.base_url,
      timeout: 60000
    })

    const startTime = Date.now()

    // 调用模型（非流式）
    const response = await client.chat.completions.create({
      model: llmConfig.model_name,
      messages: [{ role: 'user', content: assembledPrompt }],
      temperature: payload.temperature ?? llmConfig.temperature ?? 0.7,
      max_tokens: llmConfig.max_tokens || 2000,
      stream: false
    })

    const duration = Date.now() - startTime
    const choice = response.choices[0]
    const content = choice?.message?.content || ''

    // 获取 token 使用量
    const tokenUsage = response.usage
      ? {
          prompt: response.usage.prompt_tokens,
          completion: response.usage.completion_tokens,
          total: response.usage.total_tokens
        }
      : undefined

    logger.info('测试沙盘执行成功', 'main', {
      duration,
      tokenUsage,
      responseLength: content.length
    })

    return {
      success: true,
      assembledPrompt,
      response: content,
      tokenUsage,
      duration,
      modelUsed: llmConfig.model_name,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('测试沙盘执行失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}
