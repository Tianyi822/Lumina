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
