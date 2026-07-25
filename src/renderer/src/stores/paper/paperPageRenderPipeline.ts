import { PAPER_PAGE_RENDER_CONCURRENCY } from '@shared/constants/paper'

interface PageRenderResult {
  base64: string
  width: number
  height: number
}

export interface RunPaperPageRenderPipelineOptions {
  totalPages: number
  concurrency?: number
  shouldCancel?: () => boolean
  renderPage: (pageIndex: number) => Promise<PageRenderResult>
  onPageDispatched?: (pageIndex: number) => void
  onPageSettled?: (pageIndex: number, result: PageRenderResult) => void | Promise<void>
  onProgress?: (completedPages: number, totalPages: number) => void
}

export interface RunPaperPageRenderPipelineResult {
  aborted: boolean
  completedPages: number
}

/**
 * 并行执行论文页图光栅化管线
 * 使用 worker 池按页序派发任务，通过 onPageSettled 持久化单页结果
 */
export async function runPaperPageRenderPipeline(
  options: RunPaperPageRenderPipelineOptions
): Promise<RunPaperPageRenderPipelineResult> {
  const { totalPages, renderPage, onPageDispatched, onPageSettled, onProgress, shouldCancel } =
    options

  if (totalPages === 0) {
    onProgress?.(0, 0)
    return { aborted: false, completedPages: 0 }
  }

  let nextPageIndex = 0
  let completedPages = 0
  const workerCount = Math.min(
    Math.max(1, options.concurrency ?? PAPER_PAGE_RENDER_CONCURRENCY),
    totalPages
  )

  const claimNextPage = (): number | null => {
    if (shouldCancel?.()) {
      return null
    }

    while (nextPageIndex < totalPages) {
      const pageIndex = nextPageIndex
      nextPageIndex += 1
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
        const result = await renderPage(pageIndex)
        if (shouldCancel?.()) {
          return
        }

        await onPageSettled?.(pageIndex, result)
        completedPages += 1
        onProgress?.(completedPages, totalPages)
      }
    })
  )

  return {
    aborted: !!shouldCancel?.(),
    completedPages
  }
}
