/** SSH 认证类型 */
export type SshAuthType = 'password' | 'key'

/** SSH 连接配置（持久化存储，密码不持久化，连接时单独传入） */
export interface SshConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: SshAuthType
  keyName?: string
  keyContent?: string
  lastUsedAt?: string
}

/** SSH 连接状态 */
export type SshConnectionStatus = 'connected' | 'disconnected' | 'connecting'

/** SSH 连接结果 */
export interface SshConnectResult {
  success: boolean
  error?: string
  status: SshConnectionStatus
}

/** SSH 配置保存请求 */
export interface SaveSshConfigRequest {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authType: SshAuthType
  keyName?: string
  keyContent?: string
}

/** SSH 配置保存结果 */
export interface SaveSshConfigResult {
  success: boolean
  config?: SshConnectionConfig
  error?: string
}

/** SSH 配置列表结果 */
export interface ListSshConfigsResult {
  success: boolean
  configs?: SshConnectionConfig[]
  error?: string
}

/** SSH 连接测试结果 */
export interface TestSshConnectionResult {
  success: boolean
  error?: string
  systemInfo?: {
    platform: string
    hostname: string
    homeDir: string
  }
}

/** SSH 连接状态变更事件（通过 IPC 推送） */
export interface SshConnectionStatusEvent {
  labId: string
  status: SshConnectionStatus
  error?: string
}

/** SSH 终端尺寸 */
export interface SshTerminalSize {
  cols: number
  rows: number
}

/** SSH 终端打开结果 */
export interface SshTerminalOpenResult {
  success: boolean
  sessionId?: string
  error?: string
}

/** SSH 终端操作结果 */
export interface SshTerminalActionResult {
  success: boolean
  error?: string
}

/** SSH 终端输出事件（通过 IPC 推送） */
export interface SshTerminalDataEvent {
  labId: string
  sessionId: string
  data: string
}

/** SSH 终端退出事件（通过 IPC 推送） */
export interface SshTerminalExitEvent {
  labId: string
  sessionId: string
  code?: number | null
  signal?: string
  reason?: string
}

/** SSH 远程服务器 GPU 统计 */
export interface SshGpuDeviceStats {
  index: number
  name?: string
  utilizationPercent: number | null
  memoryUsageBytes: number | null
  memoryTotalBytes: number | null
  memoryPercent: number | null
}

/** SSH 远程服务器资源统计 */
export interface SshServerStats {
  sampledAt: string
  cpu: {
    percent: number
  }
  memory: {
    // —— 主口径 ——
    usageBytes: number
    totalBytes: number
    availableBytes: number
    percent: number
    source: 'quota' | 'host'
    // —— 宿主机口径 ——
    hostUsageBytes: number
    hostTotalBytes: number
    hostAvailableBytes: number
    hostPercent: number
    // —— 配额口径（仅 cgroup 可信时填充）——
    quotaUsageBytes?: number
    quotaTotalBytes?: number
    quotaAvailableBytes?: number
    quotaPercent?: number
  }
  gpu: {
    supported: boolean
    utilizationPercent: number | null
    memoryUsageBytes: number | null
    memoryTotalBytes: number | null
    memoryPercent: number | null
    devices: SshGpuDeviceStats[]
    message?: string
  }
  diskIO: {
    readBytes: number
    writeBytes: number
    readBytesPerSecond: number
    writeBytesPerSecond: number
  }
}

/** SSH 远程服务器资源统计结果 */
export interface SshServerStatsResult {
  success: boolean
  stats?: SshServerStats
  error?: string
}

export type { ExecCommand, ExecResult, ExecCommandResult } from './container'
