import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'

/**
 * OCR 管线配置参数
 */
export interface RunPaperOcrPipelineOptions {
  paperId: string
  totalPages: number
  concurrency: number
  shouldCancel?: () => boolean
  processPage: (pageIndex: number) => Promise<PaperPageOcrResult>
  onPageDispatched?: (pageIndex: number) => void
  onPageSettled?: (pageIndex: number, result: PaperPageOcrResult) => void | Promise<void>
  preExistingResults?: PaperPageOcrResult[]
}

/**
 * OCR 管线执行结果
 */
export interface RunPaperOcrPipelineResult {
  aborted: boolean
  results: PaperPageOcrResult[]
}

function createPendingOcrResult(paperId: string, pageIndex: number): PaperPageOcrResult {
  return {
    paperId,
    pageIndex,
    markdown: '',
    blocks: [],
    status: 'pending'
  }
}

function buildPageMarkdown(pageResult: PaperPageOcrResult): string {
  let md = pageResult.markdown

  for (const block of pageResult.blocks) {
    if (block.localAssetPath && block.remoteAssetUrl) {
      md = md.replaceAll(block.remoteAssetUrl, block.localAssetPath)
    }
  }

  return md
}

export function buildMergedMarkdown(results: PaperPageOcrResult[]): string {
  const parts: string[] = []

  for (const pageResult of results) {
    const pageMd = buildPageMarkdown(pageResult)
    const header = `<!-- Page ${pageResult.pageIndex + 1} -->`
    parts.push(`${header}\n\n${pageMd}`)
  }

  return parts.join('\n\n')
}

/**
 * 执行 OCR 管线
 * 使用固定数量的 worker 线程并发处理页面，每个 worker 通过 claimNextPage
 * 拉取下一个待处理页面，直到所有页面完成或被取消
 */
export async function runPaperOcrPipeline(
  options: RunPaperOcrPipelineOptions
): Promise<RunPaperOcrPipelineResult> {
  const {
    paperId,
    totalPages,
    processPage,
    onPageDispatched,
    onPageSettled,
    shouldCancel,
    preExistingResults
  } = options

  // 收集已完成页面索引，跳过重新处理
  const completedPageIndices = new Set(
    (preExistingResults ?? []).filter((r) => r.status === 'completed').map((r) => r.pageIndex)
  )

  const results = Array.from({ length: totalPages }, (_, pageIndex) => {
    const existing = preExistingResults?.find((r) => r.pageIndex === pageIndex)
    return existing ?? createPendingOcrResult(paperId, pageIndex)
  })

  if (totalPages === 0) {
    return {
      aborted: false,
      results
    }
  }

  let nextPageIndex = 0
  const pendingCount = totalPages - completedPageIndices.size
  const workerCount = Math.min(Math.max(1, options.concurrency), Math.max(1, pendingCount))

  // 原子地获取下一个待处理页面索引（线程安全）
  const claimNextPage = (): number | null => {
    if (shouldCancel?.()) {
      return null
    }

    while (nextPageIndex < totalPages) {
      const pageIndex = nextPageIndex
      nextPageIndex += 1

      if (completedPageIndices.has(pageIndex)) {
        continue
      }

      return pageIndex
    }

    return null
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const pageIndex = claimNextPage()
        if (pageIndex === null) {
          return
        }

        onPageDispatched?.(pageIndex)

        const result = await processPage(pageIndex)
        results[pageIndex] = result
        await onPageSettled?.(pageIndex, result)
      }
    })
  )

  return {
    aborted: !!shouldCancel?.(),
    results
  }
}
