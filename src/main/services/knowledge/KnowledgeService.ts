import { existsSync, readFileSync, writeFileSync, readFile } from 'fs'
import { join, extname, isAbsolute } from 'path'

import { getConfigDirPath } from '@main/services/config/configPaths'
import { getFilesStoragePath } from '@main/services/file/FileService'
import { getVectorDBService, type DocumentChunk, type SearchResult } from '@main/services/vector'
import { EmbeddingService } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import type { KnowledgeBase } from '@shared/types/knowledge'

// 获取知识库数据文件路径
export function getKnowledgeBaseFilePath(): string {
  return join(getConfigDirPath(), 'knowledge-bases.json')
}

// 创建空的知识库数据结构
export function createEmptyKnowledgeBases(): KnowledgeBase[] {
  return []
}

// 读取知识库数据
export function readKnowledgeBases(): KnowledgeBase[] {
  const filePath = getKnowledgeBaseFilePath()
  if (!existsSync(filePath)) {
    return createEmptyKnowledgeBases()
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as KnowledgeBase[]
  } catch (error) {
    logger.error('读取知识库数据失败', 'main', { error })
    return createEmptyKnowledgeBases()
  }
}

// 写入知识库数据
export function writeKnowledgeBases(knowledgeBases: KnowledgeBase[]): void {
  const filePath = getKnowledgeBaseFilePath()
  const content = JSON.stringify(knowledgeBases, null, 2)
  writeFileSync(filePath, content, 'utf-8')
}

// 支持的文件类型
const SUPPORTED_FILE_TYPES = new Set(['.txt', '.md', '.json', '.js', '.ts', '.vue', '.py', '.pdf'])

// 读取文本文件内容
async function readTextFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

// 读取 PDF 文件内容
async function readPdfFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 PDF 文件', 'main', { filePath })
    const dataBuffer = readFileSync(filePath)
    logger.info('PDF 文件已读取', 'main', { size: dataBuffer.length })

    // 使用 pdfjs-dist 解析 PDF
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')

    // 禁用 worker（在 Electron 主进程中不需要）
    pdfjsLib.GlobalWorkerOptions.disableWorker = true

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) }).promise
    logger.info('PDF 文档已加载', 'main', { pages: pdf.numPages })

    let fullText = ''

    // 遍历所有页面提取文本
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ')
      fullText += pageText + '\n'
    }

    logger.info('PDF 解析完成', 'main', { textLength: fullText.length })
    return fullText
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('PDF 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`PDF 解析失败: ${errorMessage}`)
  }
}

// 根据文件类型读取文件内容
async function readFileContent(filePath: string, fileName: string): Promise<string> {
  const ext = extname(fileName).toLowerCase()

  if (ext === '.pdf') {
    return readPdfFile(filePath)
  }

  // 其他类型作为文本文件读取
  return readTextFile(filePath)
}

// 将文本分块
function splitTextIntoChunks(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = []
  const effectiveChunkSize = chunkSize - chunkOverlap

  if (text.length <= chunkSize) {
    chunks.push(text)
    return chunks
  }

  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))

    if (end >= text.length) {
      break
    }

    start += effectiveChunkSize
  }

  return chunks
}

// 文件处理进度回调
export interface FileProcessingProgress {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

// 知识库服务类
// 提供知识库的增删改查功能，以及文档索引和搜索功能
// 每个知识库一个独立实例，实现操作隔离
export class KnowledgeService {
  private kbData: KnowledgeBase
  private embeddingService: EmbeddingService
  private processingFiles: Set<string> = new Set()
  private fileProgressMap: Map<string, FileProcessingProgress> = new Map()
  private stopRequested: boolean = false

  constructor(kbData: KnowledgeBase) {
    this.kbData = kbData
    this.embeddingService = new EmbeddingService()
    this.embeddingService.setConfig(kbData.embeddingConfig)
    logger.info('知识库服务实例已创建', 'main', { kbId: kbData.id, name: kbData.name })
  }

  // 清理资源
  cleanup(): void {
    this.processingFiles.clear()
    this.fileProgressMap.clear()
    this.stopRequested = false
    logger.info('知识库服务资源已清理', 'main', { kbId: this.kbData.id })
  }

  // 请求停止索引操作
  stopIndexing(): void {
    this.stopRequested = true
    logger.info('已请求停止索引操作', 'main', { kbId: this.kbData.id })
  }

  // 检查是否已请求停止
  isStopRequested(): boolean {
    return this.stopRequested
  }

  // 重置停止请求标志
  resetStopRequest(): void {
    this.stopRequested = false
  }

  // 获取当前知识库数据
  getKBData(): KnowledgeBase {
    return this.kbData
  }

  // 更新当前知识库配置（当知识库被修改时调用）
  updateKBData(updates: Partial<KnowledgeBase>): void {
    this.kbData = { ...this.kbData, ...updates }
    if (updates.embeddingConfig) {
      this.embeddingService.setConfig(updates.embeddingConfig)
    }
    logger.info('知识库数据已更新', 'main', { kbId: this.kbData.id })
  }

  // 为知识库索引文件
  // 将文件内容分块后生成嵌入向量，存储到向量数据库中
  // 支持进度回调，可以在索引过程中获取进度信息
  async indexFile(
    kbId: string,
    fileId: string,
    filePath: string,
    fileName: string,
    onProgress?: (progress: FileProcessingProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (kbId !== this.kbData.id) {
      return { success: false, error: '知识库ID不匹配' }
    }

    // 检查文件类型
    const ext = extname(fileName).toLowerCase()
    if (!SUPPORTED_FILE_TYPES.has(ext)) {
      return { success: false, error: `不支持的文件类型: ${ext}` }
    }

    // 检查是否正在处理
    const processingKey = `${kbId}:${fileId}`
    if (this.processingFiles.has(processingKey)) {
      return { success: false, error: '文件正在处理中' }
    }

    this.processingFiles.add(processingKey)

    // 包装进度回调，保存进度到内存
    const wrappedOnProgress = (progress: FileProcessingProgress): void => {
      this.fileProgressMap.set(processingKey, progress)
      onProgress?.(progress)
    }

    try {
      wrappedOnProgress({
        fileId,
        fileName,
        status: 'processing',
        progress: 0
      })

      // 将相对路径转换为完整路径（如果传入的是相对路径）
      const fullFilePath = isAbsolute(filePath) ? filePath : join(getFilesStoragePath(), filePath)

      // 读取文件内容
      const content = await readFileContent(fullFilePath, fileName)

      wrappedOnProgress({
        fileId,
        fileName,
        status: 'processing',
        progress: 20
      })

      // 分块
      const chunks = splitTextIntoChunks(content, this.kbData.chunkSize, this.kbData.chunkOverlap)

      if (chunks.length === 0) {
        this.processingFiles.delete(processingKey)
        return { success: false, error: '文件内容为空' }
      }

      wrappedOnProgress({
        fileId,
        fileName,
        status: 'processing',
        progress: 40
      })

      // 生成嵌入向量（使用知识库绑定的配置）
      this.embeddingService.setConfig(this.kbData.embeddingConfig)

      // 并行处理嵌入向量生成
      const batchSize = 10
      const maxConcurrentBatches = 5 // 最大并发批次数
      const embeddings: number[][] = new Array(chunks.length)

      // 创建批次任务
      const batches: Array<{ index: number; texts: string[] }> = []
      for (let i = 0; i < chunks.length; i += batchSize) {
        batches.push({
          index: i,
          texts: chunks.slice(i, i + batchSize)
        })
      }

      // 并行执行批次任务（控制并发数）
      let completedBatches = 0
      const processBatch = async (batch: { index: number; texts: string[] }): Promise<void> => {
        // 检查是否已请求停止（在每批次开始时检查）
        if (this.stopRequested) {
          throw new Error('索引操作已被用户取消')
        }

        const result = await this.embeddingService.embedBatch(batch.texts)

        // 将结果放入正确位置
        for (let j = 0; j < result.embeddings.length; j++) {
          embeddings[batch.index + j] = result.embeddings[j]
        }

        completedBatches++
        const progress = 40 + Math.floor((completedBatches / batches.length) * 40)
        wrappedOnProgress({
          fileId,
          fileName,
          status: 'processing',
          progress
        })

        // 每10批次或最后一批打印日志
        if (completedBatches % 10 === 0 || completedBatches === batches.length) {
          logger.debug('indexFile 批次嵌入进度', 'main', {
            kbId,
            fileId,
            completedBatches,
            totalBatches: batches.length
          })
        }
      }

      // 使用 Promise.all 控制并发
      for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
        // 检查是否已请求停止
        if (this.stopRequested) {
          throw new Error('索引操作已被用户取消')
        }

        const concurrentBatches = batches.slice(i, i + maxConcurrentBatches)
        await Promise.all(concurrentBatches.map(processBatch))
      }

      // 检查是否已请求停止
      if (this.stopRequested) {
        throw new Error('索引操作已被用户取消')
      }

      // 构建文档块对象
      const documentChunks: DocumentChunk[] = chunks.map((content, index) => ({
        fileId,
        fileName,
        content,
        chunkIndex: index + 1,
        totalChunks: chunks.length
      }))

      // 先删除旧数据（如果存在）
      await getVectorDBService().deleteFileChunks(kbId, this.kbData.embeddingDimension, fileId)

      // 检查是否已请求停止
      if (this.stopRequested) {
        throw new Error('索引操作已被用户取消')
      }

      // 添加到向量数据库
      await getVectorDBService().addChunks(
        kbId,
        this.kbData.embeddingDimension,
        documentChunks,
        embeddings
      )

      wrappedOnProgress({
        fileId,
        fileName,
        status: 'completed',
        progress: 100
      })

      logger.info('文件索引成功', 'main', {
        kbId,
        fileId,
        fileName,
        chunks: chunks.length
      })

      this.processingFiles.delete(processingKey)
      // 延迟清理进度信息，让前端有时间获取最终状态
      setTimeout(() => {
        this.fileProgressMap.delete(processingKey)
      }, 5000)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 检查是否是用户取消
      if (errorMessage.includes('已被用户取消')) {
        logger.info('文件索引被用户取消', 'main', { kbId, fileId })
        wrappedOnProgress({
          fileId,
          fileName,
          status: 'failed',
          error: '索引已取消'
        })
      } else {
        logger.error('文件索引失败', 'main', { kbId, fileId, error: errorMessage })

        wrappedOnProgress({
          fileId,
          fileName,
          status: 'failed',
          error: errorMessage
        })
      }

      this.processingFiles.delete(processingKey)
      // 延迟清理进度信息
      setTimeout(() => {
        this.fileProgressMap.delete(processingKey)
      }, 5000)
      return { success: false, error: errorMessage }
    }
  }

  // 从知识库中移除文件的索引
  // 删除向量数据库中与该文件相关的所有文档块
  async removeFileIndex(
    kbId: string,
    fileId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (kbId !== this.kbData.id) {
        return { success: false, error: '知识库ID不匹配' }
      }

      await getVectorDBService().deleteFileChunks(kbId, this.kbData.embeddingDimension, fileId)

      logger.info('文件索引已删除', 'main', { kbId, fileId })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  // 重新索引整个知识库
  // 删除现有向量数据库，重新处理所有文件
  // 支持整体进度和单个文件进度的回调
  async reindexKnowledgeBase(
    kbId: string,
    files: Array<{ fileId: string; filePath: string; fileName: string }>,
    onProgress?: (progress: { current: number; total: number; currentFile?: string }) => void,
    onFileProgress?: (progress: FileProcessingProgress) => void
  ): Promise<{
    success: boolean
    indexedCount: number
    failedFiles: string[]
    failedErrors?: string[]
    error?: string
  }> {
    if (kbId !== this.kbData.id) {
      return { success: false, indexedCount: 0, failedFiles: [], error: '知识库ID不匹配' }
    }

    try {
      // 删除现有向量数据库
      getVectorDBService().deleteKnowledgeBase(kbId)

      logger.info('开始重新索引知识库', 'main', { kbId, fileCount: files.length })

      const failedFiles: string[] = []
      const failedErrors: string[] = []
      let indexedCount = 0

      // 控制并发文件数，避免同时打开过多文件
      const maxConcurrentFiles = 3

      // 处理单个文件的函数
      const processFile = async (file: {
        fileId: string
        filePath: string
        fileName: string
      }): Promise<void> => {
        const result = await this.indexFile(
          kbId,
          file.fileId,
          file.filePath,
          file.fileName,
          onFileProgress
        )

        if (result.success) {
          indexedCount++
        } else {
          failedFiles.push(file.fileName)
          failedErrors.push(`${file.fileName}: ${result.error || '未知错误'}`)
          logger.error('文件索引失败详情', 'main', {
            fileName: file.fileName,
            error: result.error
          })
        }
      }

      // 并行处理文件（控制并发数）
      for (let i = 0; i < files.length; i += maxConcurrentFiles) {
        const batch = files.slice(i, i + maxConcurrentFiles)

        // 更新进度
        onProgress?.({
          current: i + 1,
          total: files.length,
          currentFile: batch.map((f) => f.fileName).join(', ')
        })

        // 并行执行当前批次的文件
        await Promise.all(batch.map(processFile))

        // 更新进度为当前批次完成
        onProgress?.({
          current: Math.min(i + maxConcurrentFiles, files.length),
          total: files.length,
          currentFile: ''
        })
      }

      // 更新知识库的更新时间（通过 Manager 处理）
      this.kbData.updatedAt = new Date().toISOString()

      logger.info('知识库重新索引完成', 'main', {
        kbId,
        indexedCount,
        failedCount: failedFiles.length
      })

      return {
        success: failedFiles.length === 0,
        indexedCount,
        failedFiles,
        failedErrors: failedErrors.length > 0 ? failedErrors : undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重新索引知识库失败', 'main', { kbId, error: errorMessage })
      return {
        success: false,
        indexedCount: 0,
        failedFiles: files.map((f) => f.fileName),
        error: errorMessage
      }
    }
  }

  // 在知识库中搜索
  // 使用向量相似度搜索，返回最相关的文档块
  async search(
    kbId: string,
    query: string,
    limit: number = 5
  ): Promise<{ success: boolean; data?: { results: SearchResult[] }; error?: string }> {
    try {
      if (kbId !== this.kbData.id) {
        return { success: false, error: '知识库ID不匹配' }
      }

      // 检查向量数据库是否存在
      if (!getVectorDBService().exists(kbId)) {
        return { success: false, error: '知识库尚未建立索引' }
      }

      // 使用知识库绑定的嵌入配置生成查询向量
      this.embeddingService.setConfig(this.kbData.embeddingConfig)

      const embeddingResult = await this.embeddingService.embed(query)

      // 执行搜索
      const results = await getVectorDBService().search(
        kbId,
        this.kbData.embeddingDimension,
        embeddingResult.embedding,
        limit
      )

      return { success: true, data: { results } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('知识库搜索失败', 'main', { kbId, query, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  // 获取知识库的统计信息
  // 返回文件数量、文档块数量和数据库大小
  async getStats(kbId: string): Promise<{
    success: boolean
    data?: { fileCount: number; chunkCount: number; dbSize: number }
    error?: string
  }> {
    try {
      if (kbId !== this.kbData.id) {
        return { success: false, error: '知识库ID不匹配' }
      }

      if (!getVectorDBService().exists(kbId)) {
        return {
          success: true,
          data: { fileCount: 0, chunkCount: 0, dbSize: 0 }
        }
      }

      const stats = await getVectorDBService().getStats(kbId, this.kbData.embeddingDimension)
      const dbSize = getVectorDBService().getDatabaseSize(kbId)

      return {
        success: true,
        data: { ...stats, dbSize }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  // 检查是否有文件正在索引
  isIndexing(): boolean {
    return this.processingFiles.size > 0
  }

  // 获取正在索引的文件列表
  getIndexingFiles(): Array<{ kbId: string; fileId: string }> {
    return Array.from(this.processingFiles).map((key) => {
      const [kbId, fileId] = key.split(':')
      return { kbId, fileId }
    })
  }

  // 获取文件进度信息
  getFileProgress(processingKey: string): FileProcessingProgress | undefined {
    return this.fileProgressMap.get(processingKey)
  }
}
