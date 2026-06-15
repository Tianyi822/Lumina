import test from 'node:test'
import assert from 'node:assert/strict'
import { runPaperPageRenderPipeline } from './paperPageRenderPipeline'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('页图管线按并发数完成全部页面', async () => {
  const dispatched: number[] = []
  const settled: number[] = []
  const progressSnapshots: Array<{ completedPages: number; totalPages: number }> = []

  const result = await runPaperPageRenderPipeline({
    totalPages: 5,
    concurrency: 2,
    renderPage: async (pageIndex) => {
      await sleep(pageIndex % 2 === 0 ? 20 : 5)
      return {
        base64: `page-${pageIndex}`,
        width: 100,
        height: 100
      }
    },
    onPageDispatched: (pageIndex) => {
      dispatched.push(pageIndex)
    },
    onPageSettled: async (pageIndex) => {
      settled.push(pageIndex)
    },
    onProgress: (completedPages, totalPages) => {
      progressSnapshots.push({ completedPages, totalPages })
    }
  })

  assert.equal(result.aborted, false)
  assert.equal(result.completedPages, 5)
  assert.deepEqual(
    dispatched.sort((a, b) => a - b),
    [0, 1, 2, 3, 4]
  )
  assert.deepEqual(
    settled.sort((a, b) => a - b),
    [0, 1, 2, 3, 4]
  )
  assert.equal(progressSnapshots.at(-1)?.completedPages, 5)
})

test('页图管线支持取消中断', async () => {
  let cancelled = false

  const result = await runPaperPageRenderPipeline({
    totalPages: 10,
    concurrency: 2,
    shouldCancel: () => cancelled,
    renderPage: async (pageIndex) => {
      if (pageIndex === 1) {
        cancelled = true
      }
      await sleep(5)
      return {
        base64: `page-${pageIndex}`,
        width: 100,
        height: 100
      }
    },
    onPageSettled: async () => {}
  })

  assert.equal(result.aborted, true)
  assert.ok(result.completedPages < 10)
})
