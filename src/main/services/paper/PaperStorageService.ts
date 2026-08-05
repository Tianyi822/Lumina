import path, { dirname } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile, rm, mkdir, copyFile, stat, readdir, rename } from 'fs/promises'
import { createHash } from 'crypto'
import { logger } from '@main/services/logger'
import { WriteQueue } from './WriteQueue'
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
  getPaperSourcePdfPath,
  getPaperTranslationPath
} from './paperPaths'
import {
  createLocalAssetReplacementMapFromDisk,
  localizePaperTranslationCacheAssets
} from './paperAssetLocalizer'
import { resolveContainedPath } from '@main/services/sync/paper/paperPack'

const MAX_PAPER_PAGES = 200
const MAX_PAPER_FILE_SIZE = 200 * 1024 * 1024

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

/**
 * 论文存储服务 — 管理论文数据的磁盘读写
 * 职责：创建/读取/更新论文元信息、页面图片、OCR 结果、
 * 翻译缓存、批注存储等的文件系统操作
 * 使用 WriteQueue 确保同一论文的写操作串行化
 */
export class PaperStorageService {
  private writeQueue = new WriteQueue()

  /**
   * 归一化元信息中的文件路径，确保路径与当前文件系统布局一致
   * 用于迁移旧数据或路径变更后的兼容
   */
  private normalizeMetaPaths(
    paperId: string,
    document: PaperDocument
  ): { document: PaperDocument; changed: boolean } {
    let nextDocument = document
    let changed = false

    const currentPdfPath = getPaperSourcePdfPath(paperId)
    if (existsSync(currentPdfPath) && document.filePath !== currentPdfPath) {
      nextDocument = { ...nextDocument, filePath: currentPdfPath }
      changed = true
    }

    if (document.pageAssets?.length) {
      let pageAssetsChanged = false
      const pageAssets = document.pageAssets.map((asset) => {
        const currentImagePath = getPaperPageImagePath(paperId, asset.pageIndex)
        if (!existsSync(currentImagePath) || asset.imagePath === currentImagePath) {
          return asset
        }

        pageAssetsChanged = true
        return { ...asset, imagePath: currentImagePath }
      })

      if (pageAssetsChanged) {
        nextDocument = { ...nextDocument, pageAssets }
        changed = true
      }
    }

    // 迁移：为旧数据补充 title 字段
    if (nextDocument.title === undefined) {
      nextDocument = {
        ...nextDocument,
        title: nextDocument.fileName.replace(/\.pdf$/i, '')
      }
      changed = true
    }

    return { document: nextDocument, changed }
  }

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

  async ensurePapersDir(): Promise<void> {
    const papersDir = getPapersDirPath()
    if (!existsSync(papersDir)) {
      await mkdir(papersDir, { recursive: true })
      logger.info('创建论文根目录成功', 'main', { path: papersDir })
    }
  }

  async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await readFile(filePath)
    const hash = createHash('sha256')
    hash.update(fileBuffer)
    return hash.digest('hex')
  }

  /**
   * 从本地 PDF 文件创建论文记录
   * 复制 PDF 到论文目录、生成 ID、写入元信息
   */
  async createPaper(
    sourcePdfPath: string,
    ocrModel: string,
    pageCount: number
  ): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
    try {
      if (!existsSync(sourcePdfPath)) {
        return { success: false, error: '源 PDF 文件不存在' }
      }

      const fileStats = await stat(sourcePdfPath)
      const actualFileSize = fileStats.size

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

      const fileName = path.basename(sourcePdfPath) || 'unknown.pdf'
      const title = path.basename(sourcePdfPath, path.extname(sourcePdfPath)) || fileName
      const localPdfPath = getPaperSourcePdfPath(paperId)
      await copyFile(sourcePdfPath, localPdfPath)

      const fileHash = await this.calculateFileHash(localPdfPath)

      const now = new Date().toISOString()
      const document: PaperDocument = {
        id: paperId,
        fileName,
        title,
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

      await this.saveMeta(paperId, document)

      logger.info('创建论文记录成功', 'main', { paperId, fileName, pageCount })
      return { success: true, data: document }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建论文记录失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 读取论文元信息（自动归一化路径）
   */
  async readMeta(
    paperId: string
  ): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
    try {
      const metaPath = getPaperMetaPath(paperId)
      if (!existsSync(metaPath)) {
        return { success: false, error: '论文元信息文件不存在' }
      }

      const content = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(content) as PaperDocument
      const normalized = this.normalizeMetaPaths(paperId, meta)
      if (normalized.changed) {
        // 路径规范化使用 saveMetaCore，避免与外层队列死锁
        const saveResult = await this.saveMetaCore(paperId, normalized.document)
        if (!saveResult.success) {
          logger.warn('论文元信息路径规范化写回失败', 'main', {
            paperId,
            error: saveResult.error
          })
        }
      }
      return { success: true, data: normalized.document }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取论文元信息失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 写入元信息的核心逻辑（不加队列），供队列内部调用
   */
  private async saveMetaCore(
    paperId: string,
    document: PaperDocument
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const metaPath = getPaperMetaPath(paperId)
      await writeFile(metaPath, JSON.stringify(document, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存论文元信息失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 保存论文元信息（通过写入队列确保串行）
   */
  async saveMeta(
    paperId: string,
    document: PaperDocument
  ): Promise<{ success: boolean; error?: string }> {
    return this.writeQueue.enqueue(paperId, () => this.saveMetaCore(paperId, document))
  }

  /**
   * 更新论文元信息（读-改-写模式，通过队列避免竞态）
   */
  async updateMeta(
    paperId: string,
    updates: Partial<PaperDocument>
  ): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
    // 整个 read-then-write 过程放入队列，确保串行执行
    return this.writeQueue.enqueue(paperId, async () => {
      const readResult = await this.readMeta(paperId)
      if (!readResult.success || !readResult.data) {
        return { success: false, error: readResult.error }
      }

      const updated = { ...readResult.data, ...updates, updatedAt: new Date().toISOString() }
      // 队列内部使用 saveMetaCore 避免嵌套排队死锁
      const saveResult = await this.saveMetaCore(paperId, updated)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error }
      }

      return { success: true, data: updated }
    })
  }

  /**
   * 列出所有论文（按创建时间倒序）
   */
  async listPapers(): Promise<{ success: boolean; data?: PaperDocument[]; error?: string }> {
    const probeT0 = performance.now() // PERF-PROBE:firstpaint
    let probeReadMetaCount = 0 // PERF-PROBE:firstpaint
    try {
      await this.ensurePapersDir()

      const papersDir = getPapersDirPath()
      const entries = await readdir(papersDir, { withFileTypes: true })
      const papers: PaperDocument[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const paperId = entry.name
        const metaResult = await this.readMeta(paperId)
        probeReadMetaCount += 1 // PERF-PROBE:firstpaint
        if (metaResult.success && metaResult.data) {
          papers.push(metaResult.data)
        }
      }

      papers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      logger.debug('[PERF-PROBE:firstpaint] listPapers', 'main', {
        // PERF-PROBE:firstpaint
        durationMs: Math.round(performance.now() - probeT0),
        readMetaCount: probeReadMetaCount
      })
      return { success: true, data: papers }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取论文列表失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除整篇论文的目录和文件
   */
  async deletePaper(paperId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        return { success: false, error: '论文目录不存在' }
      }

      await rm(paperDir, { recursive: true, force: true })
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
  /**
   * 保存单页图片（从 base64 数据写入磁盘，同时更新元信息中的 pageAssets）
   */
  async savePageImage(
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
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const pagesDir = getPaperPagesDirPath(paperId)
      if (!existsSync(pagesDir)) {
        await mkdir(pagesDir, { recursive: true })
      }

      const imagePath = getPaperPageImagePath(paperId, pageIndex)
      const buffer = Buffer.from(base64Data, 'base64')
      await writeFile(imagePath, buffer)

      const metaResult = await this.readMeta(paperId)
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

      const updateResult = await this.updateMeta(paperId, {
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
  /**
   * 读取单页图片（返回 base64 编码的图片数据）
   */
  async readPageImage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const imagePath = getPaperPageImagePath(paperId, pageIndex)
      if (!existsSync(imagePath)) {
        return { success: false, error: '页图文件不存在' }
      }

      const buffer = await readFile(imagePath)
      const base64 = buffer.toString('base64')
      return { success: true, data: base64 }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取页图失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 读取合并后的 Markdown 文件
   */
  async readMergedMd(
    paperId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const mdPath = getPaperMergedMdPath(paperId)
      if (!existsSync(mdPath)) {
        return { success: false, error: 'Markdown 文件不存在' }
      }

      const content = await readFile(mdPath, 'utf-8')
      return { success: true, data: content }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取 Markdown 失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  async saveMergedMd(
    paperId: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const mdPath = getPaperMergedMdPath(paperId)
      await writeFile(mdPath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存 Markdown 失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 读取翻译缓存（自动本地化缓存中的图片资源 URL）
   */
  async readTranslationCache(paperId: string): Promise<{
    success: boolean
    data?: PaperTranslationCache
    error?: string
  }> {
    try {
      const translationPath = getPaperTranslationPath(paperId)
      if (!existsSync(translationPath)) {
        return { success: false, error: '翻译缓存不存在' }
      }

      const content = await readFile(translationPath, 'utf-8')
      const cache = JSON.parse(content) as PaperTranslationCache
      const replacements = await createLocalAssetReplacementMapFromDisk(paperId)
      const localized = localizePaperTranslationCacheAssets(cache, replacements)
      if (localized.changed) {
        await writeFile(translationPath, JSON.stringify(localized.cache, null, 2), 'utf-8')
      }

      return { success: true, data: localized.cache }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取翻译缓存失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 保存翻译缓存（使用独立队列 key 避免与元信息写入竞争）
   */
  async saveTranslationCache(
    paperId: string,
    cache: PaperTranslationCache
  ): Promise<{ success: boolean; error?: string }> {
    // 使用不同 key 后缀，避免与 meta 写入竞争同一队列
    return this.writeQueue.enqueue(`${paperId}:translation`, async () => {
      try {
        const paperDir = getPaperDirPath(paperId)
        if (!existsSync(paperDir)) {
          await mkdir(paperDir, { recursive: true })
        }

        await writeFile(getPaperTranslationPath(paperId), JSON.stringify(cache, null, 2), 'utf-8')
        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('保存翻译缓存失败', 'main', { paperId, error: errorMessage })
        return { success: false, error: errorMessage }
      }
    })
  }

  async clearTranslationCache(paperId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const translationPath = getPaperTranslationPath(paperId)
      if (existsSync(translationPath)) {
        await rm(translationPath, { force: true })
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('清理翻译缓存失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 读取批注存储（统一入口，返回 V3 格式的 store）
   */
  async readAnnotationStore(paperId: string): Promise<{
    success: boolean
    data?: PaperAnnotationStore
    error?: string
  }> {
    const result = await this.readAnnotationData(paperId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    if (result.data?.kind === 'store' && result.data.store) {
      return { success: true, data: result.data.store }
    }

    return { success: true, data: createEmptyAnnotationStore(paperId) }
  }

  /**
   * 读取原始批注数据（检测并兼容旧版格式）
   * 返回值为 'store'(V3格式) 或 'legacy'(旧版pageIndex/blockIndex格式)
   */
  async readAnnotationData(paperId: string): Promise<{
    success: boolean
    data?: PaperAnnotationData
    error?: string
  }> {
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

      const content = await readFile(annotationsPath, 'utf-8')
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

  /**
   * 保存批注存储到磁盘
   */
  async saveAnnotationStore(
    paperId: string,
    store: PaperAnnotationStore
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        await mkdir(paperDir, { recursive: true })
      }

      await writeFile(
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

  async readNormalizedResult(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; data?: PaperPageOcrResult; error?: string }> {
    try {
      const normalizedPath = getPaperOcrNormalizedPath(paperId, pageIndex)
      if (!existsSync(normalizedPath)) {
        return { success: false, error: '归一化 OCR 结果不存在' }
      }

      const content = await readFile(normalizedPath, 'utf-8')
      return { success: true, data: JSON.parse(content) as PaperPageOcrResult }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('读取归一化 OCR 结果失败', 'main', { paperId, pageIndex, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  async saveNormalizedResult(
    paperId: string,
    pageIndex: number,
    result: PaperPageOcrResult
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedDir = getPaperOcrNormalizedDirPath(paperId)
      if (!existsSync(normalizedDir)) {
        await mkdir(normalizedDir, { recursive: true })
      }

      await writeFile(
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

  /**
   * 列出所有页面的归一化 OCR 结果（缺失页返回 pending 状态）
   */
  async listNormalizedResults(paperId: string): Promise<{
    success: boolean
    data?: PaperPageOcrResult[]
    error?: string
  }> {
    const metaResult = await this.readMeta(paperId)
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

        const content = await readFile(normalizedPath, 'utf-8')
        results.push(JSON.parse(content) as PaperPageOcrResult)
      }

      return { success: true, data: results }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取归一化 OCR 结果列表失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  // ============ 同步引擎专用接口（走 writeQueue 串行化） ============

  /** 同步下行 meta（复用 saveMeta 路径语义，走 writeQueue） */
  async applySyncedMeta(
    paperId: string,
    meta: PaperDocument
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 确保论文目录存在（新设备首次下行时目录可能不存在，saveMetaCore 的 writeFile
      // 不会自动建目录，否则会 ENOENT）
      const paperDir = getPaperDirPath(paperId)
      await mkdir(paperDir, { recursive: true })
      // 归一化机器相关路径（filePath / pageAssets[].imagePath）——远端 meta 携带的
      // 是远端机器路径，原样落盘会导致本地 re-scan 计算出的字节 hash 与 tracker
      // 的 contentHash 不一致，触发虚假重传。复用 normalizeMetaPaths 使落盘字节与
      // readMeta 归一化结果保持一致。
      const normalized = this.normalizeMetaPaths(paperId, meta)
      const result = await this.saveMeta(paperId, normalized.document)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 同步下行批注（复用 saveAnnotationStore 路径语义） */
  async applySyncedAnnotations(
    paperId: string,
    store: PaperAnnotationStore
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.saveAnnotationStore(paperId, store)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 同步下行 pack 文件（containment 校验 → mkdir → rename） */
  async applySyncedPackFile(
    paperId: string,
    relPath: string,
    stagingFilePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const paperDir = getPaperDirPath(paperId)
      const targetPath = resolveContainedPath(paperDir, relPath)
      if (!targetPath) {
        return { success: false, error: `路径越界：${relPath}` }
      }
      const targetDir = dirname(targetPath)
      await mkdir(targetDir, { recursive: true })
      await rename(stagingFilePath, targetPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
