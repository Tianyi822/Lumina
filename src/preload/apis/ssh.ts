import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'
import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  TestSshConnectionResult,
  ExecCommand,
  ExecCommandResult,
  SshConnectResult,
  SshServerStatsResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

/**
 * SSH 远程服务器相关的 API
 */
export const sshApi = {
  /** 连接到 SSH 服务器 */
  connect: (
    labId: string,
    config: SshConnectionConfig,
    password?: string
  ): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:connect', labId, config, password),

  /** 断开 SSH 连接 */
  disconnect: (labId: string) => ipcRenderer.invoke('ssh:disconnect', labId),

  /** 获取 SSH 连接状态 */
  getStatus: (labId: string) => ipcRenderer.invoke('ssh:status', labId),

  /** 获取 SSH 服务器资源统计信息 */
  getServerStats: (labId: string): Promise<SshServerStatsResult> =>
    ipcRenderer.invoke('ssh:stats', labId),

  /** 在 SSH 服务器上执行命令 */
  exec: (labId: string, command: ExecCommand): Promise<ExecCommandResult> =>
    ipcRenderer.invoke('ssh:exec', labId, command),

  /** 监听 SSH 连接状态变化事件 */
  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void): (() => void) => {
    return createIpcListener<SshConnectionStatusEvent>('ssh:connection-status', callback)
  },

  /** SSH 终端相关操作 */
  terminal: {
    /** 打开 SSH 终端会话 */
    open: (labId: string, size?: SshTerminalSize): Promise<SshTerminalOpenResult> =>
      ipcRenderer.invoke('ssh:terminal:open', labId, size),
    /** 向 SSH 终端写入数据 */
    write: (sessionId: string, data: string): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:write', sessionId, data),
    /** 调整 SSH 终端窗口大小 */
    resize: (sessionId: string, size: SshTerminalSize): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:resize', sessionId, size),
    /** 关闭 SSH 终端会话 */
    close: (sessionId: string): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:close', sessionId),
    /** 监听 SSH 终端数据事件 */
    onData: (callback: (event: SshTerminalDataEvent) => void): (() => void) =>
      createIpcListener<SshTerminalDataEvent>('ssh:terminal:data', callback),
    /** 监听 SSH 终端退出事件 */
    onExit: (callback: (event: SshTerminalExitEvent) => void): (() => void) =>
      createIpcListener<SshTerminalExitEvent>('ssh:terminal:exit', callback)
  },

  /** SSH 配置相关操作 */
  config: {
    /** 测试 SSH 连接配置是否有效 */
    test: (config: SshConnectionConfig, password?: string): Promise<TestSshConnectionResult> =>
      ipcRenderer.invoke('ssh-config:test', config, password)
  }
}
