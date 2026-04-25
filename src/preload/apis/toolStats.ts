import { ipcRenderer } from 'electron'
import type { TimeRange } from '@shared/types/tool-stats'
import type { ToolStatsApi } from '../types/toolStats'

export const toolStatsApi: ToolStatsApi = {
  getAll: (timeRange?: TimeRange) => {
    return ipcRenderer.invoke('tool-stats:getAll', timeRange)
  },
  getByTool: (toolName: string, timeRange?: TimeRange) => {
    return ipcRenderer.invoke('tool-stats:getByTool', toolName, timeRange)
  },
  getBySession: (sessionId: string) => {
    return ipcRenderer.invoke('tool-stats:getBySession', sessionId)
  },
  getTopTools: (limit?: number) => {
    return ipcRenderer.invoke('tool-stats:getTopTools', limit)
  },
  getSlowestTools: (limit?: number) => {
    return ipcRenderer.invoke('tool-stats:getSlowestTools', limit)
  },
  clear: () => {
    return ipcRenderer.invoke('tool-stats:clear')
  }
}
