import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  statSync,
  readdirSync
} from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { logger } from '@main/services/logger'
import type {
  LegacyPaperAnnotation,
  PaperAnnotationStore,
  PaperDocument,
  PaperPageAsset,
  PaperPageOcrResult,
  PaperTranslationCache,
  PaperStatus
} from '@shared/types/paper'
import {
  createEmptyPaperAnnotationStore,
  normalizeStoredAnnotationStore
} from './paperAnnotationRules'
import {
  ensurePaperDirs,
  getPaperAnnotationsPath,
  getPaperDirPath,
  getPaperMetaPath,
  getPaperMergedMdPath,
  getPaperOcrNormalizedDirPath,
  getPaperOcrNormalizedPath,
  getPapersDirPath,
  getPaperPageImagePath,
  getPaperPagesDirPath,
  getPaperTranslationPath
} from './paperPaths'
import {
  createLocalAssetReplacementMapFromDisk,
  localizePaperTranslationCacheAssets
} from './paperAssetLocalizer'

export const MAX_PAPER_PAGES = 200
export const MAX_PAPER_FILE_SIZE = 200 * 1024 * 1024

function createEmptyAnnotationStore(paperId: string): PaperAnnotationStore {
  return createEmptyPaperAnnotationStore(paperId)
}

function looksLikeLegacyAnnotationArray(value: unknown): value is LegacyPaperAnnotation[] {
  if (!Array.isArray(value)) {
    return false
  }

  return value.every((item) => {
    return (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'paperId' in item &&
      'pageIndex' in item &&
      'blockIndex' in item &&
      'selectedText' in item &&
      'comment' in item
    )
  })
}

interface PaperAnnotationData {
  kind: 'store' | 'legacy'
  store?: PaperAnnotationStore
  legacyAnnotations?: LegacyPaperAnnotation[]
}

export class PaperStorageService {
  private upsertPageAsset(document: PaperDocument, asset: PaperPageAsset): PaperPageAsset[] {
    const pageAssets = [...(document.pageAssets || [])]
    const existingIndex = pageAssets.findIndex((item) => item.pageIndex === asset.pageIndex)

    if (existingIndex >= 0) {
      pageAssets[existingIndex] = asset
    } else {
      pageAssets.push(asset)
    }

    pageAssets.sort((a, b) => a.pageIndex - b.pageIndex)
    return pageAssets
  }

  ensurePapersDir(): void {
    const papersDir = getPapersDirPath()
    if (!existsSync(papersDir)) {
      mkdirSync(papersDir, { recursive: true })
      logger.info('创建论文根目录成功', 'main', { path: papersDir })
    }
  }

  calculateFileHash(filePath: string): string {
    const fileBuffer = readFileSync(filePath)
    const hash = createHash('sha256')
    hash.update(fileBuffer)
    return hash.digest('hex')
  }

  createPaper(
    sourcePdfPath: string,
    ocrModel: string,
    pageCount: number
  ): { success: boolean; data?: PaperDocument; error?: string } {
    try {
      if (!existsSync(sourcePdfPath)) {
        return { success: false, error: '源 PDF 文件不存在' }
      }

      const stats = statSync(sourcePdfPath)
      const actualFileSize = stats.size

      if (actualFileSize > MAX_PAPER_FILE_SIZE) {
        return { success: false, error: '文件超过大小限制（最大 200MB）' }
      }

      if (pageCount > MAX_PAPER_PAGES) {
        return { success: false, error: '文件超过页数限制（最大 200 页）' }
      }

      const paperId = crypto.randomUUID()
      const paperDir = getPaperDirPath(paperId)

      if (existsSync(paperDir)) {
        return { success: false, error: '论文目录已存在' }
      }

      ensurePaperDirs(paperId)

      const fileName = sourcePdfPath.split('/').pop() || 'unknown.pdf'
      const localPdfPath = join(paperDir, 'source.pdf')
      copyFileSync(sourcePdfPath, localPdfPath)

      const fileHash = this.calculateFileHash(localPdfPath)

      const now = new Date().toISOString()
      const document: PaperDocument = {
        id: paperId,
        fileName,
        filePath: localPdfPath,
        fileHash,
        fileSize: actualFileSize,
        pageCount,
        status: 'draft' as PaperStatus,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        ocrProvider: 'glm-ocr',
        ocrModel,
        completedPageCount: 0
      }

      this.saveMeta(paperId, document)

      logger.info('创建论文记录成功', 'main', { paperId, fileName, pageCount })
      return { success: true, data: document }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建论文记录失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  readMeta(paperId: string): { success: boolean; data?: PaperDocument; error?: string } {
    try {
      const metaPath = getPaperMetaPath(paperId)
      if (!existsSync(metaPath)) {
        return { success: false, error: '论文元信息文件不存在' }
      }

      const content = readFileSync(metaPath, 'utf-8')
      const meta = JSON.parse(content) as PaperDocument
      return { success: true, data: meta }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取论文元信息失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  saveMeta(paperId: string, document: PaperDocument): { success: boolean; error?: string } {
    try {
      const metaPath = getPaperMetaPath(paperId)
      writeFileSync(metaPath, JSON.stringify(document, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存论文元信息失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  updateMeta(
    paperId: string,
    updates: Partial<PaperDocument>
  ): { success: boolean; data?: PaperDocument; error?: string } {
    const readResult = this.readMeta(paperId)
    if (!readResult.success || !readResult.data) {
      return { success: false, error: readResult.error }
    }

    const updated = { ...readResult.data, ...updates, updatedAt: new Date().toISOString() }
    const saveResult = this.saveMeta(paperId, updated)
    if (!saveResult.success) {
      return { success: false, error: saveResult.error }
    }

    return { success: true, data: updated }
  }

  listPapers(): { success: boolean; data?: PaperDocument[]; error?: string } {
    try {
      this.ensurePapersDir()

      const papersDir = getPapersDirPath()
      const entries = readdirSync(papersDir, { withFileTypes: true })
      const papers: PaperDocument[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const paperId = entry.name
        const metaResult = this.readMeta(paperId)
        if (metaResult.success && metaResult.data) {
          papers.push(metaResult.data)
        }
      }

      papers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { success: true, data: papers }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取论文列表失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  deletePaper(paperId: string): { success: boolean; error?: string } {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        return { success: false, error: '论文目录不存在' }
      }

      rmSync(paperDir, { recursive: true, force: true })
      logger.info('删除论文成功', 'main', { paperId })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除论文失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  paperExists(paperId: string): boolean {
    return existsSync(getPaperMetaPath(paperId))
  }

  /**
   * 保存单页图片（从 base64 数据）
   * base64Data 不含 data:image/jpeg;base64, 前缀
   */
  savePageImage(
    paperId: string,
    pageIndex: number,
    base64Data: string,
    metadata: {
      imageWidth: number
      imageHeight: number
      sourceWidth?: number
      sourceHeight?: number
      renderScale: number
    }
  ): { success: boolean; error?: string } {
    try {
      const pagesDir = getPaperPagesDirPath(paperId)
      if (!existsSync(pagesDir)) {
        mkdirSync(pagesDir, { recursive: true })
      }

      const imagePath = getPaperPageImagePath(paperId, pageIndex)
      const buffer = Buffer.from(base64Data, 'base64')
      writeFileSync(imagePath, buffer)

      const metaResult = this.readMeta(paperId)
      if (!metaResult.success || !metaResult.data) {
        return { success: false, error: metaResult.error || '读取论文元信息失败' }
      }

      const pageAsset: PaperPageAsset = {
        paperId,
        pageIndex,
        imagePath,
        imageMimeType: 'image/jpeg',
        imageWidth: metadata.imageWidth,
        imageHeight: metadata.imageHeight,
        sourceWidth: metadata.sourceWidth,
        sourceHeight: metadata.sourceHeight,
        renderScale: metadata.renderScale,
        base64Size: buffer.byteLength
      }

      const updateResult = this.updateMeta(paperId, {
        pageAssets: this.upsertPageAsset(metaResult.data, pageAsset)
      })

      if (!updateResult.success) {
        return { success: false, error: updateResult.error || '更新论文元信息失败' }
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存页图失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 读取单页图片（返回 base64 字符串）
   */
  readPageImage(
    paperId: string,
    pageIndex: number
  ): { success: boolean; data?: string; error?: string } {
    try {
      const imagePath = getPaperPageImagePath(paperId, pageIndex)
      if (!existsSync(imagePath)) {
        return { success: false, error: '页图文件不存在' }
      }

      const buffer = readFileSync(imagePath)
      const base64 = buffer.toString('base64')
      return { success: true, data: base64 }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取页图失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  readMergedMd(paperId: string): { success: boolean; data?: string; error?: string } {
    try {
      const mdPath = getPaperMergedMdPath(paperId)
      if (!existsSync(mdPath)) {
        return { success: false, error: 'Markdown 文件不存在' }
      }

      const content = readFileSync(mdPath, 'utf-8')
      return { success: true, data: content }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取 Markdown 失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  saveMergedMd(paperId: string, content: string): { success: boolean; error?: string } {
    try {
      const mdPath = getPaperMergedMdPath(paperId)
      writeFileSync(mdPath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存 Markdown 失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  readTranslationCache(paperId: string): {
    success: boolean
    data?: PaperTranslationCache
    error?: string
  } {
    try {
      const translationPath = getPaperTranslationPath(paperId)
      if (!existsSync(translationPath)) {
        return { success: false, error: '翻译缓存不存在' }
      }

      const content = readFileSync(translationPath, 'utf-8')
      const cache = JSON.parse(content) as PaperTranslationCache
      const replacements = createLocalAssetReplacementMapFromDisk(paperId)
      const localized = localizePaperTranslationCacheAssets(cache, replacements)
      if (localized.changed) {
        writeFileSync(translationPath, JSON.stringify(localized.cache, null, 2), 'utf-8')
      }

      return { success: true, data: localized.cache }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取翻译缓存失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  saveTranslationCache(
    paperId: string,
    cache: PaperTranslationCache
  ): { success: boolean; error?: string } {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        mkdirSync(paperDir, { recursive: true })
      }

      writeFileSync(getPaperTranslationPath(paperId), JSON.stringify(cache, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存翻译缓存失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  clearTranslationCache(paperId: string): { success: boolean; error?: string } {
    try {
      const translationPath = getPaperTranslationPath(paperId)
      if (existsSync(translationPath)) {
        rmSync(translationPath, { force: true })
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('清理翻译缓存失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  readAnnotationStore(paperId: string): {
    success: boolean
    data?: PaperAnnotationStore
    error?: string
  } {
    const result = this.readAnnotationData(paperId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    if (result.data?.kind === 'store' && result.data.store) {
      return { success: true, data: result.data.store }
    }

    return { success: true, data: createEmptyAnnotationStore(paperId) }
  }

  readAnnotationData(paperId: string): {
    success: boolean
    data?: PaperAnnotationData
    error?: string
  } {
    try {
      const annotationsPath = getPaperAnnotationsPath(paperId)
      if (!existsSync(annotationsPath)) {
        return {
          success: true,
          data: {
            kind: 'store',
            store: createEmptyAnnotationStore(paperId)
          }
        }
      }

      const content = readFileSync(annotationsPath, 'utf-8')
      const parsed = JSON.parse(content) as unknown

      if (
        parsed &&
        typeof parsed === 'object' &&
        'version' in parsed &&
        'annotations' in parsed &&
        Array.isArray(parsed.annotations)
      ) {
        const store = parsed as PaperAnnotationStore
        return {
          success: true,
          data: {
            kind: 'store',
            store: normalizeStoredAnnotationStore(paperId, store)
          }
        }
      }

      if (looksLikeLegacyAnnotationArray(parsed)) {
        return {
          success: true,
          data: {
            kind: 'legacy',
            legacyAnnotations: parsed
          }
        }
      }

      return {
        success: true,
        data: {
          kind: 'store',
          store: createEmptyAnnotationStore(paperId)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取论文批注失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  saveAnnotationStore(
    paperId: string,
    store: PaperAnnotationStore
  ): { success: boolean; error?: string } {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        mkdirSync(paperDir, { recursive: true })
      }

      writeFileSync(
        getPaperAnnotationsPath(paperId),
        JSON.stringify(
          {
            ...normalizeStoredAnnotationStore(paperId, store),
            updatedAt: store.updatedAt || new Date().toISOString()
          },
          null,
          2
        ),
        'utf-8'
      )
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存论文批注失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  readNormalizedResult(
    paperId: string,
    pageIndex: number
  ): { success: boolean; data?: PaperPageOcrResult; error?: string } {
    try {
      const normalizedPath = getPaperOcrNormalizedPath(paperId, pageIndex)
      if (!existsSync(normalizedPath)) {
        return { success: false, error: '归一化 OCR 结果不存在' }
      }

      const content = readFileSync(normalizedPath, 'utf-8')
      return { success: true, data: JSON.parse(content) as PaperPageOcrResult }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取归一化 OCR 结果失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  saveNormalizedResult(
    paperId: string,
    pageIndex: number,
    result: PaperPageOcrResult
  ): { success: boolean; error?: string } {
    try {
      const normalizedDir = getPaperOcrNormalizedDirPath(paperId)
      if (!existsSync(normalizedDir)) {
        mkdirSync(normalizedDir, { recursive: true })
      }

      writeFileSync(
        getPaperOcrNormalizedPath(paperId, pageIndex),
        JSON.stringify(result, null, 2),
        'utf-8'
      )
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存归一化 OCR 结果失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  listNormalizedResults(paperId: string): {
    success: boolean
    data?: PaperPageOcrResult[]
    error?: string
  } {
    const metaResult = this.readMeta(paperId)
    if (!metaResult.success || !metaResult.data) {
      return { success: false, error: metaResult.error || '论文元信息不存在' }
    }

    try {
      const results: PaperPageOcrResult[] = []

      for (let pageIndex = 0; pageIndex < metaResult.data.pageCount; pageIndex++) {
        const normalizedPath = getPaperOcrNormalizedPath(paperId, pageIndex)
        if (!existsSync(normalizedPath)) {
          results.push({
            paperId,
            pageIndex,
            markdown: '',
            blocks: [],
            status: 'pending'
          })
          continue
        }

        const content = readFileSync(normalizedPath, 'utf-8')
        results.push(JSON.parse(content) as PaperPageOcrResult)
      }

      return { success: true, data: results }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取归一化 OCR 结果列表失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
