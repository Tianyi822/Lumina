import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paperStorageService } from './index.ts'
import {
  getPaperDirPath,
  getPaperMetaPath,
  getPaperPageImagePath,
  getPaperPagesDirPath
} from './paperPaths.ts'
import type { PaperDocument, PaperPageAsset } from '../../../shared/types/paper.ts'

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

function makePageAsset(paperId: string, pageIndex: number): PaperPageAsset {
  return {
    paperId,
    pageIndex,
    imagePath: getPaperPageImagePath(paperId, pageIndex),
    imageMimeType: 'image/jpeg',
    imageWidth: 100,
    imageHeight: 100,
    renderScale: 2,
    base64Size: 3
  }
}

/** 只建论文目录与 meta.json；页图由 writePageImages 按需写 */
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

function cleanupPaper(paperId: string): void {
  rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
}

test('purgePageImages：删除页图目录并写入清理标记，pageAssets 保留', async () => {
  const paperId = 'paper-purge-basic'
  setupPaper(paperId, makeMeta(paperId, { pageAssets: [makePageAsset(paperId, 0)] }))
  writePageImages(paperId, 2)
  try {
    const result = await paperStorageService.purgePageImages(paperId)
    assert.equal(result.success, true)
    assert.equal((result.freedBytes ?? 0) > 0, true)
    assert.equal(existsSync(getPaperPagesDirPath(paperId)), false)

    const metaResult = await paperStorageService.readMeta(paperId)
    assert.equal(metaResult.success, true)
    assert.equal(typeof metaResult.data?.pageImagesPurgedAt, 'string')
    assert.equal(metaResult.data?.pageAssets?.length, 1)
  } finally {
    cleanupPaper(paperId)
  }
})

test('purgePageImages：pages 目录不存在时幂等成功', async () => {
  const paperId = 'paper-purge-no-dir'
  setupPaper(paperId, makeMeta(paperId))
  try {
    const result = await paperStorageService.purgePageImages(paperId)
    assert.equal(result.success, true)
    assert.equal(result.freedBytes, 0)

    const metaResult = await paperStorageService.readMeta(paperId)
    assert.equal(typeof metaResult.data?.pageImagesPurgedAt, 'string')
  } finally {
    cleanupPaper(paperId)
  }
})

test('savePageImage：重渲染保存页图时清除清理标记', async () => {
  const paperId = 'paper-purge-rerender'
  setupPaper(
    paperId,
    makeMeta(paperId, { pageImagesPurgedAt: '2026-08-18T00:00:00.000Z' })
  )
  try {
    const saveResult = await paperStorageService.savePageImage(
      paperId,
      0,
      Buffer.from([1, 2, 3]).toString('base64'),
      { imageWidth: 10, imageHeight: 10, renderScale: 2 }
    )
    assert.equal(saveResult.success, true)

    const metaResult = await paperStorageService.readMeta(paperId)
    assert.equal(metaResult.data?.pageImagesPurgedAt, null)
  } finally {
    cleanupPaper(paperId)
  }
})
