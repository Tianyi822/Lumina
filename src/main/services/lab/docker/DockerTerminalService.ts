import { randomUUID } from 'crypto'
import type { Duplex } from 'stream'
import { logger } from '@main/services/logger'
import type {
  DockerTerminalActionResult,
  DockerTerminalDataEvent,
  DockerTerminalExitEvent,
  DockerTerminalOpenResult,
  DockerTerminalSize
} from '@shared/types/lab'
import type { DockerServiceContext } from './types'

interface DockerTerminalExec {
  resize(options: { h: number; w: number }): Promise<unknown>
}

interface DockerTerminalSession {
  sessionId: string
  containerId: string
  exec: DockerTerminalExec
  stream: Duplex
  closed: boolean
}

type DockerTerminalDataListener = (event: DockerTerminalDataEvent) => void
type DockerTerminalExitListener = (event: DockerTerminalExitEvent) => void

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export class DockerTerminalService {
  private readonly context: DockerServiceContext
  private readonly sessions = new Map<string, DockerTerminalSession>()
  private readonly containerSessions = new Map<string, Set<string>>()
  private readonly dataListeners = new Set<DockerTerminalDataListener>()
  private readonly exitListeners = new Set<DockerTerminalExitListener>()

  constructor(context: DockerServiceContext) {
    this.context = context
  }

  async openTerminal(
    containerId: string,
    size?: DockerTerminalSize
  ): Promise<DockerTerminalOpenResult> {
    const terminalSize = this.normalizeSize(size)

    try {
      const container = this.context.getDocker().getContainer(containerId)
      const inspect = await container.inspect()
      if (!inspect.State?.Running) {
        return { success: false, error: '容器未运行，无法打开终端' }
      }

      const exec = await container.exec({
        Cmd: [
          'sh',
          '-lc',
          'if command -v bash >/dev/null 2>&1; then exec bash -l; else exec sh; fi'
        ],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        ConsoleSize: [terminalSize.rows, terminalSize.cols],
        WorkingDir: inspect.Config?.WorkingDir || undefined
      })

      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true
      })
      const sessionId = `docker-terminal-${randomUUID()}`
      const session: DockerTerminalSession = {
        sessionId,
        containerId,
        exec,
        stream,
        closed: false
      }

      this.sessions.set(sessionId, session)
      this.addContainerSession(containerId, sessionId)
      this.bindStream(session)

      logger.info('Docker 终端已打开', 'main', { containerId, sessionId })
      return { success: true, sessionId }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('打开 Docker 终端失败', 'main', { containerId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  writeTerminal(sessionId: string, data: string): DockerTerminalActionResult {
    const session = this.sessions.get(sessionId)
    if (!session || session.closed) {
      return { success: false, error: 'Docker 终端会话不存在' }
    }

    try {
      session.stream.write(data)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async resizeTerminal(
    sessionId: string,
    size: DockerTerminalSize
  ): Promise<DockerTerminalActionResult> {
    const session = this.sessions.get(sessionId)
    if (!session || session.closed) {
      return { success: false, error: 'Docker 终端会话不存在' }
    }

    const terminalSize = this.normalizeSize(size)
    try {
      await session.exec.resize({
        h: terminalSize.rows,
        w: terminalSize.cols
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  closeTerminal(sessionId: string): DockerTerminalActionResult {
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

  closeContainerTerminals(containerId: string, reason: string): void {
    const sessionIds = Array.from(this.containerSessions.get(containerId) || [])
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)
      if (session) {
        this.closeSession(session, { closeStream: true, reason })
      }
    }
  }

  shutdown(): void {
    for (const session of Array.from(this.sessions.values())) {
      this.closeSession(session, {
        closeStream: true,
        reason: 'Docker 服务关闭'
      })
    }
  }

  onData(listener: DockerTerminalDataListener): void {
    this.dataListeners.add(listener)
  }

  offData(listener: DockerTerminalDataListener): void {
    this.dataListeners.delete(listener)
  }

  onExit(listener: DockerTerminalExitListener): void {
    this.exitListeners.add(listener)
  }

  offExit(listener: DockerTerminalExitListener): void {
    this.exitListeners.delete(listener)
  }

  private bindStream(session: DockerTerminalSession): void {
    session.stream.on('data', (chunk: Buffer | string) => {
      this.emitData({
        containerId: session.containerId,
        sessionId: session.sessionId,
        data: typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      })
    })

    session.stream.once('error', (error: Error) => {
      this.closeSession(session, {
        closeStream: false,
        reason: error.message
      })
    })

    session.stream.once('end', () => {
      this.closeSession(session, {
        closeStream: false,
        reason: '终端已结束'
      })
    })

    session.stream.once('close', () => {
      this.closeSession(session, {
        closeStream: false,
        reason: '终端已关闭'
      })
    })
  }

  private closeSession(
    session: DockerTerminalSession,
    options: { closeStream: boolean; reason: string }
  ): void {
    if (session.closed) {
      return
    }

    session.closed = true
    this.sessions.delete(session.sessionId)
    this.removeContainerSession(session.containerId, session.sessionId)

    if (options.closeStream) {
      session.stream.destroy()
    }

    this.emitExit({
      containerId: session.containerId,
      sessionId: session.sessionId,
      reason: options.reason
    })

    logger.info('Docker 终端已关闭', 'main', {
      containerId: session.containerId,
      sessionId: session.sessionId,
      reason: options.reason
    })
  }

  private addContainerSession(containerId: string, sessionId: string): void {
    const sessions = this.containerSessions.get(containerId) || new Set<string>()
    sessions.add(sessionId)
    this.containerSessions.set(containerId, sessions)
  }

  private removeContainerSession(containerId: string, sessionId: string): void {
    const sessions = this.containerSessions.get(containerId)
    if (!sessions) {
      return
    }

    sessions.delete(sessionId)
    if (sessions.size === 0) {
      this.containerSessions.delete(containerId)
    }
  }

  private normalizeSize(size?: DockerTerminalSize): DockerTerminalSize {
    return {
      cols: this.clampInteger(size?.cols, DEFAULT_COLS, 2, 500),
      rows: this.clampInteger(size?.rows, DEFAULT_ROWS, 1, 200)
    }
  }

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

  private emitData(event: DockerTerminalDataEvent): void {
    for (const listener of this.dataListeners) {
      listener(event)
    }
  }

  private emitExit(event: DockerTerminalExitEvent): void {
    for (const listener of this.exitListeners) {
      listener(event)
    }
  }
}
