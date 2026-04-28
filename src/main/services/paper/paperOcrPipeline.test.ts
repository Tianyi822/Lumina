import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'
import { buildMergedMarkdown, runPaperOcrPipeline } from './paperOcrPipeline.ts'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createPageResult(
  paperId: string,
  pageIndex: number,
  overrides: Partial<PaperPageOcrResult> = {}
): PaperPageOcrResult {
  return {
    paperId,
    pageIndex,
    markdown: `Page ${pageIndex + 1} body`,
    blocks: [],
    status: 'completed',
    ...overrides
  }
}

test('OCR 并发执行完成顺序乱序时仍按页码顺序输出合并结果', async () => {
  const paperId = 'paper-ocr-order'
  const completionOrder: number[] = []

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 4,
    concurrency: 4,
    processPage: async (pageIndex) => {
      const delays = [40, 10, 25, 1]
      await sleep(delays[pageIndex])
      completionOrder.push(pageIndex)
      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, false)
  assert.deepEqual(
    result.results.map((page) => page.pageIndex),
    [0, 1, 2, 3]
  )
  assert.notDeepEqual(completionOrder, [0, 1, 2, 3])

  const mergedMarkdown = buildMergedMarkdown(result.results)
  const pageHeaders = [...mergedMarkdown.matchAll(/<!-- Page (\d+) -->/g)].map((match) =>
    Number(match[1])
  )
  assert.deepEqual(pageHeaders, [1, 2, 3, 4])
  assert.match(mergedMarkdown, /<!-- Page 1 -->[\s\S]*Page 1 body/)
  assert.match(mergedMarkdown, /<!-- Page 4 -->[\s\S]*Page 4 body/)
})

test('OCR 部分页失败时会保留失败页位置并维持结果顺序', async () => {
  const paperId = 'paper-ocr-partial'

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 3,
    concurrency: 3,
    processPage: async (pageIndex) => {
      const delays = [20, 5, 10]
      await sleep(delays[pageIndex])

      if (pageIndex === 1) {
        return createPageResult(paperId, pageIndex, {
          markdown: '',
          status: 'failed',
          errorMessage: 'OCR 请求失败'
        })
      }

      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, false)
  assert.deepEqual(
    result.results.map((page) => ({ pageIndex: page.pageIndex, status: page.status })),
    [
      { pageIndex: 0, status: 'completed' },
      { pageIndex: 1, status: 'failed' },
      { pageIndex: 2, status: 'completed' }
    ]
  )

  const mergedMarkdown = buildMergedMarkdown(result.results)
  const pageHeaders = [...mergedMarkdown.matchAll(/<!-- Page (\d+) -->/g)].map((match) =>
    Number(match[1])
  )
  assert.deepEqual(pageHeaders, [1, 2, 3])
  assert.ok(mergedMarkdown.indexOf('<!-- Page 2 -->') < mergedMarkdown.indexOf('<!-- Page 3 -->'))
})

test('OCR 取消后不会继续派发新页，已完成页仍保留原顺序', async () => {
  const paperId = 'paper-ocr-cancel'
  const dispatchedPages: number[] = []
  let cancelled = false

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 5,
    concurrency: 2,
    shouldCancel: () => cancelled,
    onPageDispatched: (pageIndex) => {
      dispatchedPages.push(pageIndex)
      if (pageIndex === 1) {
        cancelled = true
      }
    },
    processPage: async (pageIndex) => {
      await sleep(10)
      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, true)
  assert.deepEqual(dispatchedPages, [0, 1])
  assert.deepEqual(
    result.results.map((page) => ({ pageIndex: page.pageIndex, status: page.status })),
    [
      { pageIndex: 0, status: 'completed' },
      { pageIndex: 1, status: 'completed' },
      { pageIndex: 2, status: 'pending' },
      { pageIndex: 3, status: 'pending' },
      { pageIndex: 4, status: 'pending' }
    ]
  )

  const mergedMarkdown = buildMergedMarkdown(result.results)
  const pageHeaders = [...mergedMarkdown.matchAll(/<!-- Page (\d+) -->/g)].map((match) =>
    Number(match[1])
  )
  assert.deepEqual(pageHeaders, [1, 2, 3, 4, 5])
})

test('preExistingResults 已完成页面被跳过且不触发回调', async () => {
  const paperId = 'paper-ocr-pre-existing'
  const dispatchedPages: number[] = []
  const settledPages: number[] = []

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 4,
    concurrency: 2,
    preExistingResults: [createPageResult(paperId, 0), createPageResult(paperId, 2)],
    onPageDispatched: (pageIndex) => {
      dispatchedPages.push(pageIndex)
    },
    onPageSettled: (pageIndex) => {
      settledPages.push(pageIndex)
    },
    processPage: async (pageIndex) => {
      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, false)
  assert.deepEqual(dispatchedPages, [1, 3])
  assert.deepEqual(settledPages, [1, 3])
  assert.deepEqual(
    result.results.map((page) => ({ pageIndex: page.pageIndex, status: page.status })),
    [
      { pageIndex: 0, status: 'completed' },
      { pageIndex: 1, status: 'completed' },
      { pageIndex: 2, status: 'completed' },
      { pageIndex: 3, status: 'completed' }
    ]
  )

  const mergedMarkdown = buildMergedMarkdown(result.results)
  const pageHeaders = [...mergedMarkdown.matchAll(/<!-- Page (\d+) -->/g)].map((match) =>
    Number(match[1])
  )
  assert.deepEqual(pageHeaders, [1, 2, 3, 4])
})

test('preExistingResults 预填失败页仍会被重新处理', async () => {
  const paperId = 'paper-ocr-pre-existing-retry-failed'

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 3,
    concurrency: 2,
    preExistingResults: [
      createPageResult(paperId, 1, {
        markdown: '',
        status: 'failed',
        errorMessage: '上次失败'
      })
    ],
    processPage: async (pageIndex) => {
      if (pageIndex === 1) {
        return createPageResult(paperId, pageIndex, {
          markdown: '重试后成功'
        })
      }
      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, false)
  assert.equal(result.results[1].status, 'completed')
  assert.equal(result.results[1].markdown, '重试后成功')
})

test('preExistingResults 全部已完成时不启动 worker', async () => {
  const paperId = 'paper-ocr-all-done'
  let processCallCount = 0

  const result = await runPaperOcrPipeline({
    paperId,
    totalPages: 3,
    concurrency: 2,
    preExistingResults: [
      createPageResult(paperId, 0),
      createPageResult(paperId, 1),
      createPageResult(paperId, 2)
    ],
    processPage: async (pageIndex) => {
      processCallCount += 1
      return createPageResult(paperId, pageIndex)
    }
  })

  assert.equal(result.aborted, false)
  assert.equal(processCallCount, 0)
  assert.deepEqual(
    result.results.map((page) => page.status),
    ['completed', 'completed', 'completed']
  )
})
