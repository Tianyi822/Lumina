import type { Client, ConnectConfig } from 'ssh2'

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

export type ConnectionStatusListener = (
  labId: string,
  status: 'connected' | 'disconnected' | 'connecting',
  error?: string
) => void
