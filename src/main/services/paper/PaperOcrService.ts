import { net } from 'electron'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { logger } from '@main/services/logger'
import { configManager } from '@main/services/config'
import { DEFAULT_OCR_PROVIDER } from '@shared/types/config'
import type { PaperLayoutBlock, PaperPageOcrResult, BlockLabel } from '@shared/types/paper'
import { PaperGlmOcrClient } from './PaperGlmOcrClient'
import { paperStorageService } from './index'
import {
  getPaperOcrRawDirPath,
  getPaperOcrRawPath,
  getPaperOcrNormalizedDirPath,
  getPaperOcrNormalizedPath,
  getPaperPageAssetsDirPath,
  getPaperAssetsDirPath,
  getPaperMergedMdPath
} from './paperPaths'

export const MAX_OCR_CONCURRENCY = 1

export interface OcrProgressInfo {
  paperId: string
  currentPage: number
  totalPages: number
  completedPages: number
  failedPages: number[]
  status: 'idle' | 'processing' | 'completed' | 'partial_failed' | 'failed' | 'cancelled'
  errorMessage?: string
}

type ProgressCallback = (progress: OcrProgressInfo) => void

interface RawLayoutBlock {
  index?: number
  label?: string
  text?: string
  content?: string
  bbox_2d?: number[]
  bbox2d?: number[]
  width?: number
  height?: number
  crop_image_url?: string
  crop_url?: string
  [key: string]: unknown
}

interface RawOcrResponse {
  md_results?: string[]
  mdResults?: string[]
  layout_details?: RawLayoutBlock[][]
  layoutDetails?: RawLayoutBlock[][]
  data_info?: Record<string, unknown>
  dataInfo?: Record<string, unknown>
  request_id?: string
  requestId?: string
  task_id?: string
  taskId?: string
  usage?: { total_tokens?: number }
  [key: string]: unknown
}

function normalizeBbox(raw: number[] | undefined): {
  bbox: { x: number; y: number; width: number; height: number }
  normalizedBbox?: { x: number; y: number; width: number; height: number }
  pixelBbox?: { x: number; y: number; width: number; height: number }
} {
  const empty = { bbox: { x: 0, y: 0, width: 0, height: 0 } }
  if (!raw || raw.length < 4) return empty

  const coords = raw.slice(0, 4)
  const x1 = coords[0]
  const y1 = coords[1]
  const x2 = coords[2]
  const y2 = coords[3]
  const bbox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }

  const maxVal = Math.max(...coords)
  if (maxVal <= 1) {
    return {
      bbox,
      normalizedBbox: { ...bbox },
      pixelBbox: undefined
    }
  }

  return {
    bbox,
    normalizedBbox: undefined,
    pixelBbox: { ...bbox }
  }
}

function normalizeGlmOcrResponse(
  raw: RawOcrResponse,
  pageIndex: number
): {
  markdown: string
  blocks: PaperLayoutBlock[]
  usage?: { total_tokens?: number }
  requestId?: string
  taskId?: string
} {
  const mdResults = raw.md_results || raw.mdResults || []
  const markdown = mdResults[0] || ''

  const layoutDetails = raw.layout_details || raw.layoutDetails || []
  const pageBlocks = layoutDetails[0] || layoutDetails.flat() || []

  const blocks: PaperLayoutBlock[] = pageBlocks.map((block: RawLayoutBlock, idx: number) => {
    const rawBbox = block.bbox_2d || block.bbox2d
    const { bbox, normalizedBbox, pixelBbox } = normalizeBbox(rawBbox)

    const label = (block.label || 'text') as BlockLabel
    const content = block.text || block.content || ''
    const remoteUrl = block.crop_image_url || block.crop_url

    return {
      index: block.index ?? idx,
      pageIndex,
      label,
      content,
      bbox,
      normalizedBbox,
      pixelBbox,
      width: block.width ?? 0,
      height: block.height ?? 0,
      remoteAssetUrl: remoteUrl
    }
  })

  return {
    markdown,
    blocks,
    usage: raw.usage,
    requestId: raw.request_id || raw.requestId,
    taskId: raw.task_id || raw.taskId
  }
}

function buildPageMarkdown(pageResult: PaperPageOcrResult): string {
  let md = pageResult.markdown

  for (const block of pageResult.blocks) {
    if (block.localAssetPath && block.remoteAssetUrl) {
      md = md.replaceAll(block.remoteAssetUrl, block.localAssetPath)
    }
  }

  return md
}

async function downloadCropImage(remoteUrl: string, localPath: string): Promise<boolean> {
  try {
    const response = await net.fetch(remoteUrl)
    if (!response.ok) return false
    const buffer = Buffer.from(await response.arrayBuffer())
    const dir = localPath.substring(0, localPath.lastIndexOf('/'))
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(localPath, buffer)
    return true
  } catch {
    return false
  }
}

export class PaperOcrService {
  private client = new PaperGlmOcrClient()
  private currentProgress: Map<string, OcrProgressInfo> = new Map()
  private abortControllers: Map<string, boolean> = new Map()
  private progressCallbacks: Map<string, ProgressCallback> = new Map()

  private getOcrConfig(): { apiKey: string; provider: typeof DEFAULT_OCR_PROVIDER } {
    const config = configManager.getConfig()
    const paperOcr = config?.paperOcr
    return {
      apiKey: paperOcr?.apiKey || '',
      provider: paperOcr?.provider || DEFAULT_OCR_PROVIDER
    }
  }

  private emitProgress(paperId: string, progress: OcrProgressInfo): void {
    this.currentProgress.set(paperId, progress)
    const cb = this.progressCallbacks.get(paperId)
    if (cb) cb(progress)
  }

  onProgress(paperId: string, callback: ProgressCallback): void {
    this.progressCallbacks.set(paperId, callback)
  }

  offProgress(paperId: string): void {
    this.progressCallbacks.delete(paperId)
  }

  getProgress(paperId: string): OcrProgressInfo | undefined {
    return this.currentProgress.get(paperId)
  }

  cancelOcr(paperId: string): void {
    this.abortControllers.set(paperId, true)
    logger.info('OCR 任务已标记取消', 'main', { paperId })
  }

  async startOcr(paperId: string): Promise<{ success: boolean; error?: string }> {
    const { apiKey, provider } = this.getOcrConfig()
    if (!apiKey) {
      return { success: false, error: '请先在设置中配置 GLM-OCR API Key' }
    }

    const metaResult = paperStorageService.readMeta(paperId)
    if (!metaResult.success || !metaResult.data) {
      return { success: false, error: metaResult.error || '论文元信息不存在' }
    }

    const meta = metaResult.data
    if (!meta.pageAssets || meta.pageAssets.length === 0) {
      return { success: false, error: '论文页图尚未渲染完成' }
    }

    this.abortControllers.delete(paperId)

    const totalPages = meta.pageCount
    const progress: OcrProgressInfo = {
      paperId,
      currentPage: 0,
      totalPages,
      completedPages: 0,
      failedPages: [],
      status: 'processing'
    }
    this.emitProgress(paperId, progress)

    paperStorageService.updateMeta(paperId, {
      status: 'ocr_processing',
      completedPageCount: 0,
      errorMessage: undefined
    })

    const normalizedResults: PaperPageOcrResult[] = []

    for (let i = 0; i < totalPages; i++) {
      if (this.abortControllers.get(paperId)) {
        progress.status = 'cancelled'
        this.emitProgress(paperId, progress)
        logger.info('OCR 任务已取消', 'main', { paperId, completedPages: progress.completedPages })
        break
      }

      progress.currentPage = i
      this.emitProgress(paperId, progress)

      const pageResult = await this.processPage(paperId, i, apiKey, provider)
      normalizedResults.push(pageResult)

      if (pageResult.status === 'completed') {
        progress.completedPages += 1
        paperStorageService.updateMeta(paperId, {
          completedPageCount: progress.completedPages
        })
      } else {
        progress.failedPages.push(i)
      }

      this.emitProgress(paperId, progress)
    }

    const aborted = this.abortControllers.get(paperId)
    this.abortControllers.delete(paperId)

    if (!aborted) {
      if (progress.failedPages.length === 0) {
        progress.status = 'completed'
        paperStorageService.updateMeta(paperId, { status: 'completed' })
      } else if (progress.completedPages > 0) {
        progress.status = 'partial_failed'
        paperStorageService.updateMeta(paperId, { status: 'partial_failed' })
      } else {
        progress.errorMessage = '所有页面 OCR 均失败'
        progress.status = 'failed'
        paperStorageService.updateMeta(paperId, {
          status: 'failed',
          errorMessage: progress.errorMessage
        })
      }
    }

    this.buildAndSaveMergedMd(paperId, normalizedResults)
    this.emitProgress(paperId, progress)

    logger.info('OCR 处理完成', 'main', {
      paperId,
      completedPages: progress.completedPages,
      failedPages: progress.failedPages.length,
      status: progress.status
    })

    if (progress.status === 'failed') {
      return { success: false, error: progress.errorMessage || '所有页面 OCR 均失败' }
    }

    return { success: true }
  }

  async retryPage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; error?: string }> {
    const { apiKey, provider } = this.getOcrConfig()
    if (!apiKey) {
      return { success: false, error: '请先在设置中配置 GLM-OCR API Key' }
    }

    const result = await this.processPage(paperId, pageIndex, apiKey, provider)
    if (result.status === 'completed') {
      this.rebuildMergedMd(paperId)
    }
    return { success: result.status === 'completed', error: result.errorMessage }
  }

  private async processPage(
    paperId: string,
    pageIndex: number,
    apiKey: string,
    provider: typeof DEFAULT_OCR_PROVIDER
  ): Promise<PaperPageOcrResult> {
    const pageImageResult = paperStorageService.readPageImage(paperId, pageIndex)
    if (!pageImageResult.success || !pageImageResult.data) {
      const result: PaperPageOcrResult = {
        paperId,
        pageIndex,
        markdown: '',
        blocks: [],
        status: 'failed',
        errorMessage: pageImageResult.error || '页图不存在'
      }
      this.saveOcrResults(paperId, pageIndex, null, result)
      return result
    }

    const base64Image = pageImageResult.data

    const response = await this.client.recognizePage({
      provider,
      apiKey,
      base64Image
    })

    if (!response.success) {
      const result: PaperPageOcrResult = {
        paperId,
        pageIndex,
        markdown: '',
        blocks: [],
        status: 'failed',
        errorMessage: response.error || 'OCR 请求失败'
      }
      this.saveOcrResults(paperId, pageIndex, response.data, result)
      logger.warn(`第 ${pageIndex + 1} 页 OCR 失败`, 'main', {
        paperId,
        pageIndex,
        error: result.errorMessage
      })
      return result
    }

    const rawResponse = response.data as RawOcrResponse
    const normalized = normalizeGlmOcrResponse(rawResponse, pageIndex)

    const assetsDir = getPaperPageAssetsDirPath(paperId, pageIndex)
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true })
    }

    for (const block of normalized.blocks) {
      if (
        (block.label === 'image' || block.label === 'table' || block.label === 'formula') &&
        block.remoteAssetUrl
      ) {
        const paddedBlockIndex = String(block.index).padStart(4, '0')
        const localFileName = `crop-${paddedBlockIndex}.png`
        const localRelativePath = `assets/page-${String(pageIndex + 1).padStart(4, '0')}/${localFileName}`
        const localAbsolutePath = `${getPaperAssetsDirPath(paperId)}/page-${String(pageIndex + 1).padStart(4, '0')}/${localFileName}`

        const downloaded = await downloadCropImage(block.remoteAssetUrl, localAbsolutePath)
        if (downloaded) {
          block.localAssetPath = localRelativePath
        }
      }
    }

    const result: PaperPageOcrResult = {
      paperId,
      pageIndex,
      markdown: normalized.markdown,
      blocks: normalized.blocks,
      usage: normalized.usage,
      requestId: normalized.requestId,
      taskId: normalized.taskId,
      status: 'completed'
    }

    this.saveOcrResults(paperId, pageIndex, rawResponse, result)
    logger.info(`第 ${pageIndex + 1} 页 OCR 完成`, 'main', { paperId, pageIndex })
    return result
  }

  private saveOcrResults(
    paperId: string,
    pageIndex: number,
    rawData: unknown,
    normalized: PaperPageOcrResult
  ): void {
    try {
      const rawDir = getPaperOcrRawDirPath(paperId)
      if (!existsSync(rawDir)) {
        mkdirSync(rawDir, { recursive: true })
      }
      if (rawData) {
        writeFileSync(
          getPaperOcrRawPath(paperId, pageIndex),
          JSON.stringify(rawData, null, 2),
          'utf-8'
        )
      }

      const normalizedDir = getPaperOcrNormalizedDirPath(paperId)
      if (!existsSync(normalizedDir)) {
        mkdirSync(normalizedDir, { recursive: true })
      }
      writeFileSync(
        getPaperOcrNormalizedPath(paperId, pageIndex),
        JSON.stringify(normalized, null, 2),
        'utf-8'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存 OCR 结果失败', 'main', { paperId, pageIndex, error: errorMessage })
    }
  }

  private buildAndSaveMergedMd(paperId: string, results: PaperPageOcrResult[]): void {
    const parts: string[] = []

    for (const pageResult of results) {
      const pageMd = buildPageMarkdown(pageResult)
      const header = `<!-- Page ${pageResult.pageIndex + 1} -->`
      parts.push(`${header}\n\n${pageMd}`)
    }

    const mergedMd = parts.join('\n\n---\n\n')

    try {
      const mdPath = getPaperMergedMdPath(paperId)
      writeFileSync(mdPath, mergedMd, 'utf-8')
      logger.info('合并 Markdown 保存成功', 'main', { paperId, pages: results.length })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存合并 Markdown 失败', 'main', { paperId, error: errorMessage })
    }
  }

  rebuildMergedMd(paperId: string): { success: boolean; error?: string } {
    try {
      const metaResult = paperStorageService.readMeta(paperId)
      if (!metaResult.success || !metaResult.data) {
        return { success: false, error: '论文元信息不存在' }
      }

      const totalPages = metaResult.data.pageCount
      const results: PaperPageOcrResult[] = []

      for (let i = 0; i < totalPages; i++) {
        const normalizedPath = getPaperOcrNormalizedPath(paperId, i)
        if (existsSync(normalizedPath)) {
          try {
            const content = readFileSync(normalizedPath, 'utf-8')
            results.push(JSON.parse(content) as PaperPageOcrResult)
          } catch {
            results.push({
              paperId,
              pageIndex: i,
              markdown: '',
              blocks: [],
              status: 'pending'
            })
          }
        } else {
          results.push({
            paperId,
            pageIndex: i,
            markdown: '',
            blocks: [],
            status: 'pending'
          })
        }
      }

      this.buildAndSaveMergedMd(paperId, results)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }
}
