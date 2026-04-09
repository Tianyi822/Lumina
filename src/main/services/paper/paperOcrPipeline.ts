import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'

export const MAX_OCR_CONCURRENCY = 1

export interface RunPaperOcrPipelineOptions {
  paperId: string
  totalPages: number
  concurrency?: number
  shouldCancel?: () => boolean
  processPage: (pageIndex: number) => Promise<PaperPageOcrResult>
  onPageDispatched?: (pageIndex: number) => void
  onPageSettled?: (pageIndex: number, result: PaperPageOcrResult) => void
}

export interface RunPaperOcrPipelineResult {
  aborted: boolean
  results: PaperPageOcrResult[]
}

export function createPendingOcrResult(paperId: string, pageIndex: number): PaperPageOcrResult {
  return {
    paperId,
    pageIndex,
    markdown: '',
    blocks: [],
    status: 'pending'
  }
}

export function getAdaptiveOcrConcurrency(totalPages: number): number {
  return Math.max(1, Math.min(MAX_OCR_CONCURRENCY, totalPages))
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

export async function runPaperOcrPipeline(
  options: RunPaperOcrPipelineOptions
): Promise<RunPaperOcrPipelineResult> {
  const { paperId, totalPages, processPage, onPageDispatched, onPageSettled, shouldCancel } =
    options
  const results = Array.from({ length: totalPages }, (_, pageIndex) =>
    createPendingOcrResult(paperId, pageIndex)
  )

  if (totalPages === 0) {
    return {
      aborted: false,
      results
    }
  }

  let nextPageIndex = 0
  const workerCount = Math.min(
    Math.max(1, options.concurrency ?? getAdaptiveOcrConcurrency(totalPages)),
    totalPages
  )

  const claimNextPage = (): number | null => {
    if (shouldCancel?.()) {
      return null
    }

    if (nextPageIndex >= totalPages) {
      return null
    }

    const pageIndex = nextPageIndex
    nextPageIndex += 1
    return pageIndex
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
        onPageSettled?.(pageIndex, result)
      }
    })
  )

  return {
    aborted: !!shouldCancel?.(),
    results
  }
}
