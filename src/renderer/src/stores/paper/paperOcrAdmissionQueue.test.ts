import test from 'node:test'
import assert from 'node:assert/strict'
import type { OcrProgressInfo } from '@shared/types/paper'
import { createPaperOcrAdmissionQueue } from './paperOcrAdmissionQueue'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createTerminalProgress(
  paperId: string,
  status: OcrProgressInfo['status'] = 'completed'
): OcrProgressInfo {
  return {
    paperId,
    currentPage: 0,
    totalPages: 1,
    completedPages: 1,
    failedPages: [],
    status
  }
}

test('OCR 队列按注册顺序串行执行', async () => {
  const started: string[] = []
  const terminalResolvers = new Map<string, () => void>()

  const queue = createPaperOcrAdmissionQueue({
    startOcr: async (paperId) => {
      started.push(paperId)
      return { success: true }
    },
    waitForOcrTerminal: (paperId) =>
      new Promise((resolve) => {
        terminalResolvers.set(paperId, () => resolve(createTerminalProgress(paperId)))
      })
  })

  queue.registerPaper('paper-1')
  queue.registerPaper('paper-2')
  queue.registerPaper('paper-3')

  queue.markRenderComplete('paper-2')
  await sleep(10)
  assert.deepEqual(started, [])

  queue.markRenderComplete('paper-1')
  await sleep(10)
  assert.deepEqual(started, ['paper-1'])

  terminalResolvers.get('paper-1')?.()
  await sleep(10)
  assert.deepEqual(started, ['paper-1', 'paper-2'])

  terminalResolvers.get('paper-2')?.()
  await sleep(10)
  assert.deepEqual(started, ['paper-1', 'paper-2'])

  queue.markRenderComplete('paper-3')
  await sleep(10)
  assert.deepEqual(started, ['paper-1', 'paper-2', 'paper-3'])
})

test('后完成页图的论文在队首完成前不会启动 OCR', async () => {
  const queued: string[] = []
  const started: string[] = []
  const terminalResolvers = new Map<string, () => void>()

  const queue = createPaperOcrAdmissionQueue({
    startOcr: async (paperId) => {
      started.push(paperId)
      return { success: true }
    },
    waitForOcrTerminal: (paperId) =>
      new Promise((resolve) => {
        terminalResolvers.set(paperId, () => resolve(createTerminalProgress(paperId)))
      }),
    onQueued: (paperId) => {
      queued.push(paperId)
    }
  })

  queue.registerPaper('paper-1')
  queue.registerPaper('paper-2')
  queue.markRenderComplete('paper-2')
  assert.deepEqual(queued, ['paper-2'])
  assert.deepEqual(started, [])

  queue.markRenderComplete('paper-1')
  await sleep(10)
  assert.deepEqual(started, ['paper-1'])
})

test('skip 会移除排队论文并继续推进队列', async () => {
  const started: string[] = []
  const terminalResolvers = new Map<string, () => void>()

  const queue = createPaperOcrAdmissionQueue({
    startOcr: async (paperId) => {
      started.push(paperId)
      return { success: true }
    },
    waitForOcrTerminal: (paperId) =>
      new Promise((resolve) => {
        terminalResolvers.set(paperId, () => resolve(createTerminalProgress(paperId)))
      })
  })

  queue.registerPaper('paper-1')
  queue.registerPaper('paper-2')
  queue.markRenderComplete('paper-1')
  queue.markRenderComplete('paper-2')
  await sleep(10)
  assert.deepEqual(started, ['paper-1'])

  queue.skip('paper-1')
  await sleep(10)
  assert.deepEqual(started, ['paper-1', 'paper-2'])
})

test('OCR 启动失败后会继续处理下一篇', async () => {
  const started: string[] = []
  const failed: string[] = []
  const terminalResolvers = new Map<string, () => void>()

  const queue = createPaperOcrAdmissionQueue({
    startOcr: async (paperId) => {
      started.push(paperId)
      if (paperId === 'paper-1') {
        return { success: false, error: 'mock failure' }
      }
      return { success: true }
    },
    waitForOcrTerminal: (paperId) =>
      new Promise((resolve) => {
        terminalResolvers.set(paperId, () => resolve(createTerminalProgress(paperId)))
      }),
    onOcrStartFailed: (paperId) => {
      failed.push(paperId)
    }
  })

  queue.registerPaper('paper-1')
  queue.registerPaper('paper-2')
  queue.markRenderComplete('paper-1')
  queue.markRenderComplete('paper-2')
  await sleep(20)

  assert.deepEqual(failed, ['paper-1'])
  assert.deepEqual(started, ['paper-1', 'paper-2'])
})
