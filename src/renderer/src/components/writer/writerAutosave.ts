export interface WriterAutosaveResult {
  success: boolean
  code?: string
}

export interface WriterAutosaveClock {
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (timerId: unknown) => void
}

export interface WriterAutosaveControllerOptions<T> {
  delayMs: number
  clock?: WriterAutosaveClock
  save: (snapshot: T) => Promise<WriterAutosaveResult>
}

const systemClock: WriterAutosaveClock = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (timerId) => window.clearTimeout(timerId as number)
}

/** 串行保存最后一个正文快照，并在 revision 冲突后停止继续写入。 */
export class WriterAutosaveController<T> {
  private readonly delayMs: number
  private readonly clock: WriterAutosaveClock
  private readonly save: (snapshot: T) => Promise<WriterAutosaveResult>
  private pendingSnapshot: T | undefined
  private timerId: unknown
  private readyToSave = false
  private drainPromise: Promise<void> | null = null
  private disposePromise: Promise<void> | null = null
  private disposed = false
  private revisionConflict = false

  constructor(options: WriterAutosaveControllerOptions<T>) {
    this.delayMs = options.delayMs
    this.clock = options.clock ?? systemClock
    this.save = options.save
  }

  schedule(snapshot: T): void {
    if (this.disposed || this.revisionConflict) return

    this.pendingSnapshot = snapshot
    this.readyToSave = false
    this.clearTimer()
    this.timerId = this.clock.setTimeout(() => {
      this.timerId = undefined
      this.readyToSave = true
      void this.drain()
    }, this.delayMs)
  }

  async flush(): Promise<void> {
    if (this.disposePromise) {
      await this.disposePromise
      return
    }
    await this.flushPending()
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise

    this.disposed = true
    this.disposePromise = this.flushPending()
    return this.disposePromise
  }

  private async flushPending(): Promise<void> {
    this.clearTimer()
    if (this.pendingSnapshot !== undefined && !this.revisionConflict) this.readyToSave = true

    while (!this.revisionConflict) {
      await this.drain()
      if (this.pendingSnapshot === undefined) return
      this.readyToSave = true
    }
  }

  private drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise

    this.drainPromise = (async () => {
      while (this.readyToSave && this.pendingSnapshot !== undefined && !this.revisionConflict) {
        const snapshot = this.pendingSnapshot
        this.pendingSnapshot = undefined
        this.readyToSave = false
        const result = await this.save(snapshot)
        if (result.code === 'revision_conflict') {
          this.revisionConflict = true
          this.pendingSnapshot = undefined
          this.clearTimer()
        }
      }
    })().finally(() => {
      this.drainPromise = null
      if (this.readyToSave && this.pendingSnapshot !== undefined && !this.revisionConflict) {
        void this.drain()
      }
    })

    return this.drainPromise
  }

  private clearTimer(): void {
    if (this.timerId === undefined) return
    this.clock.clearTimeout(this.timerId)
    this.timerId = undefined
  }
}

/** 退出握手必须先等 renderer 最后快照落盘，再通知主进程继续退出。 */
export async function flushWriterAutosaveAndAcknowledge<T>(
  controller: Pick<WriterAutosaveController<T>, 'flush'>,
  acknowledge: () => Promise<void>
): Promise<void> {
  await controller.flush()
  await acknowledge()
}
