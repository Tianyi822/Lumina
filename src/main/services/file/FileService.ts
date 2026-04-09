import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import { logger } from '@main/services/logger'
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
  isSupportedDocumentExtension
} from '@shared/constants/document'
import type { FileItem, KnowledgeBase } from '@shared/types/knowledge'
import {
  getFilesMetadataPath as getFilesMetadataStoragePath,
  getFilesStoragePath as getKnowledgeFilesStoragePath,
  getKnowledgeBaseFilePath,
  initializeKnowledgeStorage
} from '@main/services/knowledge/knowledgePaths'

/**
 * 获取文件元数据存储路径
 */
function getFilesMetadataPath(): string {
  return getFilesMetadataStoragePath()
}

/**
 * 获取文件存储目录路径
 */
export function getFilesStoragePath(): string {
  return getKnowledgeFilesStoragePath()
}

/**
 * 计算文件内容的哈希值
 * 用于文件去重
 */
function calculateFileHash(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex')
}

/**
 * 读取知识库数据
 */
function readKnowledgeBases(): KnowledgeBase[] {
  const filePath = getKnowledgeBaseFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as KnowledgeBase[]
  } catch (error) {
    logger.error('读取知识库数据失败', 'main', { error })
    return []
  }
}

/**
 * 写入知识库数据
 */
function writeKnowledgeBases(knowledgeBases: KnowledgeBase[]): void {
  const filePath = getKnowledgeBaseFilePath()
  writeFileSync(filePath, JSON.stringify(knowledgeBases, null, 2), 'utf-8')
}

/**
 * 文件管理服务
 * 负责文件的物理存储、元数据管理和知识库关联
 */
export class FileService {
  private files: FileItem[] = []
  private loaded: boolean = false

  /**
   * 确保文件存储目录存在
   * 如果目录不存在则创建
   */
  private ensureFilesDir(): void {
    const filesDir = getFilesStoragePath()
    if (!existsSync(filesDir)) {
      mkdirSync(filesDir, { recursive: true })
      logger.info('创建文件存储目录', 'main', { path: filesDir })
    }
  }

  /**
   * 初始化文件服务
   */
  initialize(): void {
    try {
      initializeKnowledgeStorage()
      this.ensureFilesDir()
      this.loadFilesMetadata()
      this.loaded = true
      logger.info('文件服务初始化成功', 'main', { count: this.files.length })
    } catch (error) {
      const errorMessage = `文件服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.files = []
      this.loaded = true
    }
  }

  /**
   * 加载文件元数据
   * 从磁盘读取文件元数据并更新内存状态
   */
  private loadFilesMetadata(): void {
    const filePath = getFilesMetadataPath()
    if (!existsSync(filePath)) {
      this.files = []
      return
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const files = JSON.parse(content) as FileItem[]

      const knowledgeBases = readKnowledgeBases()
      const existingKBIds = new Set(knowledgeBases.map((kb) => kb.id))

      this.files = files
        .map((file) => ({
          ...file,
          absolutePath: join(getFilesStoragePath(), file.filePath),
          usedByKBIds: (file.usedByKBIds || []).filter((kbId) => existingKBIds.has(kbId))
        }))
        .filter((file) => file.usedByKBIds.length !== 0 || true)

      const hasChanges = files.some((file, index) => {
        const newFile = this.files[index]
        return (
          file.absolutePath !== newFile.absolutePath ||
          (file.usedByKBIds || []).length !== newFile.usedByKBIds.length ||
          !(file.usedByKBIds || []).every((id) => newFile.usedByKBIds.includes(id))
        )
      })

      if (hasChanges) {
        this.saveFilesMetadata()
        logger.info('清理文件元数据中已删除的知识库引用', 'main', { fileCount: this.files.length })
      }
    } catch (error) {
      logger.error('读取文件元数据失败', 'main', { error })
      this.files = []
    }
  }

  /**
   * 保存文件元数据
   */
  private saveFilesMetadata(): void {
    try {
      const filePath = getFilesMetadataPath()
      writeFileSync(filePath, JSON.stringify(this.files, null, 2), 'utf-8')
    } catch (error) {
      const errorMessage = `保存文件元数据失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 获取文件扩展名对应的文件类型
   */
  private getFileType(fileName: string): string {
    const ext = extname(fileName).toLowerCase()
    switch (ext) {
      case '.pdf':
        return 'pdf'
      case '.txt':
        return 'txt'
      case '.md':
        return 'md'
      case '.doc':
      case '.docx':
        return 'doc'
      case '.pptx':
        return 'pptx'
      case '.csv':
        return 'csv'
      default:
        return ext.replace('.', '') || 'unknown'
    }
  }

  /**
   * 格式化文件大小
   * 将字节转换为易读的格式
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * 获取所有文件列表
   */
  getAllFiles(): FileItem[] {
    if (!this.loaded) {
      this.initialize()
    }
    return [...this.files]
  }

  /**
   * 根据ID获取文件
   */
  getFileById(id: string): FileItem | null {
    if (!this.loaded) {
      this.initialize()
    }
    return this.files.find((f) => f.id === id) || null
  }

  /**
   * 搜索文件
   * 根据文件名搜索文件
   */
  searchFiles(query: string): FileItem[] {
    if (!this.loaded) {
      this.initialize()
    }
    const lowerQuery = query.toLowerCase()
    return this.files.filter((f) => f.name.toLowerCase().includes(lowerQuery))
  }

  /**
   * 上传文件
   */
  async uploadFile(
    fileData: Buffer,
    fileName: string
  ): Promise<{ success: boolean; file?: FileItem; error?: string; isDuplicate?: boolean }> {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const ext = extname(fileName).toLowerCase()
      if (!isSupportedDocumentExtension(ext)) {
        return {
          success: false,
          error: `不支持的文件类型: ${ext}，仅支持 ${SUPPORTED_DOCUMENT_EXTENSIONS.join(', ')}`
        }
      }

      const maxSize = 50 * 1024 * 1024
      if (fileData.length > maxSize) {
        return {
          success: false,
          error: `文件过大: ${this.formatFileSize(fileData.length)}，最大支持 50MB`
        }
      }

      const contentHash = calculateFileHash(fileData)

      const existingFile = this.files.find((f) => f.contentHash === contentHash)
      if (existingFile) {
        logger.info('发现重复文件', 'main', { name: fileName, existingName: existingFile.name })
        return { success: true, file: existingFile, isDuplicate: true }
      }

      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const safeFileName = `${timestamp}-${randomStr}${ext}`
      const filePath = join(getFilesStoragePath(), safeFileName)

      writeFileSync(filePath, fileData)

      const newFile: FileItem = {
        id: `file-${timestamp}`,
        name: fileName,
        filePath: safeFileName,
        absolutePath: filePath,
        fileType: this.getFileType(fileName),
        size: fileData.length,
        uploadedAt: new Date().toISOString(),
        usedByKBIds: [],
        contentHash
      }

      this.files.unshift(newFile)
      this.saveFilesMetadata()

      logger.info('文件上传成功', 'main', {
        id: newFile.id,
        name: newFile.name,
        size: newFile.size
      })
      return { success: true, file: newFile, isDuplicate: false }
    } catch (error) {
      const errorMessage = `文件上传失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除文件
   * 删除物理文件和元数据，可选择是否强制删除正在被知识库使用的文件
   */
  deleteFile(fileId: string, forceDelete: boolean = false): { success: boolean; error?: string } {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const fileIndex = this.files.findIndex((f) => f.id === fileId)
      if (fileIndex === -1) {
        return { success: false, error: '文件不存在' }
      }

      const file = this.files[fileIndex]

      if (file.usedByKBIds.length > 0 && !forceDelete) {
        return {
          success: false,
          error: `文件正在被 ${file.usedByKBIds.length} 个知识库使用，请先取消关联后再删除`
        }
      }

      if (forceDelete && file.usedByKBIds.length > 0) {
        const knowledgeBases = readKnowledgeBases()
        for (const kbId of file.usedByKBIds) {
          const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
          if (kbIndex !== -1) {
            knowledgeBases[kbIndex].linkedFileIds = knowledgeBases[kbIndex].linkedFileIds.filter(
              (id) => id !== fileId
            )
          }
        }
        writeKnowledgeBases(knowledgeBases)
        logger.info('强制删除文件，已从关联的知识库中移除', 'main', {
          fileId,
          kbIds: file.usedByKBIds
        })
      }

      const fullPath = join(getFilesStoragePath(), file.filePath)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }

      this.files.splice(fileIndex, 1)
      this.saveFilesMetadata()

      logger.info('文件删除成功', 'main', { id: fileId, name: file.name })
      return { success: true }
    } catch (error) {
      const errorMessage = `文件删除失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 将文件关联到知识库
   */
  linkFileToKB(fileId: string, kbId: string): { success: boolean; error?: string } {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const file = this.files.find((f) => f.id === fileId)
      if (!file) {
        return { success: false, error: '文件不存在' }
      }

      if (file.usedByKBIds.includes(kbId)) {
        return { success: false, error: '文件已关联到此知识库' }
      }

      file.usedByKBIds.push(kbId)
      this.saveFilesMetadata()

      const knowledgeBases = readKnowledgeBases()
      const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
      if (kbIndex !== -1) {
        if (!knowledgeBases[kbIndex].linkedFileIds) {
          knowledgeBases[kbIndex].linkedFileIds = []
        }
        knowledgeBases[kbIndex].linkedFileIds.push(fileId)
        knowledgeBases[kbIndex].documentCount = (knowledgeBases[kbIndex].documentCount || 0) + 1
        knowledgeBases[kbIndex].updatedAt = new Date().toISOString()
        writeKnowledgeBases(knowledgeBases)
      }

      logger.info('文件关联到知识库成功', 'main', { fileId, kbId })
      return { success: true }
    } catch (error) {
      const errorMessage = `文件关联失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 从知识库取消文件关联
   */
  unlinkFileFromKB(fileId: string, kbId: string): { success: boolean; error?: string } {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const file = this.files.find((f) => f.id === fileId)
      if (!file) {
        return { success: false, error: '文件不存在' }
      }

      const kbIndex = file.usedByKBIds.indexOf(kbId)
      if (kbIndex === -1) {
        return { success: false, error: '文件未关联到此知识库' }
      }

      file.usedByKBIds.splice(kbIndex, 1)
      this.saveFilesMetadata()

      const knowledgeBases = readKnowledgeBases()
      const kbIndex2 = knowledgeBases.findIndex((kb) => kb.id === kbId)
      if (kbIndex2 !== -1) {
        if (!knowledgeBases[kbIndex2].linkedFileIds) {
          knowledgeBases[kbIndex2].linkedFileIds = []
        }
        knowledgeBases[kbIndex2].linkedFileIds = knowledgeBases[kbIndex2].linkedFileIds.filter(
          (id) => id !== fileId
        )
        knowledgeBases[kbIndex2].documentCount = Math.max(
          0,
          (knowledgeBases[kbIndex2].documentCount || 0) - 1
        )
        knowledgeBases[kbIndex2].updatedAt = new Date().toISOString()
        writeKnowledgeBases(knowledgeBases)
      }

      logger.info('文件从知识库取消关联成功', 'main', { fileId, kbId })
      return { success: true }
    } catch (error) {
      const errorMessage = `取消文件关联失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取知识库关联的文件列表
   */
  getFilesByKBId(kbId: string): FileItem[] {
    if (!this.loaded) {
      this.initialize()
    }

    return this.files.filter((f) => f.usedByKBIds.includes(kbId))
  }

  /**
   * 检查文件是否被知识库使用
   */
  getFileUsage(fileId: string): string[] {
    if (!this.loaded) {
      this.initialize()
    }

    const file = this.files.find((f) => f.id === fileId)
    return file ? [...file.usedByKBIds] : []
  }
}

let fileServiceInstance: FileService | null = null

/**
 * 获取文件服务单例
 */
export function getFileService(): FileService {
  if (!fileServiceInstance) {
    fileServiceInstance = new FileService()
  }
  return fileServiceInstance
}
