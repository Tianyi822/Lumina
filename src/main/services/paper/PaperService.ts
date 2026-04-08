import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { net } from 'electron'
import { logger } from '@main/services/logger'
import { paperStorageService } from './index'
import { PaperOcrService, type OcrProgressInfo } from './PaperOcrService'
import {
  buildReaderMarkdown,
  extractPaperFigureData,
  type ExtractedPaperFigureData
} from './paperFigureExtractor'
import {
  getPaperDirPath,
  getPaperFigureAssetPath,
  getPaperFigureAssetRelativePath
} from './paperPaths'
import type {
  PaperDocument,
  PaperFigureItem,
  PaperLayoutBlock,
  PaperPageOcrResult
} from '@shared/types/paper'

function isRemoteImageUrl(content: string | undefined): boolean {
  return typeof content === 'string' && /^https?:\/\/\S+$/i.test(content.trim())
}

function getBlockRemoteImageUrl(block: PaperLayoutBlock): string | undefined {
  if (block.remoteAssetUrl) {
    return block.remoteAssetUrl
  }

  if (isRemoteImageUrl(block.content)) {
    return block.content.trim()
  }

  return undefined
}

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

  listPapers(): { success: boolean; data?: PaperDocument[]; error?: string } {
    return paperStorageService.listPapers()
  }

  getPaper(paperId: string): { success: boolean; data?: PaperDocument; error?: string } {
    return paperStorageService.readMeta(paperId)
  }

  deletePaper(paperId: string): { success: boolean; error?: string } {
    this.ocrService.offProgress(paperId)
    return paperStorageService.deletePaper(paperId)
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

  getReaderMarkdown(paperId: string): { success: boolean; data?: string; error?: string } {
    const resultsResult = paperStorageService.listNormalizedResults(paperId)
    if (!resultsResult.success || !resultsResult.data) {
      return { success: false, error: resultsResult.error || '读取论文正文失败' }
    }

    const pageResults = resultsResult.data
    const figureData = this.extractFigureData(paperId, pageResults)

    return {
      success: true,
      data: buildReaderMarkdown(pageResults, figureData)
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
    let changed = false

    const nextBlocks = await Promise.all(
      pageResult.blocks.map(async (block) => {
        if (block.label !== 'image') {
          return block
        }

        const nextBlock: PaperLayoutBlock = { ...block }
        const remoteImageUrl = getBlockRemoteImageUrl(nextBlock)

        if (remoteImageUrl && !nextBlock.remoteAssetUrl) {
          nextBlock.remoteAssetUrl = remoteImageUrl
          changed = true
        }

        if (nextBlock.localAssetPath) {
          const localFilePath = getLocalAssetFilePath(paperId, nextBlock.localAssetPath)
          if (existsSync(localFilePath)) {
            return nextBlock
          }
        }

        if (!remoteImageUrl) {
          return nextBlock
        }

        const localRelativePath = getPaperFigureAssetRelativePath(pageResult.pageIndex, block.index)
        const localAbsolutePath = getPaperFigureAssetPath(
          paperId,
          pageResult.pageIndex,
          block.index
        )

        const downloaded = await downloadCropImage(remoteImageUrl, localAbsolutePath)
        if (!downloaded) {
          logger.warn('论文图片懒回填失败', 'main', {
            paperId,
            pageIndex: pageResult.pageIndex,
            blockIndex: block.index
          })
          return nextBlock
        }

        nextBlock.localAssetPath = localRelativePath
        changed = true
        return nextBlock
      })
    )

    if (!changed) {
      return pageResult
    }

    const nextResult: PaperPageOcrResult = {
      ...pageResult,
      blocks: nextBlocks
    }
    const saveResult = paperStorageService.saveNormalizedResult(
      paperId,
      pageResult.pageIndex,
      nextResult
    )
    if (!saveResult.success) {
      logger.warn('论文图片懒回填结果写回失败', 'main', {
        paperId,
        pageIndex: pageResult.pageIndex,
        error: saveResult.error
      })
    }

    return nextResult
  }
}
