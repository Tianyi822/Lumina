import { randomUUID } from 'crypto'
import type { ClientChannel } from 'ssh2'
import { logger } from '@main/services/logger'
import type {
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'
import { sshConnectionManager } from './SshConnectionManager'
import type { ConnectionStatusListener } from './types'

/** SSH 终端会话实例 */
interface SshTerminalSession {
  sessionId: string
  labId: string
  stream: ClientChannel
  exitCode?: number | null
  signal?: string
  closed: boolean
}

type SshTerminalDataListener = (event: SshTerminalDataEvent) => void
type SshTerminalExitListener = (event: SshTerminalExitEvent) => void

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/**
 * SSH 终端服务
 * 管理远程服务器上的伪终端会话，支持打开、写入、调整大小和关闭
 */
export class SshTerminalService {
  /** 所有活跃终端会话 */
  private readonly sessions = new Map<string, SshTerminalSession>()
  private readonly labSessions = new Map<string, Set<string>>()
  private readonly dataListeners = new Set<SshTerminalDataListener>()
  private readonly exitListeners = new Set<SshTerminalExitListener>()

  private readonly statusListener: ConnectionStatusListener = (labId, status, error) => {
    if (status === 'disconnected') {
      this.closeLabTerminals(labId, error || 'SSH 连接已断开')
    }
  }

  constructor() {
    sshConnectionManager.onStatusChange(this.statusListener)
  }

  /**
   * 在远程服务器上打开一个伪终端（PTY）
   * @param labId - 实验室 ID
   * @param size - 终端窗口大小（列数和行数）
   * @returns 终端会话 ID
   */
  async openTerminal(labId: string, size?: SshTerminalSize): Promise<SshTerminalOpenResult> {
    const client = sshConnectionManager.getClient(labId)
    if (!client || !sshConnectionManager.isConnected(labId)) {
      return { success: false, error: 'SSH 连接不存在或未连接' }
    }

    const terminalSize = this.normalizeSize(size)

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: SshTerminalOpenResult): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        resolve(result)
      }

      const timeout = setTimeout(() => {
        finish({ success: false, error: 'SSH 终端打开超时' })
      }, 15_000)

      try {
        client.shell(
          {
            term: 'xterm-256color',
            cols: terminalSize.cols,
            rows: terminalSize.rows,
            width: terminalSize.cols * 8,
            height: terminalSize.rows * 18
          },
          (error, stream) => {
            if (error) {
              finish({ success: false, error: error.message })
              return
            }

            const sessionId = `ssh-terminal-${randomUUID()}`
            const session: SshTerminalSession = {
              sessionId,
              labId,
              stream,
              closed: false
            }

            this.sessions.set(sessionId, session)
            this.addLabSession(labId, sessionId)
            this.bindStream(session)

            logger.info('SSH 终端已打开', 'main', { labId, sessionId })
            finish({ success: true, sessionId })
          }
        )
      } catch (error) {
        finish({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  }

  /**
   * 向终端写入数据（如用户输入）
   */
  writeTerminal(sessionId: string, data: string): SshTerminalActionResult {
    const session = this.sessions.get(sessionId)
    if (!session || session.closed) {
      return { success: false, error: 'SSH 终端会话不存在' }
    }

    try {
      session.stream.write(data)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 调整终端窗口大小
   */
  resizeTerminal(sessionId: string, size: SshTerminalSize): SshTerminalActionResult {
    const session = this.sessions.get(sessionId)
    if (!session || session.closed) {
      return { success: false, error: 'SSH 终端会话不存在' }
    }

    const terminalSize = this.normalizeSize(size)
    try {
      session.stream.setWindow(
        terminalSize.rows,
        terminalSize.cols,
        terminalSize.rows * 18,
        terminalSize.cols * 8
      )
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 关闭指定终端会话
   */
  closeTerminal(sessionId: string): SshTerminalActionResult {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: true }
    }

    this.closeSession(session, {
      closeStream: true,
      reason: '客户端关闭终端'
    })
    return { success: true }
  }

  /**
   * 关闭指定实验室的所有终端会话
   * @param reason - 关闭原因（如连接断开）
   */
  closeLabTerminals(labId: string, reason: string): void {
    const sessionIds = Array.from(this.labSessions.get(labId) || [])
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)
      if (session) {
        this.closeSession(session, { closeStream: true, reason })
      }
    }
  }

  /**
   * 关闭所有终端会话
   */
  shutdown(): void {
    for (const session of Array.from(this.sessions.values())) {
      this.closeSession(session, {
        closeStream: true,
        reason: 'SSH 服务关闭'
      })
    }
  }

  /**
   * 注册终端数据监听器（接收远程服务器输出）
   */
  onData(listener: SshTerminalDataListener): void {
    this.dataListeners.add(listener)
  }

  /**
   * 移除终端数据监听器
   */
  offData(listener: SshTerminalDataListener): void {
    this.dataListeners.delete(listener)
  }

  /**
   * 注册终端退出监听器
   */
  onExit(listener: SshTerminalExitListener): void {
    this.exitListeners.add(listener)
  }

  /**
   * 移除终端退出监听器
   */
  offExit(listener: SshTerminalExitListener): void {
    this.exitListeners.delete(listener)
  }

  /**
   * 绑定终端数据流事件（数据接收、退出、错误、关闭）
   */
  private bindStream(session: SshTerminalSession): void {
    session.stream.on('data', (chunk: Buffer | string) => {
      this.emitData({
        labId: session.labId,
        sessionId: session.sessionId,
        data: typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      })
    })

    session.stream.once('exit', (code: number | null, signal?: string) => {
      session.exitCode = code
      session.signal = signal
    })

    session.stream.once('error', (error: Error) => {
      this.closeSession(session, {
        closeStream: false,
        reason: error.message
      })
    })

    session.stream.once('close', () => {
      this.closeSession(session, {
        closeStream: false,
        reason: '终端已关闭'
      })
    })
  }

  /**
   * 关闭会话并清理资源，通知退出监听器
   */
  private closeSession(
    session: SshTerminalSession,
    options: { closeStream: boolean; reason: string }
  ): void {
    // 防止重复关闭
    if (session.closed) {
      return
    }

    session.closed = true
    this.sessions.delete(session.sessionId)
    this.removeLabSession(session.labId, session.sessionId)

    if (options.closeStream) {
      try {
        session.stream.close()
      } catch {
        session.stream.destroy()
      }
    }

    this.emitExit({
      labId: session.labId,
      sessionId: session.sessionId,
      code: session.exitCode,
      signal: session.signal,
      reason: options.reason
    })

    logger.info('SSH 终端已关闭', 'main', {
      labId: session.labId,
      sessionId: session.sessionId,
      reason: options.reason
    })
  }

  private addLabSession(labId: string, sessionId: string): void {
    const sessions = this.labSessions.get(labId) || new Set<string>()
    sessions.add(sessionId)
    this.labSessions.set(labId, sessions)
  }

  private removeLabSession(labId: string, sessionId: string): void {
    const sessions = this.labSessions.get(labId)
    if (!sessions) {
      return
    }

    sessions.delete(sessionId)
    if (sessions.size === 0) {
      this.labSessions.delete(labId)
    }
  }

  /**
   * 规范终端大小，使用默认值填充缺失的维度
   */
  private normalizeSize(size?: SshTerminalSize): SshTerminalSize {
    return {
      cols: this.clampInteger(size?.cols, DEFAULT_COLS, 2, 500),
      rows: this.clampInteger(size?.rows, DEFAULT_ROWS, 1, 200)
    }
  }

  /**
   * 将整数值限制在指定范围内
   */
  private clampInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    if (!Number.isFinite(value)) {
      return fallback
    }

    return Math.min(max, Math.max(min, Math.floor(value as number)))
  }

  private emitData(event: SshTerminalDataEvent): void {
    for (const listener of this.dataListeners) {
      listener(event)
    }
  }

  private emitExit(event: SshTerminalExitEvent): void {
    for (const listener of this.exitListeners) {
      listener(event)
    }
  }
}

export const sshTerminalService = new SshTerminalService()
