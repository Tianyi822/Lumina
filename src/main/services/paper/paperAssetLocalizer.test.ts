import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PaperPageOcrResult, PaperTranslationCache } from '../../../shared/types/paper.ts'
import { getPaperDirPath, getPaperFigureAssetPath } from './paperPaths.ts'
import {
  localizePaperPageAssets,
  localizePaperTranslationCacheAssets
} from './paperAssetLocalizer.ts'

function createPageResult(
  paperId: string,
  remoteUrl: string,
  overrides: Partial<PaperPageOcrResult> = {}
): PaperPageOcrResult {
  return {
    paperId,
    pageIndex: 0,
    markdown: `<div style='text-align: center;'><img src='${remoteUrl}' alt='OCR图片'/></div>`,
    blocks: [
      {
        index: 0,
        pageIndex: 0,
        label: 'image',
        content: remoteUrl,
        bbox: { x: 10, y: 20, width: 100, height: 80 },
        width: 200,
        height: 300,
        remoteAssetUrl: remoteUrl,
        ...overrides.blocks?.[0]
      }
    ],
    status: 'completed',
    ...overrides
  }
}

function writeLocalAsset(paperId: string, pageIndex: number, blockIndex: number): void {
  const assetPath = getPaperFigureAssetPath(paperId, pageIndex, blockIndex)
  mkdirSync(dirname(assetPath), { recursive: true })
  writeFileSync(assetPath, 'png')
}

function cleanupPaper(paperId: string): void {
  rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
}

test('localizePaperPageAssets 复用已存在的本地图片并替换 markdown 与 block content', async () => {
  const paperId = 'paper-localize-existing'
  const remoteUrl = 'https://example.com/ocr/crop/existing.png?token=1'
  cleanupPaper(paperId)
  writeLocalAsset(paperId, 0, 0)

  let downloadCalled = false
  try {
    const result = await localizePaperPageAssets(
      paperId,
      createPageResult(paperId, remoteUrl, {
        blocks: [
          {
            ...createPageResult(paperId, remoteUrl).blocks[0],
            localAssetPath: 'assets/page-0001/crop-0000.png'
          }
        ]
      }),
      {
        downloadAsset: async () => {
          downloadCalled = true
          return true
        }
      }
    )

    assert.equal(downloadCalled, false)
    assert.equal(result.failedAssets.length, 0)
    assert.match(result.pageResult.markdown, /assets\/page-0001\/crop-0000\.png/)
    assert.match(result.pageResult.markdown, /<img\b[^>]*src='assets\/page-0001\/crop-0000\.png'/i)
    assert.doesNotMatch(result.pageResult.markdown, /https:\/\/example\.com/)
    assert.doesNotMatch(result.pageResult.markdown, /^assets\/page-0001\/crop-0000\.png$/m)
    assert.equal(result.pageResult.blocks[0].content, 'assets/page-0001/crop-0000.png')
  } finally {
    cleanupPaper(paperId)
  }
})

test('localizePaperPageAssets 在本地图片缺失时下载并写入 localAssetPath', async () => {
  const paperId = 'paper-localize-download'
  const remoteUrl = 'https://example.com/ocr/crop/download.png?token=2'
  cleanupPaper(paperId)

  let requestedPath = ''
  try {
    const result = await localizePaperPageAssets(paperId, createPageResult(paperId, remoteUrl), {
      downloadAsset: async (_remoteUrl, localPath) => {
        requestedPath = localPath
        writeFileSync(localPath, 'png')
        return true
      }
    })

    assert.equal(result.failedAssets.length, 0)
    assert.equal(requestedPath, getPaperFigureAssetPath(paperId, 0, 0))
    assert.equal(result.pageResult.blocks[0].localAssetPath, 'assets/page-0001/crop-0000.png')
    assert.equal(result.pageResult.blocks[0].content, 'assets/page-0001/crop-0000.png')
    assert.match(result.pageResult.markdown, /assets\/page-0001\/crop-0000\.png/)
    assert.match(result.pageResult.markdown, /<img\b[^>]*src='assets\/page-0001\/crop-0000\.png'/i)
  } finally {
    cleanupPaper(paperId)
  }
})

test('localizePaperPageAssets 会修复历史裸本地图片路径', async () => {
  const paperId = 'paper-localize-bare-local'
  const remoteUrl = 'https://example.com/ocr/crop/bare-local.png?token=5'
  cleanupPaper(paperId)
  writeLocalAsset(paperId, 0, 0)

  try {
    const result = await localizePaperPageAssets(
      paperId,
      createPageResult(paperId, remoteUrl, {
        markdown: 'assets/page-0001/crop-0000.png\n\n正文内容',
        blocks: [
          {
            ...createPageResult(paperId, remoteUrl).blocks[0],
            content: 'assets/page-0001/crop-0000.png',
            localAssetPath: 'assets/page-0001/crop-0000.png'
          }
        ]
      })
    )

    assert.equal(result.changed, true)
    assert.match(result.pageResult.markdown, /<img\b[^>]*src='assets\/page-0001\/crop-0000\.png'/i)
    assert.doesNotMatch(result.pageResult.markdown, /^assets\/page-0001\/crop-0000\.png$/m)
    assert.match(result.pageResult.markdown, /正文内容/)
  } finally {
    cleanupPaper(paperId)
  }
})

test('localizePaperPageAssets 下载失败时可剥离远端图片渲染入口', async () => {
  const paperId = 'paper-localize-failed'
  const remoteUrl = 'https://example.com/ocr/crop/missing.png?token=3'
  cleanupPaper(paperId)

  try {
    const result = await localizePaperPageAssets(paperId, createPageResult(paperId, remoteUrl), {
      stripMissingRemoteAssets: true,
      downloadAsset: async () => false
    })

    assert.equal(result.failedAssets.length, 1)
    assert.doesNotMatch(result.pageResult.markdown, /https:\/\/example\.com/)
    assert.doesNotMatch(result.pageResult.markdown, /<img\b/i)
    assert.equal(result.pageResult.blocks[0].content, '')
    assert.equal(result.pageResult.blocks[0].localAssetPath, undefined)
  } finally {
    cleanupPaper(paperId)
  }
})

test('localizePaperTranslationCacheAssets 替换翻译缓存中的远端图片 URL', () => {
  const remoteUrl = 'https://example.com/ocr/crop/cache.png?token=4'
  const cache: PaperTranslationCache = {
    paperId: 'paper-translation-cache',
    sourceHash: 'old-hash',
    sourceHashVersion: 2,
    totalSegments: 1,
    completedSegments: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'segment-1',
        index: 0,
        kind: 'image',
        originalMarkdown: `<img src="${remoteUrl}">`,
        originalText: remoteUrl,
        status: 'completed',
        translatedMarkdown: `<img src="${remoteUrl}">`,
        translatedText: remoteUrl
      }
    ]
  }

  const result = localizePaperTranslationCacheAssets(
    cache,
    new Map([[remoteUrl, 'assets/page-0001/crop-0000.png']])
  )

  assert.equal(result.changed, true)
  assert.doesNotMatch(JSON.stringify(result.cache), /https:\/\/example\.com/)
  assert.match(JSON.stringify(result.cache), /assets\/page-0001\/crop-0000\.png/)
})

test('localizePaperTranslationCacheAssets 会把缓存中的裸远端 Markdown 修复为本地图片标签', () => {
  const remoteUrl = 'https://example.com/ocr/crop/cache-bare.png?token=6'
  const cache: PaperTranslationCache = {
    paperId: 'paper-translation-cache-bare',
    sourceHash: 'old-hash',
    sourceHashVersion: 2,
    totalSegments: 1,
    completedSegments: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'segment-1',
        index: 0,
        kind: 'image',
        originalMarkdown: remoteUrl,
        originalText: remoteUrl,
        status: 'completed',
        translatedMarkdown: remoteUrl,
        translatedText: remoteUrl
      }
    ]
  }

  const result = localizePaperTranslationCacheAssets(
    cache,
    new Map([[remoteUrl, 'assets/page-0001/crop-0000.png']])
  )

  const entry = result.cache.entries[0]
  assert.equal(result.changed, true)
  assert.match(entry.originalMarkdown, /<img\b[^>]*src='assets\/page-0001\/crop-0000\.png'/i)
  assert.match(
    entry.translatedMarkdown || '',
    /<img\b[^>]*src='assets\/page-0001\/crop-0000\.png'/i
  )
  assert.equal(entry.originalText, 'assets/page-0001/crop-0000.png')
  assert.equal(entry.translatedText, 'assets/page-0001/crop-0000.png')
})
