import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paperStorageService } from './index.ts'
import {
  consumePagesPurgeSummary,
  isPaperFullyOcrCompleted,
  purgeIfOcrComplete,
  purgeRenderedPageImages
} from './pageImagePurge.ts'
import {
  getPaperDirPath,
  getPaperMetaPath,
  getPaperOcrNormalizedDirPath,
  getPaperOcrNormalizedPath,
  getPaperPageImagePath,
  getPaperPagesDirPath
} from './paperPaths.ts'
import type { PaperDocument, PaperPageOcrResult } from '../../../shared/types/paper.ts'

function makeMeta(paperId: string, overrides: Partial<PaperDocument> = {}): PaperDocument {
  return {
    id: paperId,
    fileName: `${paperId}.pdf`,
    filePath: join(getPaperDirPath(paperId), 'source.pdf'),
    fileHash: 'hash',
    fileSize: 1,
    pageCount: 2,
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    ocrProvider: 'glm',
    ocrModel: 'glm-ocr',
    completedPageCount: 2,
    ...overrides
  }
}

function setupPaper(paperId: string, meta: PaperDocument): void {
  mkdirSync(getPaperDirPath(paperId), { recursive: true })
  writeFileSync(getPaperMetaPath(paperId), JSON.stringify(meta))
}

function writePageImages(paperId: string, count: number): void {
  mkdirSync(getPaperPagesDirPath(paperId), { recursive: true })
  for (let pageIndex = 0; pageIndex < count; pageIndex++) {
    writeFileSync(getPaperPageImagePath(paperId, pageIndex), Buffer.from([1, 2, 3]))
  }
}

function writeNormalizedResult(
  paperId: string,
  pageIndex: number,
  status: 'completed' | 'failed'
): void {
  mkdirSync(getPaperOcrNormalizedDirPath(paperId), { recursive: true })
  const result: PaperPageOcrResult = { paperId, pageIndex, markdown: '', blocks: [], status }
  writeFileSync(getPaperOcrNormalizedPath(paperId, pageIndex), JSON.stringify(result))
}

function cleanupPaper(paperId: string): void {
  rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
}

test('isPaperFullyOcrCompleted：纯函数判定', () => {
  const completed: PaperPageOcrResult[] = [
    { paperId: 'p', pageIndex: 0, markdown: '', blocks: [], status: 'completed' },
    { paperId: 'p', pageIndex: 1, markdown: '', blocks: [], status: 'completed' }
  ]
  assert.equal(isPaperFullyOcrCompleted(completed, 2), true)
  assert.equal(isPaperFullyOcrCompleted(completed, 3), false)
  assert.equal(
    isPaperFullyOcrCompleted([completed[0], { ...completed[1], status: 'failed' as const }], 2),
    false
  )
  assert.equal(isPaperFullyOcrCompleted([], 0), true)
})

test('purgeIfOcrComplete：全部完成才删，含失败页保留', async () => {
  const doneId = 'paper-pipec-done'
  const failedId = 'paper-pipec-failed'
  setupPaper(doneId, makeMeta(doneId))
  writePageImages(doneId, 2)
  writeNormalizedResult(doneId, 0, 'completed')
  writeNormalizedResult(doneId, 1, 'completed')
  setupPaper(failedId, makeMeta(failedId))
  writePageImages(failedId, 2)
  writeNormalizedResult(failedId, 0, 'completed')
  writeNormalizedResult(failedId, 1, 'failed')
  try {
    const doneResult = await purgeIfOcrComplete(paperStorageService, doneId)
    assert.equal(doneResult.success, true)
    assert.equal(doneResult.purged, true)
    assert.equal(existsSync(getPaperPagesDirPath(doneId)), false)

    const failedResult = await purgeIfOcrComplete(paperStorageService, failedId)
    assert.equal(failedResult.success, true)
    assert.equal(failedResult.purged, false)
    assert.equal(existsSync(getPaperPagesDirPath(failedId)), true)
  } finally {
    cleanupPaper(doneId)
    cleanupPaper(failedId)
  }
})

test('purgeIfOcrComplete：已清理过的论文不重复清理', async () => {
  const paperId = 'paper-pipec-idempotent'
  setupPaper(paperId, makeMeta(paperId, { pageImagesPurgedAt: '2026-08-18T00:00:00.000Z' }))
  try {
    const result = await purgeIfOcrComplete(paperStorageService, paperId)
    assert.equal(result.success, true)
    assert.equal(result.purged, false)
  } finally {
    cleanupPaper(paperId)
  }
})

test('purgeRenderedPageImages：存量清理只删满足条件的论文，摘要可一次性取走', async () => {
  consumePagesPurgeSummary() // 清空可能残留的上次摘要
  const doneId = 'paper-batch-done'
  const failedId = 'paper-batch-failed'
  const purgedId = 'paper-batch-purged'
  setupPaper(doneId, makeMeta(doneId))
  writePageImages(doneId, 2)
  writeNormalizedResult(doneId, 0, 'completed')
  writeNormalizedResult(doneId, 1, 'completed')
  setupPaper(failedId, makeMeta(failedId))
  writePageImages(failedId, 2)
  writeNormalizedResult(failedId, 0, 'completed')
  writeNormalizedResult(failedId, 1, 'failed')
  setupPaper(purgedId, makeMeta(purgedId, { pageImagesPurgedAt: '2026-08-18T00:00:00.000Z' }))
  try {
    const summary = await purgeRenderedPageImages(paperStorageService)
    assert.equal(existsSync(getPaperPagesDirPath(doneId)), false)
    assert.equal(existsSync(getPaperPagesDirPath(failedId)), true)
    // 摘要包含本次清理的篇数与字节数（测试环境可能还有其他fixture，仅校验下界）
    assert.equal(summary.purgedCount >= 1, true)
    assert.equal(summary.freedBytes > 0, true)

    const taken = consumePagesPurgeSummary()
    assert.equal(taken?.purgedCount, summary.purgedCount)
    assert.equal(consumePagesPurgeSummary(), null)
  } finally {
    cleanupPaper(doneId)
    cleanupPaper(failedId)
    cleanupPaper(purgedId)
  }
})
