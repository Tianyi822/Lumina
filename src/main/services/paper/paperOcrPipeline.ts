import type { PaperPageOcrResult } from '../../../shared/types/paper.ts'

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
  const {
    paperId,
    totalPages,
    processPage,
    onPageDispatched,
    onPageSettled,
    shouldCancel,
    preExistingResults
  } = options

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
