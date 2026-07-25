import type { WriterResult } from '@shared/types/writer'

const WRITER_FLUSH_REQUEST_CHANNEL = 'writer:flush-request'

type WriterFlushWarningReason = 'destroyed' | 'timeout'

interface WriterFlushCoordinatorOptions {
  send: (webContentsId: number, channel: string) => boolean | void
  timeoutMs: number
  warn?: (webContentsId: number, reason: WriterFlushWarningReason) => void
}

interface PendingFlush {
  timeoutId: ReturnType<typeof setTimeout>
  resolve: () => void
}

interface WriterFlushAckEvent {
  sender: {
    id: unknown
  }
}

interface WriterFlushWindow {
  isDestroyed: () => boolean
  webContents: {
    id: number
    isDestroyed: () => boolean
    send: (channel: string) => unknown
  }
}

interface WriterWindowCloseEvent {
  preventDefault: () => void
}

interface WriterWindowCloseOptions {
  isShutdownRequested: () => boolean
  isQuittingForUpdate: () => boolean
  requestShutdown: () => void
}

/** 将 ACK 绑定到 Electron 认证的发送方，不接受 Renderer 自报目标 ID */
export function acknowledgeWriterFlushFromEvent(
  event: WriterFlushAckEvent,
  acknowledge: (webContentsId: number) => void
): WriterResult<void> {
  if (!Number.isInteger(event.sender.id) || (event.sender.id as number) <= 0) {
    return { success: false, code: 'invalid_input', error: '无效的 Renderer ID' }
  }
  acknowledge(event.sender.id as number)
  return { success: true }
}

/** 在发送瞬间重新检查窗口与 webContents 存活状态 */
export function sendWriterFlushRequestToWindow(
  windows: WriterFlushWindow[],
  webContentsId: number,
  channel: string
): boolean {
  const target = windows.find((window) => window.webContents.id === webContentsId)
  if (!target || target.isDestroyed() || target.webContents.isDestroyed()) {
    return false
  }
  target.webContents.send(channel)
  return true
}

/** 首次窗口关闭进入统一退出流程，清理完成后的再次关闭直接放行 */
export function handleWriterWindowClose(
  event: WriterWindowCloseEvent,
  options: WriterWindowCloseOptions
): void {
  if (options.isShutdownRequested() || options.isQuittingForUpdate()) {
    return
  }
  event.preventDefault()
  options.requestShutdown()
}

/** 协调主进程退出前的 Renderer 最终保存握手 */
export class WriterFlushCoordinator {
  private readonly send: WriterFlushCoordinatorOptions['send']
  private readonly timeoutMs: number
  private readonly warn: NonNullable<WriterFlushCoordinatorOptions['warn']>
  private readonly pending = new Map<number, PendingFlush>()
  private activeFlush: Promise<void> | null = null

  constructor(options: WriterFlushCoordinatorOptions) {
    this.send = options.send
    this.timeoutMs = options.timeoutMs
    this.warn = options.warn ?? (() => undefined)
  }

  requestFlush(webContentsIds: number[]): Promise<void> {
    if (this.activeFlush) {
      return this.activeFlush
    }

    const uniqueIds = [...new Set(webContentsIds)]
    const currentFlush = Promise.all(uniqueIds.map((id) => this.requestWindowFlush(id))).then(
      () => undefined
    )
    this.activeFlush = currentFlush
    void currentFlush.then(() => {
      if (this.activeFlush === currentFlush) {
        this.activeFlush = null
      }
    })
    return currentFlush
  }

  acknowledge(webContentsId: number): void {
    this.finishWindowFlush(webContentsId)
  }

  private requestWindowFlush(webContentsId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.warn(webContentsId, 'timeout')
        this.finishWindowFlush(webContentsId)
      }, this.timeoutMs)
      timeoutId.unref?.()
      this.pending.set(webContentsId, { timeoutId, resolve })

      try {
        if (this.send(webContentsId, WRITER_FLUSH_REQUEST_CHANNEL) === false) {
          this.warn(webContentsId, 'destroyed')
          this.finishWindowFlush(webContentsId)
        }
      } catch {
        this.warn(webContentsId, 'destroyed')
        this.finishWindowFlush(webContentsId)
      }
    })
  }

  private finishWindowFlush(webContentsId: number): void {
    const pendingFlush = this.pending.get(webContentsId)
    if (!pendingFlush) {
      return
    }
    this.pending.delete(webContentsId)
    clearTimeout(pendingFlush.timeoutId)
    pendingFlush.resolve()
  }
}

export { WRITER_FLUSH_REQUEST_CHANNEL }
