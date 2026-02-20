import { ipcMain, BrowserWindow } from 'electron'
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
  cacheMonitor.on(
    'performance:warning',
    (data: { timestamp: number; score: number; threshold: number }) => {
      for (const webContentsId of cacheStatsSubscribers) {
        const win = BrowserWindow.fromWebContents(
          require('electron').webContents.fromId(webContentsId)
        )
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
