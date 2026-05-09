/** SSH 认证类型 */
export type SshAuthType = 'password' | 'key'

/** SSH 连接配置（持久化存储） */
export interface SshConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: SshAuthType
  password?: string
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
  password?: string
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
