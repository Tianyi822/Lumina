import { ipcMain, BrowserWindow } from 'electron'
import { sshService, sshStatsService, sshTerminalService } from '@main/services/lab/ssh'
import { labService } from '@main/services/lab/LabService'
import { logger } from '@main/services/logger'
import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SshConnectionStatus,
  ExecCommand,
  SshTerminalSize
} from '@shared/types/lab'

function syncSshLabStatus(labId: string, status: SshConnectionStatus): void {
  const lab = labService.loadLab(labId)
  if (!lab || lab.backendType !== 'ssh' || !lab.ssh) {
    return
  }

  const nextLabStatus =
    status === 'connected' ? 'running' : status === 'connecting' ? 'creating' : 'stopped'
  const nextConnected = status === 'connected'
  const shouldUpdate =
    lab.status !== nextLabStatus ||
    lab.ssh.connected !== nextConnected ||
    (nextConnected && !lab.ssh.lastConnectedAt)

  if (!shouldUpdate) {
    return
  }

  lab.status = nextLabStatus
  lab.ssh.connected = nextConnected
  if (nextConnected) {
    lab.ssh.lastConnectedAt = new Date().toISOString()
  }

  labService.saveLab(lab, { silent: true })
}

function broadcastSshEvent(channel: string, payload: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* 窗口可能已销毁 */
    }
  }
}

export function registerSshHandlers(): void {
  ipcMain.handle(
    'ssh:connect',
    async (_event, labId: string, config: SshConnectionConfig, password?: string) => {
      try {
        const result = await sshService.connect(labId, config, password)

        // 更新实验室元数据以反映连接状态
        const lab = labService.loadLab(labId)
        if (lab && lab.backendType === 'ssh' && lab.ssh) {
          lab.status = result.success ? 'running' : 'stopped'
          lab.ssh.connected = result.success
          lab.ssh.lastConnectedAt = result.success
            ? new Date().toISOString()
            : lab.ssh.lastConnectedAt
          labService.saveLab(lab)
        }

        return result
      } catch (error) {
        logger.error('ssh:connect 失败', 'main', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('ssh:disconnect', async (_event, labId: string) => {
    try {
      const result = await sshService.disconnect(labId)

      // 更新实验室元数据以反映断开状态
      const lab = labService.loadLab(labId)
      if (lab && lab.backendType === 'ssh' && lab.ssh) {
        lab.status = 'stopped'
        lab.ssh.connected = false
        labService.saveLab(lab)
      }

      return result
    } catch (error) {
      logger.error('ssh:disconnect 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('ssh:status', async (_event, labId: string) => {
    return { status: sshService.getConnectionStatus(labId) }
  })

  ipcMain.handle('ssh:stats', async (_event, labId: string) => {
    try {
      return await sshStatsService.getServerStats(labId)
    } catch (error) {
      logger.error('ssh:stats 失败', 'main', {
        labId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('ssh:exec', async (_event, labId: string, command: ExecCommand) => {
    try {
      const result = await sshService.execCommand(labId, command)
      if (!result) {
        return { success: false, error: 'SSH 连接不存在或未连接' }
      }
      return { success: true, result }
    } catch (error) {
      logger.error('ssh:exec 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  sshService.onConnectionStatusChange((labId, status, error) => {
    syncSshLabStatus(labId, status)

    broadcastSshEvent('ssh:connection-status', {
      labId,
      status,
      error
    } as SshConnectionStatusEvent)
  })

  sshTerminalService.onData((event) => {
    broadcastSshEvent('ssh:terminal:data', event)
  })

  sshTerminalService.onExit((event) => {
    broadcastSshEvent('ssh:terminal:exit', event)
  })

  ipcMain.handle(
    'ssh-config:test',
    async (_event, config: SshConnectionConfig, password?: string) =>
      sshService.testConnection(config, password)
  )

  ipcMain.handle('ssh:terminal:open', async (_event, labId: string, size?: SshTerminalSize) => {
    try {
      return await sshTerminalService.openTerminal(labId, size)
    } catch (error) {
      logger.error('ssh:terminal:open 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('ssh:terminal:write', async (_event, sessionId: string, data: string) => {
    return sshTerminalService.writeTerminal(sessionId, data)
  })

  ipcMain.handle(
    'ssh:terminal:resize',
    async (_event, sessionId: string, size: SshTerminalSize) => {
      return sshTerminalService.resizeTerminal(sessionId, size)
    }
  )

  ipcMain.handle('ssh:terminal:close', async (_event, sessionId: string) => {
    return sshTerminalService.closeTerminal(sessionId)
  })
}
