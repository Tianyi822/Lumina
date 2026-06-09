import { ipcRenderer } from 'electron'
import type { TimeRange, ToolStatsCategory } from '@shared/types/tool-stats'
import type { ToolStatsApi } from '../types/toolStats'

/**
 * 工具统计相关的 API
 */
export const toolStatsApi: ToolStatsApi = {
  /** 获取所有工具的统计概览 */
  getAll: (timeRange?: TimeRange) => {
    return ipcRenderer.invoke('tool-stats:getAll', timeRange)
  },
  /** 获取单个工具的详细统计 */
  getByTool: (toolName: string, timeRange?: TimeRange) => {
    return ipcRenderer.invoke('tool-stats:getByTool', toolName, timeRange)
  },
  /** 获取指定会话内的工具调用记录 */
  getBySession: (sessionId: string) => {
    return ipcRenderer.invoke('tool-stats:getBySession', sessionId)
  },
  /** 获取使用频率最高的工具排行 */
  getTopTools: (limit?: number) => {
    return ipcRenderer.invoke('tool-stats:getTopTools', limit)
  },
  /** 获取响应耗时最长的工具排行 */
  getSlowestTools: (limit?: number) => {
    return ipcRenderer.invoke('tool-stats:getSlowestTools', limit)
  },
  /** 清除所有历史统计数据 */
  clear: () => {
    return ipcRenderer.invoke('tool-stats:clear')
  },
  /** 按类别获取工具统计 */
  getByCategory: (category: ToolStatsCategory, timeRange?: TimeRange) => {
    return ipcRenderer.invoke('tool-stats:getByCategory', category, timeRange)
  }
}
