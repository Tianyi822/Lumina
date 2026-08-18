import { net } from 'electron'
import { readFile, mkdir, writeFile, access } from 'fs/promises'
import { dirname } from 'path'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import { configManager } from '@main/services/config'
import {
  DEFAULT_OCR_PROVIDER,
  getOcrProviderPreset,
  type OcrProviderId
} from '@shared/types/config'
import type { PaperLayoutBlock, PaperPageOcrResult, BlockLabel } from '@shared/types/paper'
import { PaperGlmOcrClient } from './PaperGlmOcrClient'
import { paperStorageService } from './index'
import { buildMergedMarkdown, runPaperOcrPipeline } from './paperOcrPipeline'
import { purgeIfOcrComplete } from './pageImagePurge'
import {
  getPaperOcrRawDirPath,
  getPaperOcrRawPath,
  getPaperOcrNormalizedDirPath,
  getPaperOcrNormalizedPath,
  getPaperMergedMdPath
} from './paperPaths'
import { localizePaperPageAssets } from './paperAssetLocalizer'
import {
  isFencedSimpleTextContainerHtml,
  isSimpleTextContainerSegment,
  unwrapFencedSimpleTextContainerHtml
} from './paperTextProcessing'

/**
 * OCR 进度信息
 * - status: idle(空闲) / processing(处理中) / completed(全部完成) /
 *   partial_failed(部分失败) / failed(全部失败) / cancelled(已取消)
 */
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
  md_results?: string | string[]
  mdResults?: string | string[]
  layout_details?: RawLayoutBlock[] | RawLayoutBlock[][]
  layoutDetails?: RawLayoutBlock[] | RawLayoutBlock[][]
  data_info?: Record<string, unknown>
  dataInfo?: Record<string, unknown>
  request_id?: string
  requestId?: string
  task_id?: string
  taskId?: string
  usage?: { total_tokens?: number }
  [key: string]: unknown
}

const FENCED_CODE_PATTERN = /^\s{0,3}(?:`{3,}|~{3,})/m
const CODE_KEYWORD_PATTERN =
  /\b(?:async|await|class|const|def|else|for|from|function|if|import|let|return|try|var|while)\b/i

function isRemoteImageUrl(content: string | undefined): boolean {
  return typeof content === 'string' && /^https?:\/\/\S+$/i.test(content.trim())
}

function normalizeBlockLabel(label: string | undefined): BlockLabel {
  if (
    label === 'text' ||
    label === 'image' ||
    label === 'table' ||
    label === 'formula' ||
    label === 'code'
  ) {
    return label
  }

  return 'text'
}

function hasFencedCodeBlock(content: string): boolean {
  return FENCED_CODE_PATTERN.test(content.trim())
}

function isLikelyCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  return (
    /^(?:#|\/\/|\/\*|\*|--)\s*\S/.test(trimmed) ||
    CODE_KEYWORD_PATTERN.test(trimmed) ||
    /(?:=>|->|::|\.\w+\(|[{}();=<>*/]|\[|\])/.test(trimmed)
  )
}

function isNaturalLanguageSentenceLine(line: string): boolean {
  const trimmed = line.trim()
  return /^[A-Z][a-z][^=;{}]*[.!?]$/.test(trimmed)
}

function isLikelyUnfencedCodeBlock(content: string): boolean {
  if (isSimpleTextContainerSegment(content)) {
    return false
  }

  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 4) {
    return false
  }

  const codeLineCount = lines.filter(isLikelyCodeLine).length
  const sentenceLineCount = lines.filter(isNaturalLanguageSentenceLine).length

  return codeLineCount >= Math.ceil(lines.length * 0.45) && sentenceLineCount <= lines.length * 0.25
}

function isLikelyPseudoCodeBlock(content: string): boolean {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return false
  }

  let score = 0
  for (const line of lines) {
    if (/^(?:Algorithm|算法)\s*\d+/i.test(line)) {
      score += 3
    } else if (/^(?:Input|Output|Require|Ensure|输入|输出)\s*[:：]/i.test(line)) {
      score += 2
    } else if (/^(?:for|while|for each)\b.*\bdo$/i.test(line)) {
      score += 2
    } else if (/^if\b.*\bthen$/i.test(line)) {
      score += 2
    } else if (/^return\b/i.test(line)) {
      score += 1
    } else if (/^\d+[.:]\s/.test(line)) {
      score += 1
    } else if (/^\s{2,}/.test(line) && line.length > 0) {
      score += 0.5
    }
  }

  return score >= 4
}

function ensureFencedCodeBlock(content: string): string {
  const trimmed = content.trim()
  if (!trimmed || hasFencedCodeBlock(trimmed)) {
    return trimmed
  }

  return ['```', trimmed, '```'].join('\n')
}

function replaceFirstLiteral(content: string, searchValue: string, replacement: string): string {
  if (!searchValue || searchValue === replacement) {
    return content
  }

  const matchIndex = content.indexOf(searchValue)
  if (matchIndex < 0) {
    return content
  }

  return content.slice(0, matchIndex) + replacement + content.slice(matchIndex + searchValue.length)
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
  const mdResults = raw.md_results ?? raw.mdResults ?? []
  let markdown = typeof mdResults === 'string' ? mdResults : mdResults[0] || ''

  const layoutDetails = raw.layout_details ?? raw.layoutDetails ?? []
  const pageBlocks =
    layoutDetails.length > 0 && Array.isArray(layoutDetails[0])
      ? (layoutDetails[0] as RawLayoutBlock[])
      : (layoutDetails as RawLayoutBlock[])

  const blocks: PaperLayoutBlock[] = pageBlocks.map((block: RawLayoutBlock, idx: number) => {
    const rawBbox = block.bbox_2d || block.bbox2d
    const { bbox, normalizedBbox, pixelBbox } = normalizeBbox(rawBbox)

    const rawLabel = normalizeBlockLabel(block.label)
    const rawContent = block.text || block.content || ''
    const unwrappedContent = unwrapFencedSimpleTextContainerHtml(rawContent)
    const isMisfencedTextContainer = isFencedSimpleTextContainerHtml(rawContent)
    const shouldTreatAsCode =
      !isMisfencedTextContainer &&
      (isLikelyPseudoCodeBlock(rawContent) ||
        rawLabel === 'code' ||
        hasFencedCodeBlock(rawContent) ||
        isLikelyUnfencedCodeBlock(rawContent))
    const label: BlockLabel = shouldTreatAsCode ? 'code' : rawLabel
    const content = shouldTreatAsCode ? ensureFencedCodeBlock(rawContent) : unwrappedContent
    markdown = replaceFirstLiteral(markdown, rawContent, content)
    const remoteUrl =
      block.crop_image_url ||
      block.crop_url ||
      ((label === 'image' || label === 'table' || label === 'formula') && isRemoteImageUrl(content)
        ? content.trim()
        : undefined)

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

async function downloadCropImage(remoteUrl: string, localPath: string): Promise<boolean> {
  try {
    const response = await net.fetch(remoteUrl)
    if (!response.ok) return false
    const buffer = Buffer.from(await response.arrayBuffer())
    const dir = dirname(localPath)
    await mkdir(dir, { recursive: true })
    await writeFile(localPath, buffer)
    return true
  } catch {
    return false
  }
}

/**
 * OCR 服务 — 管理论文 OCR 处理的全生命周期
 * 包括：OCR 客户端调用、进度追踪/上报、结果持久化、合并 Markdown 生成
 */
export class PaperOcrService {
  private client = new PaperGlmOcrClient()
  private currentProgress: Map<string, OcrProgressInfo> = new Map()
  private abortControllers: Map<string, boolean> = new Map()
  private progressCallbacks: Map<string, ProgressCallback> = new Map()
  private activeOcrPipelines: Set<string> = new Set()

  /**
   * 读取当前 OCR 配置（API Key、服务商、并发数）
   */
  private getOcrConfig(): { apiKey: string; provider: OcrProviderId; concurrency: number } {
    const config = configManager.getConfig()
    const ocr = config?.paperReader?.ocr
    const provider = ocr?.provider || DEFAULT_OCR_PROVIDER
    const preset = getOcrProviderPreset(provider)!
    return {
      apiKey: ocr?.apiKey || '',
      provider,
      concurrency: preset.concurrency
    }
  }

  private emitProgress(paperId: string, progress: OcrProgressInfo): void {
    this.currentProgress.set(paperId, progress)
    const cb = this.progressCallbacks.get(paperId)
    if (cb) cb(progress)
  }

  /**
   * 注册 OCR 进度回调
   */
  onProgress(paperId: string, callback: ProgressCallback): void {
    this.progressCallbacks.set(paperId, callback)
  }

  offProgress(paperId: string): void {
    this.progressCallbacks.delete(paperId)
  }

  getProgress(paperId: string): OcrProgressInfo | undefined {
    return this.currentProgress.get(paperId)
  }

  isOcrActive(paperId: string): boolean {
    return this.activeOcrPipelines.has(paperId)
  }

  /**
   * 取消指定论文的 OCR 处理
   */
  cancelOcr(paperId: string): void {
    this.abortControllers.set(paperId, true)
    logger.info('OCR 任务已标记取消', 'main', { paperId })
  }

  /**
   * 启动论文 OCR 处理
   * 1. 校验配置和页面资源
   * 2. 运行并发 OCR 管线
   * 3. 根据结果更新论文状态
   * 4. 生成合并 Markdown
   */
  async startOcr(paperId: string): Promise<{ success: boolean; code?: string; error?: string }> {
    const metaResult = await paperStorageService.readMeta(paperId)
    if (!metaResult.success || !metaResult.data) {
      return { success: false, error: metaResult.error || t('notifications.paper.metaMissing') }
    }

    const meta = metaResult.data
    // 页图已清理：需渲染端先从 source.pdf 重渲染页图，pages_missing 由渲染端识别并触发回源
    if (meta.pageImagesPurgedAt) {
      return {
        success: false,
        code: 'pages_missing',
        error: t('notifications.paper.pageImagesPurgedNeedRender')
      }
    }

    const { apiKey, provider, concurrency } = this.getOcrConfig()
    if (!apiKey) {
      return { success: false, error: t('notifications.paper.ocrApiKeyMissing') }
    }

    if (!meta.pageAssets || meta.pageAssets.length === 0) {
      return { success: false, error: t('notifications.paper.ocrPagesNotReady') }
    }

    this.abortControllers.delete(paperId)

    const totalPages = meta.pageCount

    const existingResults = await paperStorageService.listNormalizedResults(paperId)
    const preExistingResults = existingResults.success ? (existingResults.data ?? []) : []
    const existingCompleted = preExistingResults.filter((r) => r.status === 'completed').length
    const existingFailed = preExistingResults
      .filter((r) => r.status === 'failed')
      .map((r) => r.pageIndex)

    const progress: OcrProgressInfo = {
      paperId,
      currentPage: 0,
      totalPages,
      completedPages: existingCompleted,
      failedPages: existingFailed,
      status: 'processing'
    }
    this.emitProgress(paperId, progress)

    this.activeOcrPipelines.add(paperId)

    await paperStorageService.updateMeta(paperId, {
      status: 'ocr_processing',
      completedPageCount: existingCompleted,
      errorMessage: undefined
    })

    const { aborted, results: normalizedResults } = await runPaperOcrPipeline({
      paperId,
      totalPages,
      concurrency,
      preExistingResults,
      shouldCancel: () => this.abortControllers.get(paperId) === true,
      processPage: async (pageIndex) => this.processPage(paperId, pageIndex, apiKey, provider),
      onPageDispatched: (pageIndex) => {
        progress.currentPage = pageIndex
        this.emitProgress(paperId, progress)
      },
      onPageSettled: async (pageIndex, pageResult) => {
        if (pageResult.status === 'completed') {
          progress.completedPages += 1
          await paperStorageService.updateMeta(paperId, {
            completedPageCount: progress.completedPages
          })
        } else {
          progress.failedPages = [...progress.failedPages, pageIndex].sort(
            (left, right) => left - right
          )
        }

        this.emitProgress(paperId, progress)
      }
    })

    this.abortControllers.delete(paperId)
    this.activeOcrPipelines.delete(paperId)

    if (aborted) {
      progress.status = 'cancelled'
      await paperStorageService.updateMeta(paperId, {
        status: 'draft',
        completedPageCount: progress.completedPages,
        errorMessage: undefined
      })
    } else {
      if (progress.failedPages.length === 0) {
        progress.status = 'completed'
        await paperStorageService.updateMeta(paperId, { status: 'completed' })
        // 全部页 OCR 成功：清理页图缓存（失败仅记日志，不影响 OCR 结果）
        await purgeIfOcrComplete(paperStorageService, paperId)
      } else if (progress.completedPages > 0) {
        progress.status = 'partial_failed'
        await paperStorageService.updateMeta(paperId, { status: 'partial_failed' })
      } else {
        progress.errorMessage = t('notifications.paper.ocrAllPagesFailed')
        progress.status = 'failed'
        await paperStorageService.updateMeta(paperId, {
          status: 'failed',
          errorMessage: progress.errorMessage
        })
      }
    }

    await this.buildAndSaveMergedMd(paperId, normalizedResults)
    this.emitProgress(paperId, progress)

    logger.info('OCR 处理完成', 'main', {
      paperId,
      completedPages: progress.completedPages,
      failedPages: progress.failedPages.length,
      status: progress.status
    })

    if (progress.status === 'failed') {
      return {
        success: false,
        error: progress.errorMessage || t('notifications.paper.ocrAllPagesFailed')
      }
    }

    return { success: true }
  }

  /**
   * 重试单页 OCR 处理，成功时重新生成合并 Markdown
   */
  async retryPage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; code?: string; error?: string }> {
    const metaResult = await paperStorageService.readMeta(paperId)
    if (metaResult.success && metaResult.data?.pageImagesPurgedAt) {
      return {
        success: false,
        code: 'pages_missing',
        error: t('notifications.paper.pageImagesPurgedNeedRender')
      }
    }

    const { apiKey, provider } = this.getOcrConfig()
    if (!apiKey) {
      return { success: false, error: t('notifications.paper.ocrApiKeyMissing') }
    }

    const result = await this.processPage(paperId, pageIndex, apiKey, provider)
    if (result.status === 'completed') {
      await this.rebuildMergedMd(paperId)
      // 单页重试成功可能补齐了最后的失败页：满足条件时清理页图
      await purgeIfOcrComplete(paperStorageService, paperId)
    }
    return { success: result.status === 'completed', error: result.errorMessage }
  }

  /**
   * 处理单页 OCR：读取页图 -> 调用 OCR API -> 本地化资源 -> 保存结果
   */
  private async processPage(
    paperId: string,
    pageIndex: number,
    apiKey: string,
    provider: OcrProviderId
  ): Promise<PaperPageOcrResult> {
    const pageImageResult = await paperStorageService.readPageImage(paperId, pageIndex)
    if (!pageImageResult.success || !pageImageResult.data) {
      const result: PaperPageOcrResult = {
        paperId,
        pageIndex,
        markdown: '',
        blocks: [],
        status: 'failed',
        errorMessage: pageImageResult.error || t('notifications.paper.pageImageUnavailable')
      }
      await this.saveOcrResults(paperId, pageIndex, null, result)
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
        errorMessage: response.error || t('notifications.paper.ocrRequestFailed')
      }
      await this.saveOcrResults(paperId, pageIndex, response.data, result)
      logger.warn(`第 ${pageIndex + 1} 页 OCR 失败`, 'main', {
        paperId,
        pageIndex,
        error: result.errorMessage
      })
      return result
    }

    const rawResponse = response.data as RawOcrResponse
    const normalized = normalizeGlmOcrResponse(rawResponse, pageIndex)

    const localizedResult = await localizePaperPageAssets(
      paperId,
      {
        paperId,
        pageIndex,
        markdown: normalized.markdown,
        blocks: normalized.blocks,
        usage: normalized.usage,
        requestId: normalized.requestId,
        taskId: normalized.taskId,
        status: 'completed'
      },
      {
        downloadAsset: downloadCropImage
      }
    )

    if (localizedResult.failedAssets.length > 0) {
      const failedBlocks = localizedResult.failedAssets
        .map((asset) => `block ${asset.blockIndex}`)
        .join(', ')
      const result: PaperPageOcrResult = {
        paperId,
        pageIndex,
        markdown: '',
        blocks: [],
        usage: normalized.usage,
        requestId: normalized.requestId,
        taskId: normalized.taskId,
        status: 'failed',
        errorMessage: t('notifications.paper.ocrImageDownloadFailed', { failed: failedBlocks })
      }
      await this.saveOcrResults(paperId, pageIndex, rawResponse, result)
      logger.warn(`第 ${pageIndex + 1} 页 OCR 图片下载失败`, 'main', {
        paperId,
        pageIndex,
        failedAssets: localizedResult.failedAssets.length
      })
      return result
    }

    const result: PaperPageOcrResult = {
      paperId,
      pageIndex,
      markdown: localizedResult.pageResult.markdown,
      blocks: localizedResult.pageResult.blocks,
      usage: normalized.usage,
      requestId: normalized.requestId,
      taskId: normalized.taskId,
      status: 'completed'
    }

    await this.saveOcrResults(paperId, pageIndex, rawResponse, result)
    logger.info(`第 ${pageIndex + 1} 页 OCR 完成`, 'main', { paperId, pageIndex })
    return result
  }

  /**
   * 保存单页 OCR 的原始结果和归一化结果到磁盘
   */
  private async saveOcrResults(
    paperId: string,
    pageIndex: number,
    rawData: unknown,
    normalized: PaperPageOcrResult
  ): Promise<void> {
    try {
      const rawDir = getPaperOcrRawDirPath(paperId)
      await mkdir(rawDir, { recursive: true })
      if (rawData) {
        await writeFile(
          getPaperOcrRawPath(paperId, pageIndex),
          JSON.stringify(rawData, null, 2),
          'utf-8'
        )
      }

      const normalizedDir = getPaperOcrNormalizedDirPath(paperId)
      await mkdir(normalizedDir, { recursive: true })
      await writeFile(
        getPaperOcrNormalizedPath(paperId, pageIndex),
        JSON.stringify(normalized, null, 2),
        'utf-8'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存 OCR 结果失败', 'main', { paperId, pageIndex, error: errorMessage })
    }
  }

  /**
   * 构建并保存所有页面的合并 Markdown
   */
  private async buildAndSaveMergedMd(
    paperId: string,
    results: PaperPageOcrResult[]
  ): Promise<void> {
    const mergedMd = buildMergedMarkdown(results)

    try {
      const mdPath = getPaperMergedMdPath(paperId)
      await writeFile(mdPath, mergedMd, 'utf-8')
      logger.info('合并 Markdown 保存成功', 'main', { paperId, pages: results.length })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存合并 Markdown 失败', 'main', { paperId, error: errorMessage })
    }
  }

  /**
   * 重新构建合并 Markdown（从磁盘读取所有页面 OCR 结果后合并）
   */
  async rebuildMergedMd(paperId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const metaResult = await paperStorageService.readMeta(paperId)
      if (!metaResult.success || !metaResult.data) {
        return { success: false, error: t('notifications.paper.metaMissing') }
      }

      const totalPages = metaResult.data.pageCount
      const results: PaperPageOcrResult[] = []

      for (let i = 0; i < totalPages; i++) {
        const normalizedPath = getPaperOcrNormalizedPath(paperId, i)
        const fileExists = await access(normalizedPath)
          .then(() => true)
          .catch(() => false)
        if (fileExists) {
          try {
            const content = await readFile(normalizedPath, 'utf-8')
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

      await this.buildAndSaveMergedMd(paperId, results)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }
}
