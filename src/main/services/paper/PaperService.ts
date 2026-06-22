import { existsSync } from 'fs'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import { net } from 'electron'
import { logger } from '@main/services/logger'
import { getFileService, getPaperFileResourceId, getPaperNoteResourceId } from '@main/services/file'
import { getKnowledgeServiceManager } from '@main/services/knowledge'
import { paperStorageService } from './index'
import { PaperOcrService, type OcrProgressInfo } from './PaperOcrService'
import {
  buildReaderDocument,
  extractPaperFigureData,
  type ExtractedPaperFigureData
} from './paperFigureExtractor'
import {
  getPaperDirPath,
  getPaperOcrNormalizedPath,
  getPaperReaderDocumentPath
} from './paperPaths'
import { localizePaperPageAssets } from './paperAssetLocalizer'
import type {
  CreatePaperAnnotationPayload,
  LegacyPaperAnnotation,
  PaperAnnotation,
  PaperAnnotationAffectedKnowledgeBase,
  PaperAnnotationStore,
  PaperDocument,
  PaperFigureItem,
  PaperLayoutBlock,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperPageOcrResult,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import { PAPER_ANNOTATION_NOTE_COLOR_KEY } from '@shared/types/paper'
import { buildPaperTextAnchor } from '@shared/utils/paperAnnotationAnchors'
import {
  PAPER_ANNOTATION_INDEX_LOADING_MESSAGE,
  isFallbackPaperSegmentStableId
} from '@shared/utils/paperAnnotationReadiness'
import {
  PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE,
  findPaperAnnotationNoteConflict
} from '@shared/utils/paperAnnotationConflicts'
import { removeTranslationAnnotationsFromStore } from '@shared/utils/paperTranslationAnnotations'
import { createEmptyPaperAnnotationStore, normalizeAnnotationContent } from './paperAnnotationRules'

function getLocalAssetFilePath(paperId: string, localAssetPath: string): string {
  return join(getPaperDirPath(paperId), localAssetPath)
}

function getResolvedFigureImagePath(paperId: string, block: PaperLayoutBlock): string | undefined {
  if (block.localAssetPath) {
    const localFilePath = getLocalAssetFilePath(paperId, block.localAssetPath)
    if (existsSync(localFilePath)) {
      return localFilePath
    }
  }

  return undefined
}

async function downloadCropImage(remoteUrl: string, localPath: string): Promise<boolean> {
  try {
    const response = await net.fetch(remoteUrl)
    if (!response.ok) {
      return false
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    // mkdir 配合 recursive: true 不会在目录已存在时抛错，无需提前 existsSync 检查
    await mkdir(dirname(localPath), { recursive: true })
    await writeFile(localPath, buffer)
    return true
  } catch {
    return false
  }
}

const READER_DOCUMENT_BUILDER_VERSION = 1

interface ReaderDocumentPageSignature {
  pageIndex: number
  exists: boolean
  size: number
  mtimeMs: number
}

interface ReaderDocumentSourceSignature {
  pageCount: number
  pages: ReaderDocumentPageSignature[]
}

interface ReaderDocumentCacheFile {
  builderVersion: number
  sourceSignature: ReaderDocumentSourceSignature
  readerDocument: PaperReaderDocument
  figures: PaperFigureItem[]
}

export interface PaperReaderPayload {
  readerDocument: PaperReaderDocument
  figures: PaperFigureItem[]
}

function areReaderSourceSignaturesEqual(
  left: ReaderDocumentSourceSignature,
  right: ReaderDocumentSourceSignature
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isReaderDocumentCacheFile(value: unknown): value is ReaderDocumentCacheFile {
  if (!value || typeof value !== 'object') return false
  const cache = value as Partial<ReaderDocumentCacheFile>
  return (
    cache.builderVersion === READER_DOCUMENT_BUILDER_VERSION &&
    !!cache.sourceSignature &&
    !!cache.readerDocument &&
    Array.isArray(cache.readerDocument.segments) &&
    typeof cache.readerDocument.markdown === 'string' &&
    Array.isArray(cache.figures)
  )
}

/**
 * 论文服务 — 核心门面类
 * 协调 OCR 管线、阅读器文档构建、批注管理、图表提取、翻译等子系统
 * 渲染进程通过 window.api.paper.* 调用此服务的公开方法
 */
export class PaperService {
  private readonly ocrService = new PaperOcrService()

  private createEmptyAnnotationStore(paperId: string): PaperAnnotationStore {
    return createEmptyPaperAnnotationStore(paperId)
  }

  /**
   * 构建阅读器文档的源签名（每页 OCR 结果的文件大小和修改时间）
   * 用于判断缓存是否失效
   */
  private async buildReaderSourceSignature(paperId: string): Promise<{
    success: boolean
    data?: ReaderDocumentSourceSignature
    error?: string
  }> {
    const metaResult = await paperStorageService.readMeta(paperId)
    if (!metaResult.success || !metaResult.data) {
      return { success: false, error: metaResult.error || '论文元信息不存在' }
    }

    const pages: ReaderDocumentPageSignature[] = []
    for (let pageIndex = 0; pageIndex < metaResult.data.pageCount; pageIndex += 1) {
      const normalizedPath = getPaperOcrNormalizedPath(paperId, pageIndex)
      if (!existsSync(normalizedPath)) {
        pages.push({ pageIndex, exists: false, size: 0, mtimeMs: 0 })
        continue
      }

      const fileStats = await stat(normalizedPath)
      pages.push({
        pageIndex,
        exists: true,
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs
      })
    }

    return {
      success: true,
      data: {
        pageCount: metaResult.data.pageCount,
        pages
      }
    }
  }

  /**
   * 读取阅读器文档缓存（若签名匹配则直接返回缓存）
   * 缓存失效或不存在时返回 null，由调用方重新构建
   */
  private async readReaderPayloadCache(
    paperId: string,
    sourceSignature: ReaderDocumentSourceSignature
  ): Promise<PaperReaderPayload | null> {
    const cachePath = getPaperReaderDocumentPath(paperId)
    if (!existsSync(cachePath)) {
      return null
    }

    try {
      const cache = JSON.parse(await readFile(cachePath, 'utf-8')) as unknown
      if (!isReaderDocumentCacheFile(cache)) {
        return null
      }

      if (!areReaderSourceSignaturesEqual(cache.sourceSignature, sourceSignature)) {
        return null
      }

      return {
        readerDocument: cache.readerDocument,
        figures: cache.figures
      }
    } catch (error) {
      logger.warn('读取阅读器文档缓存失败，将重新生成', 'main', {
        paperId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private async saveReaderPayloadCache(
    paperId: string,
    sourceSignature: ReaderDocumentSourceSignature,
    payload: PaperReaderPayload
  ): Promise<void> {
    try {
      const paperDir = getPaperDirPath(paperId)
      if (!existsSync(paperDir)) {
        await mkdir(paperDir, { recursive: true })
      }

      const cache: ReaderDocumentCacheFile = {
        builderVersion: READER_DOCUMENT_BUILDER_VERSION,
        sourceSignature,
        readerDocument: payload.readerDocument,
        figures: payload.figures
      }
      await writeFile(getPaperReaderDocumentPath(paperId), JSON.stringify(cache, null, 2), 'utf-8')
    } catch (error) {
      logger.warn('写入阅读器文档缓存失败', 'main', {
        paperId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 获取阅读器负载（阅读器文档 + 图表列表）
   * 优先使用缓存，缓存失效时重新构建并缓存
   */
  async getReaderPayload(paperId: string): Promise<{
    success: boolean
    data?: PaperReaderPayload
    error?: string
  }> {
    const probeT0 = performance.now() // PERF-PROBE:firstpaint
    const signatureResult = await this.buildReaderSourceSignature(paperId)
    if (!signatureResult.success || !signatureResult.data) {
      return { success: false, error: signatureResult.error || '生成阅读器文档签名失败' }
    }

    const cachedPayload = await this.readReaderPayloadCache(paperId, signatureResult.data)
    if (cachedPayload) {
      logger.debug('[PERF-PROBE:firstpaint] getReaderPayload cache hit', 'main', {
        // PERF-PROBE:firstpaint
        paperId,
        durationMs: Math.round(performance.now() - probeT0)
      })
      return { success: true, data: cachedPayload }
    }

    const resultsResult = await paperStorageService.listNormalizedResults(paperId)
    if (!resultsResult.success || !resultsResult.data) {
      return { success: false, error: resultsResult.error || '读取论文正文失败' }
    }

    const pageResults = await this.ensureLocalFigureAssets(paperId, resultsResult.data)
    const figureData = this.extractFigureData(paperId, pageResults)
    const payload: PaperReaderPayload = {
      readerDocument: buildReaderDocument(paperId, pageResults, figureData),
      figures: figureData.figures
    }
    const nextSignature =
      (await this.buildReaderSourceSignature(paperId)).data || signatureResult.data
    await this.saveReaderPayloadCache(paperId, nextSignature, payload)
    logger.debug('[PERF-PROBE:firstpaint] getReaderPayload cache miss (built)', 'main', {
      // PERF-PROBE:firstpaint
      paperId,
      durationMs: Math.round(performance.now() - probeT0)
    })
    return { success: true, data: payload }
  }

  /**
   * 获取笔记类批注中最新的 updatedAt 时间戳
   * 用于同步知识库时判断是否需要重新索引
   */
  private getLatestAnnotationUpdatedAt(annotations: PaperAnnotation[]): string {
    return (
      annotations
        .filter((annotation) => annotation.kind === 'note')
        .map((annotation) => annotation.updatedAt)
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0] || new Date().toISOString()
    )
  }

  /**
   * 将论文笔记同步到文件池（FileService），并在内容变更时标记关联知识库需重新索引
   * @returns 受影响的关联知识库列表
   */
  private async syncPaperNotesResource(
    paperId: string,
    annotations: PaperAnnotation[]
  ): Promise<PaperAnnotationAffectedKnowledgeBase[]> {
    if (!annotations.some((annotation) => annotation.kind === 'note')) {
      const result = await getFileService().removePaperNotesResource(paperId)
      if (!result.success) {
        logger.warn('移除论文笔记资源失败', 'main', { paperId, error: result.error })
      }
      return []
    }

    const metaResult = await paperStorageService.readMeta(paperId)
    if (!metaResult.success || !metaResult.data) {
      logger.warn('同步论文笔记到文件池失败：论文元信息不存在', 'main', {
        paperId
      })
      return []
    }

    const result = await getFileService().upsertPaperNotesResource(metaResult.data, annotations)
    if (!result.success) {
      logger.warn('同步论文笔记到文件池失败', 'main', {
        paperId,
        error: result.error
      })
      return []
    }

    const shouldReindex = result.contentChanged || result.legacyMigrated
    if (!shouldReindex || !result.file || !result.previousUsedByKBIds?.length) {
      return []
    }

    return await getKnowledgeServiceManager().markKnowledgeBasesNeedReindex(
      result.previousUsedByKBIds,
      {
        fileId: result.file.id,
        fileName: result.file.name,
        paperId,
        updatedAt: this.getLatestAnnotationUpdatedAt(annotations)
      }
    )
  }

  private async markPaperNoteKnowledgeBasesNeedReindex(
    kbIds: string[],
    paperId: string,
    fileId: string,
    fileName: string,
    updatedAt: string
  ): Promise<PaperAnnotationAffectedKnowledgeBase[]> {
    return await getKnowledgeServiceManager().markKnowledgeBasesNeedReindex(kbIds, {
      fileId,
      fileName,
      paperId,
      updatedAt
    })
  }

  /**
   * 修复单篇论文的文件池资源（论文文件 + 笔记文件）
   * 检查文件是否与记录一致，不一致时重新注册/同步
   */
  async repairPaperResources(paperId: string): Promise<{
    success: boolean
    paperFileRepaired?: boolean
    noteFilesRepaired?: number
    affectedKnowledgeBaseCount?: number
    error?: string
  }> {
    try {
      const fileService = getFileService()
      const metaResult = await paperStorageService.readMeta(paperId)
      if (!metaResult.success || !metaResult.data) {
        return { success: false, error: metaResult.error || '论文元信息不存在' }
      }

      const paper = metaResult.data
      let paperFileRepaired = false
      let noteFilesRepaired = 0
      let affectedKnowledgeBaseCount = 0
      const errors: string[] = []

      // 检查论文文件在文件池中的记录是否与当前元信息一致
      const paperFileId = getPaperFileResourceId(paperId)
      const existingPaperFile = fileService.getFileById(paperFileId)
      const paperFileNeedsRepair =
        !existingPaperFile ||
        existingPaperFile.absolutePath !== paper.filePath ||
        existingPaperFile.name !== paper.fileName ||
        existingPaperFile.size !== paper.fileSize ||
        existingPaperFile.contentHash !== paper.fileHash
      const registerResult = await fileService.registerPaperFile(paper)
      if (!registerResult.success) {
        errors.push(registerResult.error || '同步论文文件失败')
      } else if (paperFileNeedsRepair) {
        paperFileRepaired = true
      }

      // 检查笔记文件在文件池中的记录
      const storeResult = await paperStorageService.readAnnotationStore(paperId)
      if (storeResult.success && storeResult.data) {
        const noteFileId = getPaperNoteResourceId(paperId)
        const existingNoteFile = fileService.getFileById(noteFileId)
        const upsertResult = await fileService.upsertPaperNotesResource(
          paper,
          storeResult.data.annotations
        )
        if (!upsertResult.success) {
          errors.push(upsertResult.error || '同步论文笔记失败')
        } else {
          const removedFileCount = upsertResult.removedFileIds?.length || 0
          if (
            !existingNoteFile ||
            upsertResult.contentChanged ||
            upsertResult.legacyMigrated ||
            removedFileCount > 0
          ) {
            noteFilesRepaired = upsertResult.file ? 1 : removedFileCount
          }

          const shouldReindex = upsertResult.contentChanged || upsertResult.legacyMigrated
          if (shouldReindex && upsertResult.file && upsertResult.previousUsedByKBIds?.length) {
            const affectedKnowledgeBases = await this.markPaperNoteKnowledgeBasesNeedReindex(
              upsertResult.previousUsedByKBIds,
              paperId,
              upsertResult.file.id,
              upsertResult.file.name,
              this.getLatestAnnotationUpdatedAt(storeResult.data.annotations)
            )
            affectedKnowledgeBaseCount += affectedKnowledgeBases.length
          }
        }
      } else if (!storeResult.success) {
        errors.push(storeResult.error || '读取论文批注失败')
      }

      if (paperFileRepaired || noteFilesRepaired > 0 || affectedKnowledgeBaseCount > 0) {
        logger.info('论文资源修复完成', 'main', {
          paperId,
          paperFileRepaired,
          noteFilesRepaired,
          affectedKnowledgeBaseCount
        })
      }

      return {
        success: errors.length === 0,
        paperFileRepaired,
        noteFilesRepaired,
        affectedKnowledgeBaseCount,
        error: errors.length > 0 ? errors.join('; ') : undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('修复论文资源失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 修复所有论文的文件池资源，遍历每篇论文调用 repairPaperResources
   */
  async repairAllPaperResources(): Promise<{
    success: boolean
    repairedPapers: number
    paperFilesRepaired: number
    noteFilesRepaired: number
    affectedKnowledgeBaseCount: number
    failedPaperIds: string[]
    error?: string
  }> {
    const listResult = await paperStorageService.listPapers()
    if (!listResult.success || !listResult.data) {
      return {
        success: false,
        repairedPapers: 0,
        paperFilesRepaired: 0,
        noteFilesRepaired: 0,
        affectedKnowledgeBaseCount: 0,
        failedPaperIds: [],
        error: listResult.error || '获取论文列表失败'
      }
    }

    let repairedPapers = 0
    let paperFilesRepaired = 0
    let noteFilesRepaired = 0
    let affectedKnowledgeBaseCount = 0
    const failedPaperIds: string[] = []

    for (const paper of listResult.data) {
      const result = await this.repairPaperResources(paper.id)
      if (!result.success) {
        failedPaperIds.push(paper.id)
      }

      if (result.paperFileRepaired || (result.noteFilesRepaired || 0) > 0) {
        repairedPapers++
      }
      if (result.paperFileRepaired) {
        paperFilesRepaired++
      }
      noteFilesRepaired += result.noteFilesRepaired || 0
      affectedKnowledgeBaseCount += result.affectedKnowledgeBaseCount || 0
    }

    return {
      success: failedPaperIds.length === 0,
      repairedPapers,
      paperFilesRepaired,
      noteFilesRepaired,
      affectedKnowledgeBaseCount,
      failedPaperIds,
      error:
        failedPaperIds.length > 0 ? `部分论文资源修复失败: ${failedPaperIds.join(', ')}` : undefined
    }
  }

  /**
   * 在阅读器文档中查找旧版批注对应的段落
   * 通过 pageIndex、blockIndex、选中文本等进行评分匹配
   * @returns 匹配到的段落和偏移，或 null
   */
  private findLegacyAnnotationSegment(
    readerDocument: PaperReaderDocument,
    legacyAnnotation: LegacyPaperAnnotation
  ): {
    segment: PaperReaderSegment
    matchedOffset: number | null
  } | null {
    const allSegments = readerDocument.segments
    if (allSegments.length === 0) {
      return null
    }

    const pageAndBlockMatches = allSegments.filter((segment) => {
      return (
        segment.sourceRefs.pageIndexes.includes(legacyAnnotation.pageIndex) &&
        segment.sourceRefs.blockIndexes.includes(legacyAnnotation.blockIndex)
      )
    })
    const pageMatches = allSegments.filter((segment) => {
      return segment.sourceRefs.pageIndexes.includes(legacyAnnotation.pageIndex)
    })
    const searchSegments =
      pageAndBlockMatches.length > 0
        ? pageAndBlockMatches
        : pageMatches.length > 0
          ? pageMatches
          : allSegments

    let bestMatch: {
      segment: PaperReaderSegment
      matchedOffset: number | null
      score: number
    } | null = null

    for (const segment of searchSegments) {
      const exactOffset = segment.originalText.indexOf(
        legacyAnnotation.selectedText,
        Math.max(0, legacyAnnotation.startOffset)
      )
      const fallbackOffset =
        exactOffset >= 0 ? exactOffset : segment.originalText.indexOf(legacyAnnotation.selectedText)

      let score = 0
      if (segment.sourceRefs.pageIndexes.includes(legacyAnnotation.pageIndex)) {
        score += 32
      }
      if (segment.sourceRefs.blockIndexes.includes(legacyAnnotation.blockIndex)) {
        score += 48
      }
      if (segment.sourceRefs.start?.pageIndex === legacyAnnotation.pageIndex) {
        score += 8
      }
      if (segment.sourceRefs.start?.blockIndex === legacyAnnotation.blockIndex) {
        score += 12
      }
      if (fallbackOffset !== -1) {
        score += 96 - Math.min(48, Math.abs(fallbackOffset - legacyAnnotation.startOffset))
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          segment,
          matchedOffset: fallbackOffset >= 0 ? fallbackOffset : null,
          score
        }
      }
    }

    if (!bestMatch) {
      return null
    }

    return {
      segment: bestMatch.segment,
      matchedOffset: bestMatch.matchedOffset
    }
  }

  /**
   * 迁移旧版批注（按 pageIndex/blockIndex 索引）到新版批注存储（按段落 stableId 索引）
   */
  private migrateLegacyAnnotations(
    paperId: string,
    legacyAnnotations: LegacyPaperAnnotation[],
    readerDocument: PaperReaderDocument
  ): PaperAnnotationStore {
    const now = new Date().toISOString()
    const migratedAnnotations = legacyAnnotations.reduce<PaperAnnotation[]>(
      (annotations, legacyAnnotation) => {
        const matched = this.findLegacyAnnotationSegment(readerDocument, legacyAnnotation)
        const fallbackSegment = matched?.segment || readerDocument.segments[0]
        if (!fallbackSegment) {
          return annotations
        }

        const selectedTextLength = Math.max(legacyAnnotation.selectedText.length, 1)
        const baseOffset =
          matched?.matchedOffset ??
          Math.max(
            0,
            Math.min(legacyAnnotation.startOffset, fallbackSegment.originalText.length - 1)
          )
        const endOffset = Math.min(
          fallbackSegment.originalText.length,
          Math.max(baseOffset + 1, baseOffset + selectedTextLength)
        )
        const originalAnchor = buildPaperTextAnchor(
          fallbackSegment.originalText,
          baseOffset,
          endOffset
        )

        annotations.push({
          id: legacyAnnotation.id,
          paperId,
          kind: 'note' as const,
          noteType: 'original_span' as const,
          createdInView: 'original' as const,
          semanticAnchor: {
            segmentStableId: fallbackSegment.stableId,
            renderSegmentIdAtCreation: fallbackSegment.renderId,
            sourceRevisionId: fallbackSegment.sourceRevisionId,
            segmentTextHash: fallbackSegment.textHash,
            sourceRefs: fallbackSegment.sourceRefs
          },
          originalAnchor: {
            ...originalAnchor,
            selectedText: legacyAnnotation.selectedText || originalAnchor.selectedText,
            normalizedText:
              legacyAnnotation.selectedText.replace(/\s+/g, ' ').trim() ||
              originalAnchor.normalizedText
          },
          selectedTextSnapshot: legacyAnnotation.selectedText,
          contextBefore: originalAnchor.prefixText,
          contextAfter: originalAnchor.suffixText,
          comment: legacyAnnotation.comment,
          colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY,
          status: 'active',
          recoveryMeta: {
            recoveryFailureCount: matched?.matchedOffset !== null ? 0 : 1,
            lastResolvedAt: matched?.matchedOffset !== null ? now : undefined,
            lastRecoveryAttemptAt: now
          },
          createdAt: legacyAnnotation.createdAt,
          updatedAt: legacyAnnotation.updatedAt || legacyAnnotation.createdAt
        })

        return annotations
      },
      []
    )

    return {
      version: 3,
      paperId,
      annotations: migratedAnnotations,
      updatedAt: now
    }
  }

  /**
   * 解析批注存储：优先读新版 V3 格式，若存在旧版格式则自动迁移
   */
  private async resolveAnnotationStore(
    paperId: string,
    readerDocument?: PaperReaderDocument
  ): Promise<{ success: boolean; data?: PaperAnnotationStore; error?: string }> {
    const annotationDataResult = await paperStorageService.readAnnotationData(paperId)
    if (!annotationDataResult.success || !annotationDataResult.data) {
      return { success: false, error: annotationDataResult.error || '读取论文批注失败' }
    }

    if (annotationDataResult.data.kind === 'store' && annotationDataResult.data.store) {
      return {
        success: true,
        data: annotationDataResult.data.store
      }
    }

    let nextReaderDocument = readerDocument
    if (!nextReaderDocument) {
      const readerResult = await this.getReaderDocument(paperId)
      nextReaderDocument = readerResult.success && readerResult.data ? readerResult.data : undefined
    }

    if (!nextReaderDocument) {
      return { success: false, error: '读取阅读器文档失败，无法迁移旧版批注' }
    }

    const migratedStore = this.migrateLegacyAnnotations(
      paperId,
      annotationDataResult.data.legacyAnnotations || [],
      nextReaderDocument
    )
    const saveResult = await paperStorageService.saveAnnotationStore(paperId, migratedStore)
    if (!saveResult.success) {
      return { success: false, error: saveResult.error || '迁移旧版批注失败' }
    }

    logger.info('旧版论文批注迁移完成', 'main', {
      paperId,
      count: migratedStore.annotations.length
    })

    return {
      success: true,
      data: migratedStore
    }
  }

  /**
   * 获取所有论文列表（按创建时间倒序）
   */
  async listPapers(): Promise<{ success: boolean; data?: PaperDocument[]; error?: string }> {
    return paperStorageService.listPapers()
  }

  /**
   * 获取单篇论文的元信息
   */
  async getPaper(
    paperId: string
  ): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
    return paperStorageService.readMeta(paperId)
  }

  /**
   * 删除论文（清理文件池资源 + 存储目录）
   */
  async deletePaper(paperId: string): Promise<{ success: boolean; error?: string }> {
    this.ocrService.offProgress(paperId)
    const removeResourceResult = await getFileService().removePaperResources(paperId)
    if (!removeResourceResult.success) {
      return {
        success: false,
        error: removeResourceResult.error || '清理论文知识库资源失败'
      }
    }
    return paperStorageService.deletePaper(paperId)
  }

  /**
   * 删除论文译文（清理翻译缓存 + 移除关联的译文批注）
   */
  async deleteTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    const clearResult = await paperStorageService.clearTranslationCache(paperId)
    if (!clearResult.success) {
      return { success: false, error: clearResult.error || '删除译文失败' }
    }

    const storeResult = await paperStorageService.readAnnotationStore(paperId)
    if (!storeResult.success || !storeResult.data) {
      return { success: false, error: storeResult.error || '读取论文标注失败' }
    }

    const cleanupResult = removeTranslationAnnotationsFromStore(
      storeResult.data,
      new Date().toISOString()
    )
    if (cleanupResult.removedAnnotations.length === 0) {
      return { success: true }
    }

    const saveResult = await paperStorageService.saveAnnotationStore(
      paperId,
      cleanupResult.nextStore
    )
    if (!saveResult.success) {
      return { success: false, error: saveResult.error || '清理译文标注失败' }
    }

    if (cleanupResult.removedAnnotations.some((annotation) => annotation.kind === 'note')) {
      await this.syncPaperNotesResource(paperId, cleanupResult.nextStore.annotations)
    }

    logger.info('删除译文时已同步清理译文标注', 'main', {
      paperId,
      removedCount: cleanupResult.removedAnnotations.length
    })

    return { success: true }
  }

  /**
   * 启动论文 OCR 处理管线
   */
  async startOcr(paperId: string): Promise<{ success: boolean; error?: string }> {
    logger.info('启动 OCR 任务', 'main', { paperId })
    return this.ocrService.startOcr(paperId)
  }

  cancelOcr(paperId: string): void {
    this.ocrService.cancelOcr(paperId)
  }

  getOcrProgress(paperId: string): OcrProgressInfo | undefined {
    return this.ocrService.getProgress(paperId)
  }

  async retryPage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; error?: string }> {
    logger.info('重试单页 OCR', 'main', { paperId, pageIndex })
    return this.ocrService.retryPage(paperId, pageIndex)
  }

  onOcrProgress(paperId: string, callback: (progress: OcrProgressInfo) => void): void {
    this.ocrService.onProgress(paperId, callback)
  }

  offOcrProgress(paperId: string): void {
    this.ocrService.offProgress(paperId)
  }

  isOcrActive(paperId: string): boolean {
    return this.ocrService.isOcrActive(paperId)
  }

  /**
   * 获取论文中的图表列表
   */
  async listFigures(
    paperId: string
  ): Promise<{ success: boolean; data?: PaperFigureItem[]; error?: string }> {
    const payloadResult = await this.getReaderPayload(paperId)
    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error || '读取论文图片失败' }
    }

    return {
      success: true,
      data: payloadResult.data.figures
    }
  }

  /**
   * 获取论文的阅读器 Markdown 文本
   */
  async getReaderMarkdown(
    paperId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const payloadResult = await this.getReaderPayload(paperId)
    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error || '读取论文正文失败' }
    }

    return { success: true, data: payloadResult.data.readerDocument.markdown }
  }

  /**
   * 获取完整的阅读器文档对象（含段落实体、来源引用等）
   */
  async getReaderDocument(paperId: string): Promise<{
    success: boolean
    data?: PaperReaderDocument
    error?: string
  }> {
    const payloadResult = await this.getReaderPayload(paperId)
    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error || '读取论文正文失败' }
    }

    return { success: true, data: payloadResult.data.readerDocument }
  }

  /**
   * 获取论文所有批注列表
   */
  async listAnnotations(paperId: string): Promise<{
    success: boolean
    data?: PaperAnnotation[]
    error?: string
  }> {
    const readerResult = await this.getReaderDocument(paperId)
    if (!readerResult.success || !readerResult.data) {
      return { success: false, error: readerResult.error || '读取阅读器文档失败' }
    }

    const annotationStoreResult = await this.resolveAnnotationStore(paperId, readerResult.data)
    if (!annotationStoreResult.success || !annotationStoreResult.data) {
      return { success: false, error: annotationStoreResult.error || '读取论文批注失败' }
    }

    return {
      success: true,
      data: annotationStoreResult.data.annotations
    }
  }

  /**
   * 创建新的论文批注（高亮或笔记）
   * 验证锚点段落存在后写入存储，笔记类批注同步到文件池
   */
  async createAnnotation(params: CreatePaperAnnotationPayload): Promise<{
    success: boolean
    data?: PaperAnnotation
    error?: string
  }> {
    try {
      const readerResult = await this.getReaderDocument(params.paperId)
      if (!readerResult.success || !readerResult.data) {
        return { success: false, error: readerResult.error || '读取阅读器文档失败' }
      }

      const targetSegment = readerResult.data.segments.find((segment) => {
        return segment.stableId === params.semanticAnchor.segmentStableId
      })
      if (!targetSegment) {
        const segmentStableId = params.semanticAnchor.segmentStableId
        return {
          success: false,
          error: isFallbackPaperSegmentStableId(segmentStableId)
            ? PAPER_ANNOTATION_INDEX_LOADING_MESSAGE
            : `当前批注对应的原文段落不存在 (segmentStableId: ${segmentStableId})`
        }
      }

      if (params.noteType === 'original_span' && !params.originalAnchor) {
        return { success: false, error: '原文锚定批注缺少原文文本锚点' }
      }

      if (params.noteType === 'translation_view' && !params.translationAnchor) {
        return { success: false, error: '译文视图批注缺少译文文本锚点' }
      }

      const normalizedContentResult = normalizeAnnotationContent(
        params.kind,
        params.colorKey,
        params.comment
      )
      if (!normalizedContentResult.success) {
        return { success: false, error: normalizedContentResult.error }
      }

      const annotationStoreResult = await this.resolveAnnotationStore(
        params.paperId,
        readerResult.data
      )
      if (!annotationStoreResult.success) {
        return { success: false, error: annotationStoreResult.error || '读取论文批注失败' }
      }

      const now = new Date().toISOString()
      const nextAnnotation: PaperAnnotation = {
        id: randomUUID(),
        paperId: params.paperId,
        kind: params.kind,
        noteType: params.noteType,
        createdInView: params.createdInView,
        semanticAnchor: {
          segmentStableId: targetSegment.stableId,
          renderSegmentIdAtCreation: targetSegment.renderId,
          sourceRevisionId: readerResult.data.sourceRevisionId,
          segmentTextHash: targetSegment.textHash,
          sourceRefs: targetSegment.sourceRefs
        },
        originalAnchor: params.originalAnchor ? { ...params.originalAnchor } : undefined,
        translationAnchor: params.translationAnchor ? { ...params.translationAnchor } : undefined,
        selectedTextSnapshot: params.selectedTextSnapshot,
        contextBefore: params.contextBefore,
        contextAfter: params.contextAfter,
        comment: normalizedContentResult.data.comment,
        colorKey: normalizedContentResult.data.colorKey,
        status: 'active',
        recoveryMeta: {
          recoveryFailureCount: 0,
          lastResolvedAt: now
        },
        createdAt: now,
        updatedAt: now
      }

      const currentStore =
        annotationStoreResult.data || this.createEmptyAnnotationStore(params.paperId)
      const noteConflict = findPaperAnnotationNoteConflict(currentStore.annotations, {
        kind: params.kind,
        segmentStableId: targetSegment.stableId,
        originalAnchor: params.originalAnchor,
        translationAnchor: params.translationAnchor
      })
      if (noteConflict) {
        return { success: false, error: PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE }
      }

      const nextStore: PaperAnnotationStore = {
        ...currentStore,
        annotations: [...currentStore.annotations, nextAnnotation],
        updatedAt: now
      }
      const saveResult = await paperStorageService.saveAnnotationStore(params.paperId, nextStore)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '保存论文批注失败' }
      }

      if (nextAnnotation.kind === 'note') {
        await this.syncPaperNotesResource(params.paperId, nextStore.annotations)
      }

      return {
        success: true,
        data: nextAnnotation
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建论文批注失败', 'main', { paperId: params.paperId, error: errorMessage })
      return { success: false, error: errorMessage || '创建批注时发生内部错误' }
    }
  }

  /**
   * 删除指定批注
   */
  async deleteAnnotation(
    paperId: string,
    annotationId: string
  ): Promise<{ success: boolean; data?: PaperAnnotation[]; error?: string }> {
    try {
      const annotationStoreResult = await this.resolveAnnotationStore(paperId)
      if (!annotationStoreResult.success || !annotationStoreResult.data) {
        return { success: false, error: annotationStoreResult.error || '读取论文批注失败' }
      }

      const removedAnnotation = annotationStoreResult.data.annotations.find((annotation) => {
        return annotation.id === annotationId
      })
      const nextAnnotations = annotationStoreResult.data.annotations.filter((annotation) => {
        return annotation.id !== annotationId
      })
      const nextStore: PaperAnnotationStore = {
        ...annotationStoreResult.data,
        annotations: nextAnnotations,
        updatedAt: new Date().toISOString()
      }
      const saveResult = await paperStorageService.saveAnnotationStore(paperId, nextStore)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '删除论文批注失败' }
      }

      if (removedAnnotation?.kind === 'note') {
        await this.syncPaperNotesResource(paperId, nextAnnotations)
      }

      return {
        success: true,
        data: nextAnnotations
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除论文批注失败', 'main', { paperId, annotationId, error: errorMessage })
      return { success: false, error: errorMessage || '删除批注时发生内部错误' }
    }
  }

  /**
   * 更新批注（高亮颜色或笔记内容）
   */
  async updateAnnotation(params: UpdatePaperAnnotationPayload): Promise<{
    success: boolean
    data?: PaperAnnotation
    affectedKnowledgeBases?: PaperAnnotationAffectedKnowledgeBase[]
    error?: string
  }> {
    try {
      const annotationStoreResult = await this.resolveAnnotationStore(params.paperId)
      if (!annotationStoreResult.success || !annotationStoreResult.data) {
        return { success: false, error: annotationStoreResult.error || '读取论文批注失败' }
      }

      const annotationIndex = annotationStoreResult.data.annotations.findIndex((annotation) => {
        return annotation.id === params.annotationId
      })
      if (annotationIndex < 0) {
        return { success: false, error: '要更新的标注不存在' }
      }

      const currentAnnotation = annotationStoreResult.data.annotations[annotationIndex]
      const now = new Date().toISOString()

      let nextAnnotation: PaperAnnotation
      if (currentAnnotation.kind === 'highlight') {
        if (typeof params.comment !== 'undefined') {
          return { success: false, error: '普通标记不支持修改笔记内容' }
        }

        if (!params.colorKey) {
          return { success: false, error: '请先选择新的标记颜色' }
        }

        const normalizedContentResult = normalizeAnnotationContent('highlight', params.colorKey, '')
        if (!normalizedContentResult.success) {
          return { success: false, error: normalizedContentResult.error }
        }

        nextAnnotation = {
          ...currentAnnotation,
          comment: '',
          colorKey: normalizedContentResult.data.colorKey,
          updatedAt: now
        }
      } else {
        if (typeof params.colorKey !== 'undefined') {
          return { success: false, error: '笔记不支持修改高亮颜色' }
        }

        if (typeof params.comment !== 'string') {
          return { success: false, error: '请先填写笔记内容' }
        }

        const normalizedContentResult = normalizeAnnotationContent(
          'note',
          currentAnnotation.colorKey,
          params.comment
        )
        if (!normalizedContentResult.success) {
          return { success: false, error: normalizedContentResult.error }
        }

        nextAnnotation = {
          ...currentAnnotation,
          comment: normalizedContentResult.data.comment,
          colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY,
          updatedAt: now
        }
      }

      const nextAnnotations = [...annotationStoreResult.data.annotations]
      nextAnnotations[annotationIndex] = nextAnnotation

      const nextStore: PaperAnnotationStore = {
        ...annotationStoreResult.data,
        annotations: nextAnnotations,
        updatedAt: now
      }
      const saveResult = await paperStorageService.saveAnnotationStore(params.paperId, nextStore)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '更新论文批注失败' }
      }

      const affectedKnowledgeBases =
        nextAnnotation.kind === 'note'
          ? await this.syncPaperNotesResource(params.paperId, nextStore.annotations)
          : []

      return {
        success: true,
        data: nextAnnotation,
        affectedKnowledgeBases
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('更新论文批注失败', 'main', {
        paperId: params.paperId,
        annotationId: params.annotationId,
        error: errorMessage
      })
      return { success: false, error: errorMessage || '更新批注时发生内部错误' }
    }
  }

  /**
   * 从 OCR 结果中提取图表数据（含图片路径解析）
   */
  private extractFigureData(
    paperId: string,
    pageResults: PaperPageOcrResult[]
  ): ExtractedPaperFigureData {
    return extractPaperFigureData(pageResults, {
      resolveImagePath: (_pageResult, block) => getResolvedFigureImagePath(paperId, block)
    })
  }

  /**
   * 确保所有页面的图表资源已本地化（下载远端图片到本地）
   */
  private async ensureLocalFigureAssets(
    paperId: string,
    pageResults: PaperPageOcrResult[]
  ): Promise<PaperPageOcrResult[]> {
    const nextResults: PaperPageOcrResult[] = []

    for (const pageResult of pageResults) {
      const ensuredResult = await this.ensurePageLocalFigureAssets(paperId, pageResult)
      nextResults.push(ensuredResult)
    }

    return nextResults
  }

  /**
   * 确保单页的图表资源已本地化（懒回填模式，下载失败时移除远端引用）
   */
  private async ensurePageLocalFigureAssets(
    paperId: string,
    pageResult: PaperPageOcrResult
  ): Promise<PaperPageOcrResult> {
    const localization = await localizePaperPageAssets(paperId, pageResult, {
      downloadAsset: downloadCropImage,
      stripMissingRemoteAssets: true
    })

    for (const failedAsset of localization.failedAssets) {
      logger.warn('论文图片懒回填失败，已移除远端图片引用', 'main', {
        paperId,
        pageIndex: failedAsset.pageIndex,
        blockIndex: failedAsset.blockIndex
      })
    }

    if (!localization.changed) {
      return pageResult
    }

    const saveResult = await paperStorageService.saveNormalizedResult(
      paperId,
      pageResult.pageIndex,
      localization.pageResult
    )
    if (!saveResult.success) {
      logger.warn('论文图片懒回填结果写回失败', 'main', {
        paperId,
        pageIndex: pageResult.pageIndex,
        error: saveResult.error
      })
    }

    return localization.pageResult
  }
}
