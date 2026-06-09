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

async function syncSshLabStatus(labId: string, status: SshConnectionStatus): Promise<void> {
  const lab = await labService.loadLab(labId)
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

  await labService.saveLab(lab, { silent: true })
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

/**
 * 注册 SSH 相关的 IPC 处理程序
 * 处理 SSH 连接/断开、命令执行、终端操作和配置测试等
 */
export function registerSshHandlers(): void {
  // 连接到 SSH 服务器
  ipcMain.handle(
    'ssh:connect',
    async (_event, labId: string, config: SshConnectionConfig, password?: string) => {
      try {
        const result = await sshService.connect(labId, config, password)

        // 更新实验室元数据以反映连接状态
        const lab = await labService.loadLab(labId)
        if (lab && lab.backendType === 'ssh' && lab.ssh) {
          lab.status = result.success ? 'running' : 'stopped'
          lab.ssh.connected = result.success
          lab.ssh.lastConnectedAt = result.success
            ? new Date().toISOString()
            : lab.ssh.lastConnectedAt
          await labService.saveLab(lab)
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

  // 断开 SSH 服务器连接
  ipcMain.handle('ssh:disconnect', async (_event, labId: string) => {
    try {
      const result = await sshService.disconnect(labId)

      // 更新实验室元数据以反映断开状态
      const lab = await labService.loadLab(labId)
      if (lab && lab.backendType === 'ssh' && lab.ssh) {
        lab.status = 'stopped'
        lab.ssh.connected = false
        await labService.saveLab(lab)
      }

      return result
    } catch (error) {
      logger.error('ssh:disconnect 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 获取 SSH 连接状态
  ipcMain.handle('ssh:status', async (_event, labId: string) => {
    return { status: sshService.getConnectionStatus(labId) }
  })

  // 获取 SSH 服务器资源统计信息
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

  // 在 SSH 服务器上执行命令
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

  sshService.onConnectionStatusChange(async (labId, status, error) => {
    try {
      await syncSshLabStatus(labId, status)
    } catch (err) {
      logger.error('SSH 状态同步回调异常', 'main', {
        labId,
        error: err instanceof Error ? err.message : String(err)
      })
    }

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

  // 测试 SSH 连接配置是否有效
  ipcMain.handle(
    'ssh-config:test',
    async (_event, config: SshConnectionConfig, password?: string) =>
      sshService.testConnection(config, password)
  )

  // 打开 SSH 终端会话
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

  // 向 SSH 终端写入数据
  ipcMain.handle('ssh:terminal:write', async (_event, sessionId: string, data: string) => {
    return sshTerminalService.writeTerminal(sessionId, data)
  })

  // 调整 SSH 终端窗口大小
  ipcMain.handle(
    'ssh:terminal:resize',
    async (_event, sessionId: string, size: SshTerminalSize) => {
      return sshTerminalService.resizeTerminal(sessionId, size)
    }
  )

  // 关闭 SSH 终端会话
  ipcMain.handle('ssh:terminal:close', async (_event, sessionId: string) => {
    return sshTerminalService.closeTerminal(sessionId)
  })
}
