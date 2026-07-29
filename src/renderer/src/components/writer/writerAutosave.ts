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

export interface WriterRevisionSaveResult extends WriterAutosaveResult {
  revision?: number
  error?: string
}

export interface WriterRevisionCoordinatorOptions<T> {
  initialRevision: number
  save: (snapshot: T, expectedRevision: number) => Promise<WriterRevisionSaveResult>
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

/** 统一正文保存使用的 revision，并只接受单调递增的外部元数据 revision。 */
export class WriterRevisionCoordinator<T> {
  private currentRevision: number
  private readonly saveSnapshot: WriterRevisionCoordinatorOptions<T>['save']

  constructor(options: WriterRevisionCoordinatorOptions<T>) {
    this.currentRevision = options.initialRevision
    this.saveSnapshot = options.save
  }

  get revision(): number {
    return this.currentRevision
  }

  syncExternalRevision(revision: number): void {
    this.currentRevision = Math.max(this.currentRevision, revision)
  }

  async save(snapshot: T): Promise<WriterRevisionSaveResult> {
    const result = await this.saveSnapshot(snapshot, this.currentRevision)
    if (result.success && result.revision !== undefined) {
      this.currentRevision = Math.max(this.currentRevision, result.revision)
    }
    return result
  }
}

/** 页面级持有当前与正在卸载的控制器，退出 ACK 前统一等待所有保存完成。 */
export class WriterAutosaveFlushRegistry<T> {
  private readonly activeControllers = new Set<WriterAutosaveController<T>>()
  private readonly disposingPromises = new Set<Promise<void>>()

  register(controller: WriterAutosaveController<T>): void {
    this.activeControllers.add(controller)
  }

  dispose(controller: WriterAutosaveController<T>): Promise<void> {
    this.activeControllers.delete(controller)
    const trackedPromise = controller.dispose()
    this.disposingPromises.add(trackedPromise)
    void trackedPromise.then(
      () => {
        this.disposingPromises.delete(trackedPromise)
      },
      () => {
        this.disposingPromises.delete(trackedPromise)
      }
    )
    return trackedPromise
  }

  async flush(): Promise<void> {
    do {
      await Promise.all([
        ...[...this.activeControllers].map((controller) => controller.flush()),
        ...this.disposingPromises
      ])
    } while (this.disposingPromises.size > 0)
  }
}

/** 退出握手必须先等 renderer 最后快照落盘，再通知主进程继续退出。 */
export async function flushWriterAutosaveAndAcknowledge<T>(
  target: Pick<WriterAutosaveController<T>, 'flush'>,
  acknowledge: () => Promise<void>
): Promise<void> {
  await target.flush()
  await acknowledge()
}
