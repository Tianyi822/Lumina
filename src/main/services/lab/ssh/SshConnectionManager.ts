import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { logger } from '@main/services/logger'
import type { SshClient, ConnectionStatusListener } from './types'

const HEARTBEAT_INTERVAL = 30_000
const MAX_FAILED_HEARTBEATS = 3
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 1_000

export class SshConnectionManager {
  private clients = new Map<string, SshClient>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private listeners: ConnectionStatusListener[] = []

  async connect(
    labId: string,
    config: ConnectConfig
  ): Promise<{ success: boolean; error?: string }> {
    this.clearReconnectTimer(labId)

    if (this.clients.has(labId)) {
      await this.disconnect(labId)
    }

    const client = new Client()
    const sshClient: SshClient = {
      labId,
      client,
      sftpClient: null,
      status: 'connecting',
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      failedHeartbeats: 0,
      reconnectAttempts: 0,
      connectConfig: config
    }

    this.clients.set(labId, sshClient)

    return new Promise((resolve) => {
      let hasConnected = false
      let settled = false

      const finish = (result: { success: boolean; error?: string }): void => {
        if (settled) {
          return
        }
        settled = true
        resolve(result)
      }

      const timeout = setTimeout(() => {
        sshClient.status = 'disconnected'
        client.end()
        this.clients.delete(labId)
        if (this.clients.size === 0) {
          this.stopHeartbeat()
        }
        this.notifyListeners(labId, 'disconnected', '连接超时')
        finish({ success: false, error: 'SSH 连接超时' })
      }, 30_000)

      client.on('ready', () => {
        clearTimeout(timeout)
        hasConnected = true
        sshClient.status = 'connected'
        sshClient.connectedAt = new Date().toISOString()
        sshClient.lastHeartbeat = new Date().toISOString()
        sshClient.reconnectAttempts = 0
        this.notifyListeners(labId, 'connected')
        this.startHeartbeat()
        logger.info('SSH 连接建立成功', 'main', { labId })
        finish({ success: true })
      })

      client.on('error', (err: Error) => {
        clearTimeout(timeout)
        sshClient.status = 'disconnected'
        logger.warn('SSH 连接错误', 'main', { labId, error: err.message })
        this.notifyListeners(labId, 'disconnected', err.message)
        if (!hasConnected) {
          this.clients.delete(labId)
          if (this.clients.size === 0) {
            this.stopHeartbeat()
          }
          finish({ success: false, error: `SSH 连接失败: ${err.message}` })
          return
        }
        this.attemptReconnect(labId)
      })

      client.on('close', () => {
        if (!hasConnected) {
          clearTimeout(timeout)
          this.clients.delete(labId)
          if (this.clients.size === 0) {
            this.stopHeartbeat()
          }
          finish({ success: false, error: 'SSH 连接已关闭' })
          return
        }
        if (sshClient.status === 'connected') {
          sshClient.status = 'disconnected'
          this.notifyListeners(labId, 'disconnected', '连接已关闭')
          this.attemptReconnect(labId)
        }
      })

      try {
        client.connect(config)
      } catch (err) {
        clearTimeout(timeout)
        sshClient.status = 'disconnected'
        this.clients.delete(labId)
        finish({
          success: false,
          error: `SSH 连接失败: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    })
  }

  /**
   * 断开指定 SSH 连接并清理客户端资源
   */
  async disconnect(labId: string): Promise<{ success: boolean; error?: string }> {
    this.clearReconnectTimer(labId)

    const sshClient = this.clients.get(labId)
    if (!sshClient) {
      return { success: false, error: '未找到连接' }
    }

    try {
      sshClient.status = 'disconnected'
      sshClient.client.end()
      this.clients.delete(labId)
      this.notifyListeners(labId, 'disconnected', '主动断开')
      logger.info('SSH 连接已断开', 'main', { labId })

      // 无活跃连接时停止心跳
      if (this.clients.size === 0) {
        this.stopHeartbeat()
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  getClient(labId: string): Client | null {
    return this.clients.get(labId)?.client ?? null
  }

  getStatus(labId: string): 'connected' | 'disconnected' | 'connecting' {
    return this.clients.get(labId)?.status ?? 'disconnected'
  }

  /**
   * 检查是否已连接
   */
  isConnected(labId: string): boolean {
    return this.getStatus(labId) === 'connected'
  }

  /**
   * 注册连接状态变化监听器
   */
  onStatusChange(listener: ConnectionStatusListener): void {
    this.listeners.push(listener)
  }

  /**
   * 移除连接状态变化监听器
   */
  offStatusChange(listener: ConnectionStatusListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  /**
   * 断开所有 SSH 连接并停止心跳
   */
  async disconnectAll(): Promise<void> {
    const labIds = Array.from(new Set([...this.clients.keys(), ...this.reconnectTimers.keys()]))
    await Promise.all(labIds.map((id) => this.disconnect(id).catch(() => {})))
    this.stopHeartbeat()
  }

  private notifyListeners(
    labId: string,
    status: 'connected' | 'disconnected' | 'connecting',
    error?: string
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(labId, status, error)
      } catch {
        /* 忽略监听器错误 */
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return

    this.heartbeatTimer = setInterval(() => {
      for (const [labId, sshClient] of this.clients) {
        if (sshClient.status !== 'connected') continue

        sshClient.client.exec('echo ok', (err) => {
          if (err) {
            sshClient.failedHeartbeats++
            sshClient.lastHeartbeat = new Date().toISOString()
            logger.warn('SSH 心跳失败', 'main', { labId, failedCount: sshClient.failedHeartbeats })

            if (sshClient.failedHeartbeats >= MAX_FAILED_HEARTBEATS) {
              logger.warn('SSH 心跳连续失败，标记为断开', 'main', { labId })
              sshClient.status = 'disconnected'
              this.notifyListeners(labId, 'disconnected', '心跳检测失败')
              this.attemptReconnect(labId)
            }
          } else {
            sshClient.failedHeartbeats = 0
            sshClient.lastHeartbeat = new Date().toISOString()
          }
        })
      }
    }, HEARTBEAT_INTERVAL)
    this.heartbeatTimer.unref?.()
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearReconnectTimer(labId: string): void {
    const timer = this.reconnectTimers.get(labId)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    this.reconnectTimers.delete(labId)
  }

  private attemptReconnect(labId: string): void {
    const sshClient = this.clients.get(labId)
    if (!sshClient || sshClient.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn('SSH 重连次数已达上限', 'main', { labId })
      return
    }

    if (!sshClient.connectConfig) {
      logger.warn('SSH 重连缺少连接配置', 'main', { labId })
      return
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, sshClient.reconnectAttempts)
    sshClient.reconnectAttempts++
    sshClient.status = 'connecting'
    this.notifyListeners(labId, 'connecting')

    logger.info('SSH 尝试自动重连', 'main', {
      labId,
      attempt: sshClient.reconnectAttempts,
      delayMs: delay
    })

    const savedConfig = sshClient.connectConfig
    this.clearReconnectTimer(labId)

    const reconnectTimer = setTimeout(() => {
      this.reconnectTimers.delete(labId)

      const current = this.clients.get(labId)
      if (!current || current.status !== 'connecting') return

      const newClient = new Client()
      current.client = newClient

      newClient.on('ready', () => {
        current.status = 'connected'
        current.connectedAt = new Date().toISOString()
        current.lastHeartbeat = new Date().toISOString()
        current.reconnectAttempts = 0
        current.failedHeartbeats = 0
        this.notifyListeners(labId, 'connected')
        this.startHeartbeat()
        logger.info('SSH 自动重连成功', 'main', { labId })
      })

      newClient.on('error', (err: Error) => {
        current.status = 'disconnected'
        logger.warn('SSH 重连连接错误', 'main', { labId, error: err.message })
        this.notifyListeners(labId, 'disconnected', err.message)
        this.attemptReconnect(labId)
      })

      newClient.on('close', () => {
        if (current.status === 'connected') {
          current.status = 'disconnected'
          this.notifyListeners(labId, 'disconnected', '连接已关闭')
          this.attemptReconnect(labId)
        }
      })

      try {
        newClient.connect(savedConfig)
      } catch (err) {
        current.status = 'disconnected'
        logger.warn('SSH 重连连接调用失败', 'main', {
          labId,
          error: err instanceof Error ? err.message : String(err)
        })
        this.attemptReconnect(labId)
      }
    }, delay)
    reconnectTimer.unref?.()
    this.reconnectTimers.set(labId, reconnectTimer)
  }
}

export const sshConnectionManager = new SshConnectionManager()
