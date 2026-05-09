import { ipcMain, BrowserWindow } from 'electron'
import { sshService, sshConfigService } from '@main/services/lab/ssh'
import { labService } from '@main/services/lab/LabService'
import { logger } from '@main/services/logger'
import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SaveSshConfigRequest,
  ExecCommand
} from '@shared/types/lab'

export function registerSshHandlers(): void {
  ipcMain.handle(
    'ssh:connect',
    async (_event, labId: string, config: SshConnectionConfig) => {
      try {
        const result = await sshService.connect(labId, config)

        // 更新实验室元数据以反映连接状态
        const lab = labService.loadLab(labId)
        if (lab && lab.backendType === 'ssh' && lab.ssh) {
          lab.status = result.success ? 'running' : 'stopped'
          lab.ssh.connected = result.success
          lab.ssh.lastConnectedAt = result.success ? new Date().toISOString() : lab.ssh.lastConnectedAt
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

  ipcMain.handle(
    'ssh:exec',
    async (_event, labId: string, command: ExecCommand) => {
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
    }
  )

  sshService.onConnectionStatusChange((labId, status, error) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      try {
        win.webContents.send('ssh:connection-status', {
          labId,
          status,
          error
        } as SshConnectionStatusEvent)
      } catch {
        /* 窗口可能已销毁 */
      }
    }
  })

  ipcMain.handle('ssh-config:list', async () => sshConfigService.list())
  ipcMain.handle(
    'ssh-config:save',
    async (_event, request: SaveSshConfigRequest) => sshConfigService.save(request)
  )
  ipcMain.handle('ssh-config:delete', async (_event, id: string) => sshConfigService.delete(id))
  ipcMain.handle(
    'ssh-config:test',
    async (_event, config: SshConnectionConfig) => sshService.testConnection(config)
  )
}
