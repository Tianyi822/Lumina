import { ipcMain, BrowserWindow } from 'electron'
import { sshService, sshConfigService } from '@main/services/lab/ssh'
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
        return await sshService.connect(labId, config)
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
      return await sshService.disconnect(labId)
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
