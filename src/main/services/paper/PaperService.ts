import { existsSync, mkdirSync, writeFileSync } from 'fs'
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
  buildReaderMarkdown,
  extractPaperFigureData,
  type ExtractedPaperFigureData
} from './paperFigureExtractor'
import { recoverPaperAnnotation } from './paperAnnotationRecovery'
import { getPaperDirPath } from './paperPaths'
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
import {
  PAPER_ANNOTATION_NOTE_COLOR_KEY,
  type ReanchorPaperAnnotationPayload
} from '@shared/types/paper'
import { buildPaperTextAnchor } from '@shared/utils/paperAnnotationAnchors'
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
    const dirPath = dirname(localPath)
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    writeFileSync(localPath, buffer)
    return true
  } catch {
    return false
  }
}

export class PaperService {
  private readonly ocrService = new PaperOcrService()

  private createEmptyAnnotationStore(paperId: string): PaperAnnotationStore {
    return createEmptyPaperAnnotationStore(paperId)
  }

  private getLatestAnnotationUpdatedAt(annotations: PaperAnnotation[]): string {
    return (
      annotations
        .filter((annotation) => annotation.kind === 'note')
        .map((annotation) => annotation.updatedAt)
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0] || new Date().toISOString()
    )
  }

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

    const metaResult = paperStorageService.readMeta(paperId)
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

    return getKnowledgeServiceManager().markKnowledgeBasesNeedReindex(result.previousUsedByKBIds, {
      fileId: result.file.id,
      fileName: result.file.name,
      paperId,
      updatedAt: this.getLatestAnnotationUpdatedAt(annotations)
    })
  }

  private markPaperNoteKnowledgeBasesNeedReindex(
    kbIds: string[],
    paperId: string,
    fileId: string,
    fileName: string,
    updatedAt: string
  ): PaperAnnotationAffectedKnowledgeBase[] {
    return getKnowledgeServiceManager().markKnowledgeBasesNeedReindex(kbIds, {
      fileId,
      fileName,
      paperId,
      updatedAt
    })
  }

  async repairPaperResources(paperId: string): Promise<{
    success: boolean
    paperFileRepaired?: boolean
    noteFilesRepaired?: number
    affectedKnowledgeBaseCount?: number
    error?: string
  }> {
    try {
      const fileService = getFileService()
      const metaResult = paperStorageService.readMeta(paperId)
      if (!metaResult.success || !metaResult.data) {
        return { success: false, error: metaResult.error || '论文元信息不存在' }
      }

      const paper = metaResult.data
      let paperFileRepaired = false
      let noteFilesRepaired = 0
      let affectedKnowledgeBaseCount = 0
      const errors: string[] = []

      const paperFileId = getPaperFileResourceId(paperId)
      const existingPaperFile = fileService.getFileById(paperFileId)
      const paperFileNeedsRepair =
        !existingPaperFile ||
        existingPaperFile.absolutePath !== paper.filePath ||
        existingPaperFile.name !== paper.fileName ||
        existingPaperFile.size !== paper.fileSize ||
        existingPaperFile.contentHash !== paper.fileHash
      const registerResult = fileService.registerPaperFile(paper)
      if (!registerResult.success) {
        errors.push(registerResult.error || '同步论文文件失败')
      } else if (paperFileNeedsRepair) {
        paperFileRepaired = true
      }

      const storeResult = paperStorageService.readAnnotationStore(paperId)
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
            const affectedKnowledgeBases = this.markPaperNoteKnowledgeBasesNeedReindex(
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

  async repairAllPaperResources(): Promise<{
    success: boolean
    repairedPapers: number
    paperFilesRepaired: number
    noteFilesRepaired: number
    affectedKnowledgeBaseCount: number
    failedPaperIds: string[]
    error?: string
  }> {
    const listResult = paperStorageService.listPapers()
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
          status: matched?.matchedOffset !== null ? 'active' : 'needs_reanchor',
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

  private async resolveAnnotationStore(
    paperId: string,
    readerDocument?: PaperReaderDocument
  ): Promise<{ success: boolean; data?: PaperAnnotationStore; error?: string }> {
    const annotationDataResult = paperStorageService.readAnnotationData(paperId)
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
    const saveResult = paperStorageService.saveAnnotationStore(paperId, migratedStore)
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

  listPapers(): { success: boolean; data?: PaperDocument[]; error?: string } {
    return paperStorageService.listPapers()
  }

  getPaper(paperId: string): { success: boolean; data?: PaperDocument; error?: string } {
    return paperStorageService.readMeta(paperId)
  }

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

  async deleteTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    const clearResult = paperStorageService.clearTranslationCache(paperId)
    if (!clearResult.success) {
      return { success: false, error: clearResult.error || '删除译文失败' }
    }

    const storeResult = paperStorageService.readAnnotationStore(paperId)
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

    const saveResult = paperStorageService.saveAnnotationStore(paperId, cleanupResult.nextStore)
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

  async listFigures(
    paperId: string
  ): Promise<{ success: boolean; data?: PaperFigureItem[]; error?: string }> {
    const resultsResult = paperStorageService.listNormalizedResults(paperId)
    if (!resultsResult.success || !resultsResult.data) {
      return { success: false, error: resultsResult.error || '读取论文图片失败' }
    }

    const pageResults = resultsResult.data
    const ensuredResults = await this.ensureLocalFigureAssets(paperId, pageResults)
    const figureData = this.extractFigureData(paperId, ensuredResults)

    return {
      success: true,
      data: figureData.figures
    }
  }

  async getReaderMarkdown(
    paperId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const resultsResult = paperStorageService.listNormalizedResults(paperId)
    if (!resultsResult.success || !resultsResult.data) {
      return { success: false, error: resultsResult.error || '读取论文正文失败' }
    }

    const pageResults = await this.ensureLocalFigureAssets(paperId, resultsResult.data)
    const figureData = this.extractFigureData(paperId, pageResults)

    return {
      success: true,
      data: buildReaderMarkdown(pageResults, figureData)
    }
  }

  async getReaderDocument(paperId: string): Promise<{
    success: boolean
    data?: PaperReaderDocument
    error?: string
  }> {
    const resultsResult = paperStorageService.listNormalizedResults(paperId)
    if (!resultsResult.success || !resultsResult.data) {
      return { success: false, error: resultsResult.error || '读取论文正文失败' }
    }

    const pageResults = await this.ensureLocalFigureAssets(paperId, resultsResult.data)
    const figureData = this.extractFigureData(paperId, pageResults)

    return {
      success: true,
      data: buildReaderDocument(paperId, pageResults, figureData)
    }
  }

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

    const translationAvailable = !!paperStorageService.readTranslationCache(paperId).success
    const now = new Date().toISOString()
    let changed = false
    const recoveredAnnotations = annotationStoreResult.data.annotations.map((annotation) => {
      const result = recoverPaperAnnotation(
        annotation,
        readerResult.data!,
        translationAvailable,
        now
      )
      changed = changed || result.changed
      return result.annotation
    })

    if (changed) {
      const nextStore: PaperAnnotationStore = {
        ...annotationStoreResult.data,
        annotations: recoveredAnnotations,
        updatedAt: now
      }
      const saveResult = paperStorageService.saveAnnotationStore(paperId, nextStore)
      if (!saveResult.success) {
        logger.warn('恢复论文批注后写回失败', 'main', {
          paperId,
          error: saveResult.error
        })
      }
    }

    return {
      success: true,
      data: recoveredAnnotations
    }
  }

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
        return {
          success: false,
          error: `当前批注对应的原文段落不存在 (segmentStableId: ${params.semanticAnchor.segmentStableId})`
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
        status:
          params.noteType === 'translation_view' &&
          !paperStorageService.readTranslationCache(params.paperId).success
            ? 'translation_missing'
            : 'active',
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
      const saveResult = paperStorageService.saveAnnotationStore(params.paperId, nextStore)
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
      const saveResult = paperStorageService.saveAnnotationStore(paperId, nextStore)
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

  async reanchorAnnotation(params: ReanchorPaperAnnotationPayload): Promise<{
    success: boolean
    data?: PaperAnnotation
    error?: string
  }> {
    try {
      const readerResult = await this.getReaderDocument(params.paperId)
      if (!readerResult.success || !readerResult.data) {
        return { success: false, error: readerResult.error || '读取阅读器文档失败' }
      }

      const annotationStoreResult = await this.resolveAnnotationStore(
        params.paperId,
        readerResult.data
      )
      if (!annotationStoreResult.success || !annotationStoreResult.data) {
        return { success: false, error: annotationStoreResult.error || '读取论文批注失败' }
      }

      const annotationIndex = annotationStoreResult.data.annotations.findIndex((annotation) => {
        return annotation.id === params.annotationId
      })
      if (annotationIndex < 0) {
        return { success: false, error: '要重新绑定的笔记不存在' }
      }

      const targetSegment = readerResult.data.segments.find((segment) => {
        return segment.stableId === params.semanticAnchor.segmentStableId
      })
      if (!targetSegment) {
        return { success: false, error: '当前选择的目标段落不存在' }
      }

      const currentAnnotation = annotationStoreResult.data.annotations[annotationIndex]

      const translationAvailable = !!paperStorageService.readTranslationCache(params.paperId)
        .success
      const normalizedContentResult = normalizeAnnotationContent(
        params.kind,
        params.colorKey,
        params.comment
      )
      if (!normalizedContentResult.success) {
        return { success: false, error: normalizedContentResult.error }
      }
      const nextOriginalAnchor = params.originalAnchor || currentAnnotation.originalAnchor
      const nextTranslationAnchor =
        params.translationAnchor === null
          ? undefined
          : params.translationAnchor
            ? { ...params.translationAnchor }
            : translationAvailable
              ? currentAnnotation.translationAnchor
              : undefined

      if (currentAnnotation.noteType === 'original_span' && !nextOriginalAnchor) {
        return { success: false, error: '原文锚定笔记必须绑定到原文文本' }
      }

      if (
        currentAnnotation.noteType === 'translation_view' &&
        !nextOriginalAnchor &&
        !nextTranslationAnchor
      ) {
        return { success: false, error: '译文笔记缺少可用锚点，无法完成重新绑定' }
      }

      const now = new Date().toISOString()
      const nextAnnotation: PaperAnnotation = {
        ...currentAnnotation,
        kind: params.kind,
        semanticAnchor: {
          segmentStableId: targetSegment.stableId,
          renderSegmentIdAtCreation: targetSegment.renderId,
          sourceRevisionId: targetSegment.sourceRevisionId,
          segmentTextHash: targetSegment.textHash,
          sourceRefs: targetSegment.sourceRefs
        },
        originalAnchor: nextOriginalAnchor ? { ...nextOriginalAnchor } : undefined,
        translationAnchor: nextTranslationAnchor,
        selectedTextSnapshot: params.selectedTextSnapshot,
        contextBefore: params.contextBefore,
        contextAfter: params.contextAfter,
        comment: normalizedContentResult.data.comment,
        colorKey: normalizedContentResult.data.colorKey,
        status:
          currentAnnotation.noteType === 'translation_view' && !translationAvailable
            ? 'translation_missing'
            : 'active',
        recoveryMeta: {
          ...currentAnnotation.recoveryMeta,
          recoveryFailureCount: 0,
          lastRecoveryAttemptAt: now,
          lastResolvedAt: now
        },
        updatedAt: now
      }

      const noteConflict = findPaperAnnotationNoteConflict(annotationStoreResult.data.annotations, {
        kind: params.kind,
        segmentStableId: targetSegment.stableId,
        originalAnchor: nextAnnotation.originalAnchor,
        translationAnchor: nextAnnotation.translationAnchor,
        ignoreAnnotationId: params.annotationId
      })
      if (noteConflict) {
        return { success: false, error: PAPER_ANNOTATION_NOTE_CONFLICT_MESSAGE }
      }

      const nextAnnotations = [...annotationStoreResult.data.annotations]
      nextAnnotations[annotationIndex] = nextAnnotation

      const nextStore: PaperAnnotationStore = {
        ...annotationStoreResult.data,
        annotations: nextAnnotations,
        updatedAt: now
      }
      const saveResult = paperStorageService.saveAnnotationStore(params.paperId, nextStore)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '更新论文批注失败' }
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
      logger.error('重新绑定论文批注失败', 'main', {
        paperId: params.paperId,
        annotationId: params.annotationId,
        error: errorMessage
      })
      return { success: false, error: errorMessage || '重新绑定批注时发生内部错误' }
    }
  }

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
      const saveResult = paperStorageService.saveAnnotationStore(params.paperId, nextStore)
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

  private extractFigureData(
    paperId: string,
    pageResults: PaperPageOcrResult[]
  ): ExtractedPaperFigureData {
    return extractPaperFigureData(pageResults, {
      resolveImagePath: (_pageResult, block) => getResolvedFigureImagePath(paperId, block)
    })
  }

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

    const saveResult = paperStorageService.saveNormalizedResult(
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
