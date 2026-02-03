import { existsSync, readFileSync, writeFileSync, mkdirSync, readFile } from 'fs'
import { join, extname, isAbsolute } from 'path'

import { getConfigDirPath } from '@main/services/config/configPaths'
import { getFilesStoragePath, getFileService } from '@main/services/file/FileService'
import { getVectorDBService, type DocumentChunk, type SearchResult } from '@main/services/vector'
import { getEmbeddingService } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import type { KnowledgeBase } from '@shared/types/knowledge'

/**
 * 知识库数据文件路径
 */
function getKnowledgeBaseFilePath(): string {
  return join(getConfigDirPath(), 'knowledge-bases.json')
}

/**
 * 创建空的知识库数据结构
 */
function createEmptyKnowledgeBases(): KnowledgeBase[] {
  return []
}

/**
 * 读取知识库数据
 */
function readKnowledgeBases(): KnowledgeBase[] {
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

/**
 * 写入知识库数据
 */
function writeKnowledgeBases(knowledgeBases: KnowledgeBase[]): void {
  const filePath = getKnowledgeBaseFilePath()
  const content = JSON.stringify(knowledgeBases, null, 2)
  writeFileSync(filePath, content, 'utf-8')
}

/**
 * 支持的文件类型
 */
const SUPPORTED_FILE_TYPES = new Set(['.txt', '.md', '.json', '.js', '.ts', '.vue', '.py', '.pdf'])

/**
 * 读取文本文件内容
 */
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

/**
 * 读取 PDF 文件内容
 */
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

/**
 * 根据文件类型读取文件内容
 */
async function readFileContent(filePath: string, fileName: string): Promise<string> {
  const ext = extname(fileName).toLowerCase()

  if (ext === '.pdf') {
    return readPdfFile(filePath)
  }

  // 其他类型作为文本文件读取
  return readTextFile(filePath)
}

/**
 * 将文本分块
 */
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

/**
 * 文件处理进度回调
 */
export interface FileProcessingProgress {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

/**
 * 知识库管理服务
 * 提供知识库的增删改查功能，以及文档索引和搜索功能
 */
export class KnowledgeService {
  private knowledgeBases: KnowledgeBase[] = []
  private loaded: boolean = false
  private processingFiles: Set<string> = new Set()

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    const dataDir = getConfigDirPath()
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
  }

  /**
   * 初始化知识库服务
   */
  initialize(): void {
    try {
      this.ensureDataDir()
      this.knowledgeBases = readKnowledgeBases()
      this.loaded = true
      logger.info('知识库服务初始化成功', 'main', {
        count: this.knowledgeBases.length
      })
    } catch (error) {
      const errorMessage = `知识库服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.knowledgeBases = []
      this.loaded = true
    }
  }

  /**
   * 获取所有知识库
   */
  getAllKnowledgeBases(): KnowledgeBase[] {
    if (!this.loaded) {
      this.initialize()
    }
    return [...this.knowledgeBases]
  }

  /**
   * 根据ID获取知识库
   */
  getKnowledgeBaseById(id: string): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }
    return this.knowledgeBases.find((kb) => kb.id === id) || null
  }

  /**
   * 创建知识库
   */
  createKnowledgeBase(data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeBase {
    if (!this.loaded) {
      this.initialize()
    }

    const newKB: KnowledgeBase = {
      ...data,
      id: `kb-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    this.knowledgeBases.unshift(newKB)
    this.save()

    logger.info('知识库创建成功', 'main', { id: newKB.id, name: newKB.name })
    return newKB
  }

  /**
   * 更新知识库
   */
  updateKnowledgeBase(
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }

    const index = this.knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return null
    }

    this.knowledgeBases[index] = {
      ...this.knowledgeBases[index],
      ...updates,
      id: this.knowledgeBases[index].id,
      createdAt: this.knowledgeBases[index].createdAt,
      updatedAt: new Date().toISOString()
    }

    this.save()
    logger.info('知识库更新成功', 'main', { id })
    return this.knowledgeBases[index]
  }

  /**
   * 删除知识库
   */
  deleteKnowledgeBase(id: string): boolean {
    if (!this.loaded) {
      this.initialize()
    }

    const index = this.knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return false
    }

    // 删除向量数据库
    getVectorDBService().deleteKnowledgeBase(id)

    // 从所有关联的文件中移除此知识库 ID
    const kb = this.knowledgeBases[index]
    if (kb.linkedFileIds && kb.linkedFileIds.length > 0) {
      const fileService = getFileService()
      for (const fileId of kb.linkedFileIds) {
        fileService.unlinkFileFromKB(fileId, id)
      }
    }

    this.knowledgeBases.splice(index, 1)
    this.save()

    logger.info('知识库删除成功', 'main', { id })
    return true
  }

  /**
   * 为知识库索引文件
   * @param kbId 知识库 ID
   * @param fileId 文件 ID
   * @param filePath 文件路径
   * @param fileName 文件名
   * @param onProgress 进度回调
   */
  async indexFile(
    kbId: string,
    fileId: string,
    filePath: string,
    fileName: string,
    onProgress?: (progress: FileProcessingProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    const kb = this.getKnowledgeBaseById(kbId)
    if (!kb) {
      return { success: false, error: '知识库不存在' }
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

    try {
      onProgress?.({
        fileId,
        fileName,
        status: 'processing',
        progress: 0
      })

      // 将相对路径转换为完整路径（如果传入的是相对路径）
      const fullFilePath = isAbsolute(filePath) ? filePath : join(getFilesStoragePath(), filePath)

      // 读取文件内容
      const content = await readFileContent(fullFilePath, fileName)

      onProgress?.({
        fileId,
        fileName,
        status: 'processing',
        progress: 20
      })

      // 分块
      const chunks = splitTextIntoChunks(content, kb.chunkSize, kb.chunkOverlap)

      if (chunks.length === 0) {
        this.processingFiles.delete(processingKey)
        return { success: false, error: '文件内容为空' }
      }

      onProgress?.({
        fileId,
        fileName,
        status: 'processing',
        progress: 40
      })

      // 生成嵌入向量（使用知识库绑定的配置）
      const embeddingService = getEmbeddingService()
      embeddingService.setConfig(kb.embeddingConfig)

      const embeddings: number[][] = []
      const batchSize = 10

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize)
        const result = await embeddingService.embedBatch(batch)

        // 验证嵌入结果
        logger.debug('indexFile 收到嵌入结果', 'main', {
          kbId,
          fileId,
          batchIndex: i,
          batchSize: batch.length,
          resultCount: result.embeddings.length,
          firstEmbeddingLength: result.embeddings[0]?.length,
          lastEmbeddingLength: result.embeddings[result.embeddings.length - 1]?.length
        })

        embeddings.push(...result.embeddings)

        const progress = 40 + Math.floor((i / chunks.length) * 40)
        onProgress?.({
          fileId,
          fileName,
          status: 'processing',
          progress
        })
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
      await getVectorDBService().deleteFileChunks(kbId, kb.embeddingDimension, fileId)

      // 添加到向量数据库
      await getVectorDBService().addChunks(kbId, kb.embeddingDimension, documentChunks, embeddings)

      onProgress?.({
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
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('文件索引失败', 'main', { kbId, fileId, error: errorMessage })

      onProgress?.({
        fileId,
        fileName,
        status: 'failed',
        error: errorMessage
      })

      this.processingFiles.delete(processingKey)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 从知识库中移除文件的索引
   * @param kbId 知识库 ID
   * @param fileId 文件 ID
   */
  async removeFileIndex(
    kbId: string,
    fileId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const kb = this.getKnowledgeBaseById(kbId)
      if (!kb) {
        return { success: false, error: '知识库不存在' }
      }

      await getVectorDBService().deleteFileChunks(kbId, kb.embeddingDimension, fileId)

      logger.info('文件索引已删除', 'main', { kbId, fileId })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 重新索引整个知识库
   * @param kbId 知识库 ID
   * @param files 文件列表（fileId, filePath, fileName）
   * @param onProgress 进度回调（整体进度）
   * @param onFileProgress 文件进度回调（单个文件进度）
   */
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
    const kb = this.getKnowledgeBaseById(kbId)
    if (!kb) {
      return { success: false, indexedCount: 0, failedFiles: [], error: '知识库不存在' }
    }

    try {
      // 删除现有向量数据库
      getVectorDBService().deleteKnowledgeBase(kbId)

      logger.info('开始重新索引知识库', 'main', { kbId, fileCount: files.length })

      const failedFiles: string[] = []
      const failedErrors: string[] = []
      let indexedCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        onProgress?.({
          current: i + 1,
          total: files.length,
          currentFile: file.fileName
        })

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

      // 更新知识库的更新时间
      this.updateKnowledgeBase(kbId, {})

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

  /**
   * 在知识库中搜索
   * @param kbId 知识库 ID
   * @param query 查询文本
   * @param limit 返回结果数量限制
   * @returns 搜索结果
   */
  async search(
    kbId: string,
    query: string,
    limit: number = 5
  ): Promise<{ success: boolean; data?: { results: SearchResult[] }; error?: string }> {
    try {
      const kb = this.getKnowledgeBaseById(kbId)
      if (!kb) {
        return { success: false, error: '知识库不存在' }
      }

      // 检查向量数据库是否存在
      if (!getVectorDBService().exists(kbId)) {
        return { success: false, error: '知识库尚未建立索引' }
      }

      // 使用知识库绑定的嵌入配置生成查询向量
      const embeddingService = getEmbeddingService()
      embeddingService.setConfig(kb.embeddingConfig)

      const embeddingResult = await embeddingService.embed(query)

      // 执行搜索
      const results = await getVectorDBService().search(
        kbId,
        kb.embeddingDimension,
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

  /**
   * 获取知识库的统计信息
   * @param kbId 知识库 ID
   */
  async getStats(kbId: string): Promise<{
    success: boolean
    data?: { fileCount: number; chunkCount: number; dbSize: number }
    error?: string
  }> {
    try {
      const kb = this.getKnowledgeBaseById(kbId)
      if (!kb) {
        return { success: false, error: '知识库不存在' }
      }

      if (!getVectorDBService().exists(kbId)) {
        return {
          success: true,
          data: { fileCount: 0, chunkCount: 0, dbSize: 0 }
        }
      }

      const stats = await getVectorDBService().getStats(kbId, kb.embeddingDimension)
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

  /**
   * 保存知识库数据到文件
   */
  private save(): void {
    try {
      this.ensureDataDir()
      writeKnowledgeBases(this.knowledgeBases)
    } catch (error) {
      const errorMessage = `保存知识库数据失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 检查是否有文件正在索引
   */
  isIndexing(): boolean {
    return this.processingFiles.size > 0
  }

  /**
   * 获取正在索引的文件列表
   */
  getIndexingFiles(): Array<{ kbId: string; fileId: string }> {
    return Array.from(this.processingFiles).map((key) => {
      const [kbId, fileId] = key.split(':')
      return { kbId, fileId }
    })
  }

  /**
   * 检查服务是否已加载
   */
  isLoaded(): boolean {
    return this.loaded
  }
}

// 单例实例
let knowledgeServiceInstance: KnowledgeService | null = null

/**
 * 获取知识库服务单例
 */
export function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService()
  }
  return knowledgeServiceInstance
}
