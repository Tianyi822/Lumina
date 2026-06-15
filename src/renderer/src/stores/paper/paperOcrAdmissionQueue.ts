import type { OcrProgressInfo } from '@shared/types/paper'

export interface OcrStartResult {
  success: boolean
  error?: string
}

export interface PaperOcrAdmissionQueueDeps {
  startOcr: (paperId: string) => Promise<OcrStartResult>
  waitForOcrTerminal: (paperId: string) => Promise<OcrProgressInfo>
  onQueued?: (paperId: string) => void
  onOcrStarted?: (paperId: string) => void
  onOcrStartFailed?: (paperId: string, error: string) => void
}

const OCR_TERMINAL_STATUSES = new Set<OcrProgressInfo['status']>([
  'completed',
  'partial_failed',
  'failed',
  'cancelled'
])

export function isOcrTerminalStatus(status: OcrProgressInfo['status']): boolean {
  return OCR_TERMINAL_STATUSES.has(status)
}

export function createOcrTerminalWaiter(
  subscribe: (callback: (progress: OcrProgressInfo) => void) => () => void
): (paperId: string) => Promise<OcrProgressInfo> {
  return (paperId) =>
    new Promise((resolve) => {
      const unsubscribe = subscribe((progress) => {
        if (progress.paperId !== paperId) return
        if (isOcrTerminalStatus(progress.status)) {
          unsubscribe()
          resolve(progress)
        }
      })
    })
}

/**
 * 全局 OCR FIFO 准入队列：页图可并行完成，但 startOcr 严格按注册顺序串行
 */
export function createPaperOcrAdmissionQueue(deps: PaperOcrAdmissionQueueDeps) {
  const fifoQueue: string[] = []
  const readyForOcr = new Set<string>()
  const uploadSequenceByPaperId = new Map<string, number>()
  let nextUploadSequence = 0
  let draining = false
  let currentOcrPaperId: string | null = null
  let interruptCurrentOcr: (() => void) | null = null

  function insertIntoFifoQueue(paperId: string): void {
    if (fifoQueue.includes(paperId)) return

    const sequence = uploadSequenceByPaperId.get(paperId) ?? Number.MAX_SAFE_INTEGER
    const insertIndex = fifoQueue.findIndex(
      (queuedPaperId) => (uploadSequenceByPaperId.get(queuedPaperId) ?? 0) > sequence
    )

    if (insertIndex === -1) {
      fifoQueue.push(paperId)
      return
    }

    fifoQueue.splice(insertIndex, 0, paperId)
  }

  function registerPaper(paperId: string): void {
    if (!uploadSequenceByPaperId.has(paperId)) {
      uploadSequenceByPaperId.set(paperId, nextUploadSequence)
      nextUploadSequence += 1
    }
    insertIntoFifoQueue(paperId)
  }

  function markRenderComplete(paperId: string): void {
    readyForOcr.add(paperId)

    if (fifoQueue[0] !== paperId) {
      deps.onQueued?.(paperId)
    }

    void drainQueue()
  }

  function requeueForOcr(paperId: string): void {
    insertIntoFifoQueue(paperId)
    readyForOcr.add(paperId)
    void drainQueue()
  }

  function skip(paperId: string): void {
    const queueIndex = fifoQueue.indexOf(paperId)
    if (queueIndex >= 0) {
      fifoQueue.splice(queueIndex, 1)
    }
    readyForOcr.delete(paperId)

    if (currentOcrPaperId === paperId) {
      currentOcrPaperId = null
      interruptCurrentOcr?.()
      interruptCurrentOcr = null
    }

    void drainQueue()
  }

  function unregister(paperId: string): void {
    skip(paperId)
    uploadSequenceByPaperId.delete(paperId)
  }

  function isHeadReady(): boolean {
    return fifoQueue.length > 0 && readyForOcr.has(fifoQueue[0])
  }

  async function drainQueue(): Promise<void> {
    if (draining) return
    if (!isHeadReady() || currentOcrPaperId) return

    draining = true
    try {
      while (isHeadReady() && !currentOcrPaperId) {
        const paperId = fifoQueue[0]
        fifoQueue.shift()
        readyForOcr.delete(paperId)
        currentOcrPaperId = paperId

        deps.onOcrStarted?.(paperId)
        const startResult = await deps.startOcr(paperId)
        if (!startResult.success) {
          deps.onOcrStartFailed?.(paperId, startResult.error || 'OCR 启动失败')
          currentOcrPaperId = null
          continue
        }

        await Promise.race([
          deps.waitForOcrTerminal(paperId),
          new Promise<void>((resolve) => {
            interruptCurrentOcr = resolve
          })
        ])
        interruptCurrentOcr = null
        currentOcrPaperId = null
      }
    } finally {
      draining = false
      if (isHeadReady() && !currentOcrPaperId) {
        void drainQueue()
      }
    }
  }

  function getQueueSnapshot(): { fifoQueue: string[]; readyForOcr: string[] } {
    return {
      fifoQueue: [...fifoQueue],
      readyForOcr: [...readyForOcr]
    }
  }

  return {
    registerPaper,
    markRenderComplete,
    requeueForOcr,
    skip,
    unregister,
    drainQueue,
    getQueueSnapshot,
    isHeadReady
  }
}

export type PaperOcrAdmissionQueue = ReturnType<typeof createPaperOcrAdmissionQueue>
