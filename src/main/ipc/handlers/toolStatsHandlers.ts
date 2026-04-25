import { ipcMain, app } from 'electron'
import { toolStatsCollector } from '../../services/chat/tools/ToolStatsCollector'
import type { TimeRange } from '@shared/types/tool-stats'

/**
 * 注册工具统计相关 IPC 处理程序
 */
export function registerToolStatsHandlers(): void {
  // 启动统计收集器（加载历史 + 定期持久化）
  toolStatsCollector.startPersist()

  // 应用退出时确保数据写入磁盘
  app.on('will-quit', () => {
    toolStatsCollector.stopPersist()
  })

  ipcMain.handle('tool-stats:getAll', async (_, timeRange?: TimeRange) => {
    return toolStatsCollector.getAllStats(timeRange)
  })

  ipcMain.handle('tool-stats:getByTool', async (_, toolName: string, timeRange?: TimeRange) => {
    return toolStatsCollector.getToolStats(toolName, timeRange)
  })

  ipcMain.handle('tool-stats:getBySession', async (_, sessionId: string) => {
    return toolStatsCollector.getSessionStats(sessionId)
  })

  ipcMain.handle('tool-stats:getTopTools', async (_, limit: number = 10) => {
    return toolStatsCollector.getTopTools(limit)
  })

  ipcMain.handle('tool-stats:getSlowestTools', async (_, limit: number = 10) => {
    return toolStatsCollector.getSlowestTools(limit)
  })

  ipcMain.handle('tool-stats:clear', async () => {
    toolStatsCollector.clear()
    return { success: true }
  })
}
