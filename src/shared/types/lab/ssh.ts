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
