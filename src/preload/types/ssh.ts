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

export type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SshConnectResult,
  SshServerStats,
  SshServerStatsResult,
  SshGpuDeviceStats,
  TestSshConnectionResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

/** SSH 配置相关 API */
export interface SshConfigApi {
  /** 测试 SSH 连接配置是否有效 */
  test: (config: SshConnectionConfig, password?: string) => Promise<TestSshConnectionResult>
}

/** SSH 终端相关 API */
export interface SshTerminalApi {
  /** 打开 SSH 终端会话 */
  open: (labId: string, size?: SshTerminalSize) => Promise<SshTerminalOpenResult>
  /** 向 SSH 终端写入数据 */
  write: (sessionId: string, data: string) => Promise<SshTerminalActionResult>
  /** 调整 SSH 终端窗口大小 */
  resize: (sessionId: string, size: SshTerminalSize) => Promise<SshTerminalActionResult>
  /** 关闭 SSH 终端会话 */
  close: (sessionId: string) => Promise<SshTerminalActionResult>
  /** 监听 SSH 终端数据事件 */
  onData: (callback: (event: SshTerminalDataEvent) => void) => () => void
  /** 监听 SSH 终端退出事件 */
  onExit: (callback: (event: SshTerminalExitEvent) => void) => () => void
}

/** SSH 远程服务器相关 API */
export interface SshApi {
  /** 连接到 SSH 服务器 */
  connect: (
    labId: string,
    config: SshConnectionConfig,
    password?: string
  ) => Promise<SshConnectResult>
  /** 断开 SSH 连接 */
  disconnect: (labId: string) => Promise<{ success: boolean; error?: string }>
  /** 获取 SSH 连接状态 */
  getStatus: (labId: string) => Promise<{ status: string }>
  /** 获取 SSH 服务器资源统计信息 */
  getServerStats: (labId: string) => Promise<SshServerStatsResult>
  /** 在 SSH 服务器上执行命令 */
  exec: (labId: string, command: ExecCommand) => Promise<ExecCommandResult>
  /** 监听 SSH 连接状态变化事件 */
  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void) => () => void
  /** SSH 终端操作 */
  terminal: SshTerminalApi
  /** SSH 配置操作 */
  config: SshConfigApi
}
