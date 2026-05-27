import { readFile, writeFile } from 'fs/promises'

import { getVectorDBService, type DocumentChunk, type SearchResult } from '@main/services/vector'
import { EmbeddingService } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import { getFileService } from '@main/services/file'
import type { KnowledgeBase, KnowledgeReindexOptions } from '@shared/types/knowledge'
import { getKnowledgeBaseFilePath as getKnowledgeBaseStorageFilePath } from './knowledgePaths'

// 获取知识库数据文件路径
export function getKnowledgeBaseFilePath(): string {
  return getKnowledgeBaseStorageFilePath()
}

// 创建空的知识库数据结构
export function createEmptyKnowledgeBases(): KnowledgeBase[] {
  return []
}

// 读取知识库数据
export async function readKnowledgeBases(): Promise<KnowledgeBase[]> {
  const filePath = getKnowledgeBaseFilePath()
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as KnowledgeBase[]
  } catch (error) {
    logger.error('读取知识库数据失败', 'main', { error })
    return createEmptyKnowledgeBases()
  }
}

// 写入知识库数据
export async function writeKnowledgeBases(knowledgeBases: KnowledgeBase[]): Promise<void> {
  const filePath = getKnowledgeBaseFilePath()
  const content = JSON.stringify(knowledgeBases, null, 2)
  await writeFile(filePath, content, 'utf-8')
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
    onProgress?: (progress: FileProcessingProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (kbId !== this.kbData.id) {
      return { success: false, error: '知识库ID不匹配' }
    }

    if (!(this.kbData.linkedFileIds || []).includes(fileId)) {
      return { success: false, error: '文件未关联到此知识库' }
    }

    const resourceResult = await getFileService().readFileResourceContent(fileId)
    if (!resourceResult.success || !resourceResult.data) {
      return { success: false, error: resourceResult.error || '读取文件内容失败' }
    }
    const { file, content } = resourceResult.data
    const fileName = file.name

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

      const { embeddings } = await this.embeddingService.embedBatchWithOptions(chunks, {
        shouldAbort: () => this.stopRequested,
        onProgress: ({
          processedTexts,
          totalTexts,
          currentBatchSize,
          currentBatchEstimatedTokens,
          requestCount
        }) => {
          const progress = 40 + Math.floor((processedTexts / totalTexts) * 40)
          wrappedOnProgress({
            fileId,
            fileName,
            status: 'processing',
            progress
          })

          if (requestCount % 10 === 0 || processedTexts === totalTexts) {
            logger.debug('indexFile 嵌入进度', 'main', {
              kbId,
              fileId,
              requestCount,
              processedTexts,
              totalTexts,
              currentBatchSize,
              currentBatchEstimatedTokens
            })
          }
        }
      })

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
      await getVectorDBService().deleteFileChunks(kbId, fileId)

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

      await getVectorDBService().deleteFileChunks(kbId, fileId)

      logger.info('文件索引已删除', 'main', { kbId, fileId })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  // 重新索引知识库
  // 全量模式会删除现有向量数据库，文件模式只替换指定文件索引
  // 支持整体进度和单个文件进度的回调
  async reindexKnowledgeBase(
    kbId: string,
    fileIds: string[],
    onProgress?: (progress: { current: number; total: number; currentFile?: string }) => void,
    onFileProgress?: (progress: FileProcessingProgress) => void,
    options: KnowledgeReindexOptions = {}
  ): Promise<{
    success: boolean
    indexedCount: number
    indexedFileIds: string[]
    failedFiles: string[]
    failedErrors?: string[]
    skippedFileIds?: string[]
    skippedFiles?: string[]
    error?: string
  }> {
    if (kbId !== this.kbData.id) {
      return {
        success: false,
        indexedCount: 0,
        indexedFileIds: [],
        failedFiles: [],
        error: '知识库ID不匹配'
      }
    }

    try {
      const fileService = getFileService()
      const linkedFileIdSet = new Set(this.kbData.linkedFileIds || [])
      const requestedFileIds = Array.from(new Set(fileIds))
      const validFiles: Array<{ id: string; name: string }> = []
      const skippedFileIds: string[] = []
      const skippedFiles: string[] = []

      for (const fileId of requestedFileIds) {
        const file = fileService.getFileById(fileId)
        if (!linkedFileIdSet.has(fileId) || !file) {
          skippedFileIds.push(fileId)
          skippedFiles.push(file?.name || fileId)
          logger.warn('跳过不属于知识库的重建索引文件', 'main', {
            kbId,
            fileId,
            fileExists: Boolean(file),
            linked: linkedFileIdSet.has(fileId)
          })
          continue
        }

        validFiles.push({ id: file.id, name: file.name })
      }

      if (options.scope !== 'files') {
        // 全量重建会先清空知识库索引；文件级重建只替换对应文件的索引块。
        getVectorDBService().deleteKnowledgeBase(kbId)
      }

      logger.info('开始重新索引知识库', 'main', {
        kbId,
        scope: options.scope || 'full',
        fileCount: validFiles.length,
        skippedCount: skippedFiles.length
      })

      const failedFiles: string[] = []
      const failedErrors: string[] = []
      const indexedFileIds: string[] = []
      let indexedCount = 0

      // 控制并发文件数，避免同时打开过多文件
      const maxConcurrentFiles = 3

      // 处理单个文件的函数
      const processFile = async (file: { id: string; name: string }): Promise<void> => {
        const result = await this.indexFile(kbId, file.id, onFileProgress)

        if (result.success) {
          indexedCount++
          indexedFileIds.push(file.id)
        } else {
          failedFiles.push(file.name)
          failedErrors.push(`${file.name}: ${result.error || '未知错误'}`)
          logger.error('文件索引失败详情', 'main', {
            fileName: file.name,
            error: result.error
          })
        }
      }

      // 并行处理文件（控制并发数）
      for (let i = 0; i < validFiles.length; i += maxConcurrentFiles) {
        const batch = validFiles.slice(i, i + maxConcurrentFiles)

        // 更新进度
        onProgress?.({
          current: i + 1,
          total: validFiles.length,
          currentFile: batch.map((file) => file.name).join(', ')
        })

        // 并行执行当前批次的文件
        await Promise.all(batch.map(processFile))

        // 更新进度为当前批次完成
        onProgress?.({
          current: Math.min(i + maxConcurrentFiles, validFiles.length),
          total: validFiles.length,
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
        indexedFileIds,
        failedFiles,
        failedErrors: failedErrors.length > 0 ? failedErrors : undefined,
        skippedFileIds: skippedFileIds.length > 0 ? skippedFileIds : undefined,
        skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重新索引知识库失败', 'main', { kbId, error: errorMessage })
      return {
        success: false,
        indexedCount: 0,
        indexedFileIds: [],
        failedFiles: fileIds.map((fileId) => getFileService().getFileById(fileId)?.name || fileId),
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
      const results = await getVectorDBService().search(kbId, embeddingResult.embedding, limit)

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

      const stats = await getVectorDBService().getStats(kbId)
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
