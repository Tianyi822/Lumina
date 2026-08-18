/**
 * 页图清理模块：OCR 全部完成后删除 papers/{id}/pages/ 目录。
 *
 * - purgeIfOcrComplete：OCR 整篇结束或单页重试成功后调用，按需清理单篇
 * - purgeRenderedPageImages：启动时存量清理，满足条件的论文全部清理并记录摘要
 *
 * 页图的唯一消费者是 OCR（PaperOcrService.processPage 读页图送 GLM OCR），
 * 全部完成后 pages/ 即成为可再生的缓存（可从 source.pdf 重新栅格化）。
 */
import { existsSync } from 'node:fs'
import { logger } from '@main/services/logger'
import type { PaperPageOcrResult, PagesPurgeSummary } from '@shared/types/paper'
import { getPaperPagesDirPath } from './paperPaths'
import type { PaperStorageService } from './PaperStorageService'

/** 判断论文是否所有页 OCR 均完成（以落盘的归一化结果为准，不轻信 meta 状态字段） */
export function isPaperFullyOcrCompleted(
  results: PaperPageOcrResult[],
  pageCount: number
): boolean {
  return results.length === pageCount && results.every((r) => r.status === 'completed')
}

let lastPurgeSummary: PagesPurgeSummary | null = null

/**
 * 单篇清理：全部页 OCR 完成才删除 pages/ 目录；有失败页则全部保留供重试。
 * 返回 purged 表示本次是否执行了清理。
 */
export async function purgeIfOcrComplete(
  storage: PaperStorageService,
  paperId: string
): Promise<{ success: boolean; purged: boolean; error?: string }> {
  const metaResult = await storage.readMeta(paperId)
  if (!metaResult.success || !metaResult.data) {
    return { success: false, purged: false, error: metaResult.error }
  }
  if (metaResult.data.pageImagesPurgedAt) {
    return { success: true, purged: false }
  }

  const results = await storage.listNormalizedResults(paperId)
  if (!results.success || !results.data) {
    return { success: false, purged: false, error: results.error }
  }
  if (!isPaperFullyOcrCompleted(results.data, metaResult.data.pageCount)) {
    return { success: true, purged: false }
  }

  const purgeResult = await storage.purgePageImages(paperId)
  if (!purgeResult.success) {
    logger.warn('页图清理失败', 'main', { paperId, error: purgeResult.error })
    return { success: false, purged: false, error: purgeResult.error }
  }

  logger.info('OCR 全部完成，页图已清理', 'main', {
    paperId,
    freedBytes: purgeResult.freedBytes
  })
  return { success: true, purged: true }
}

/**
 * 启动时存量清理：扫描所有论文，OCR 全部完成且页图目录仍存在、未清理过的，删除页图。
 * 每篇独立 try-catch，单篇失败仅记 warn。有清理结果时记录摘要供渲染端通知。
 */
export async function purgeRenderedPageImages(
  storage: PaperStorageService
): Promise<PagesPurgeSummary> {
  const summary: PagesPurgeSummary = {
    purgedCount: 0,
    freedBytes: 0,
    at: new Date().toISOString()
  }

  const listResult = await storage.listPapers()
  if (!listResult.success || !listResult.data) {
    logger.warn('存量页图清理：读取论文列表失败', 'main', { error: listResult.error })
    return summary
  }

  for (const paper of listResult.data) {
    try {
      if (paper.pageImagesPurgedAt) continue
      if (!existsSync(getPaperPagesDirPath(paper.id))) continue

      const results = await storage.listNormalizedResults(paper.id)
      if (!results.success || !results.data) continue
      if (!isPaperFullyOcrCompleted(results.data, paper.pageCount)) continue

      const purgeResult = await storage.purgePageImages(paper.id)
      if (purgeResult.success) {
        summary.purgedCount += 1
        summary.freedBytes += purgeResult.freedBytes ?? 0
      }
    } catch (error) {
      logger.warn('存量页图清理：单篇失败已跳过', 'main', {
        paperId: paper.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (summary.purgedCount > 0) {
    lastPurgeSummary = summary
  }
  logger.info('存量页图清理完成', 'main', {
    purgedCount: summary.purgedCount,
    freedBytes: summary.freedBytes
  })
  return summary
}

/** 取走最近一次存量清理摘要（一次性；无则 null） */
export function consumePagesPurgeSummary(): PagesPurgeSummary | null {
  const summary = lastPurgeSummary
  lastPurgeSummary = null
  return summary
}
