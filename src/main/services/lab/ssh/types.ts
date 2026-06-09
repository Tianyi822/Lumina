import type { Client, ConnectConfig } from 'ssh2'

/** SSH 客户端连接状态 */
export interface SshClient {
  labId: string
  client: Client
  sftpClient: Client | null
  status: 'connected' | 'disconnected' | 'connecting'
  connectedAt: string
  lastHeartbeat: string
  failedHeartbeats: number
  reconnectAttempts: number
  connectConfig?: ConnectConfig
}

/** 连接状态变化监听器回调 */
export type ConnectionStatusListener = (
  labId: string,
  status: 'connected' | 'disconnected' | 'connecting',
  error?: string
) => void
