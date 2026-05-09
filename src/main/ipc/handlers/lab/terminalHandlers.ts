import { BrowserWindow, ipcMain } from 'electron'
import type { DockerTerminalSize } from '@shared/types/lab'
import { getLabServices, normalizeLabError } from './shared'
import { logger } from '@main/services/logger'

function broadcastTerminalEvent(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* 窗口可能已销毁 */
    }
  }
}

export function registerLabTerminalHandlers(): void {
  const { dockerService } = getLabServices()

  dockerService.onTerminalData((event) => {
    broadcastTerminalEvent('lab:terminal:data', event)
  })

  dockerService.onTerminalExit((event) => {
    broadcastTerminalEvent('lab:terminal:exit', event)
  })

  ipcMain.handle(
    'lab:terminal:open',
    async (_event, containerId: string, size?: DockerTerminalSize) => {
      try {
        return await dockerService.openTerminal(containerId, size)
      } catch (error) {
        const errorMessage = normalizeLabError(error, '打开 Docker 终端失败')
        logger.error('打开 Docker 终端失败', 'main', { containerId, error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('lab:terminal:write', async (_event, sessionId: string, data: string) => {
    return dockerService.writeTerminal(sessionId, data)
  })

  ipcMain.handle(
    'lab:terminal:resize',
    async (_event, sessionId: string, size: DockerTerminalSize) => {
      return dockerService.resizeTerminal(sessionId, size)
    }
  )

  ipcMain.handle('lab:terminal:close', async (_event, sessionId: string) => {
    return dockerService.closeTerminal(sessionId)
  })
}
