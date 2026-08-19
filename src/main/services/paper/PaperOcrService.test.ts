import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PaperOcrService } from './PaperOcrService.ts'
import { getPaperDirPath, getPaperMetaPath } from './paperPaths.ts'
import type { PaperDocument } from '../../../shared/types/paper.ts'

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

function cleanupPaper(paperId: string): void {
  rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
}

test('startOcr：页图已清理时返回 pages_missing', async () => {
  const paperId = 'paper-ocr-purged-start'
  setupPaper(paperId, makeMeta(paperId, { pageImagesPurgedAt: '2026-08-18T00:00:00.000Z' }))
  try {
    const service = new PaperOcrService()
    const result = await service.startOcr(paperId)
    assert.equal(result.success, false)
    assert.equal(result.code, 'pages_missing')
  } finally {
    cleanupPaper(paperId)
  }
})

test('retryPage：页图已清理时返回 pages_missing', async () => {
  const paperId = 'paper-ocr-purged-retry'
  setupPaper(paperId, makeMeta(paperId, { pageImagesPurgedAt: '2026-08-18T00:00:00.000Z' }))
  try {
    const service = new PaperOcrService()
    const result = await service.retryPage(paperId, 0)
    assert.equal(result.success, false)
    assert.equal(result.code, 'pages_missing')
  } finally {
    cleanupPaper(paperId)
  }
})
