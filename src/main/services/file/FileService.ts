import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import { logger } from '@main/services/logger'
import { getVectorDBService } from '@main/services/vector'
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
  isSupportedDocumentExtension
} from '@shared/constants/document'
import type {
  FileItem,
  FileOriginInfo,
  FilePreviewData,
  KnowledgeIndexInvalidationState,
  KnowledgeBase
} from '@shared/types/knowledge'
import type { PaperAnnotation, PaperDocument } from '@shared/types/paper'
import {
  getFilesMetadataPath as getFilesMetadataStoragePath,
  getFilesStoragePath as getKnowledgeFilesStoragePath,
  getKnowledgeBaseFilePath,
  initializeKnowledgeStorage
} from '@main/services/knowledge/knowledgePaths'
import {
  createFilePreviewDataFromContent,
  readFileContent,
  readFilePreviewData
} from './FileContentReader'

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

export function getPaperFileResourceId(paperId: string): string {
  return `paper-file-${paperId}`
}

export function getPaperNoteResourceId(paperId: string): string {
  return `paper-note-${paperId}`
}

export function getLegacyPaperNoteResourceId(paperId: string, annotationId: string): string {
  return `paper-note-${paperId}-${annotationId}`
}

function compactText(value: string, maxLength: number = 120): string {
  const compacted = value.replace(/\s+/g, ' ').trim()
  if (compacted.length <= maxLength) {
    return compacted
  }
  return `${compacted.slice(0, maxLength - 1)}…`
}

function formatPaperSourceLocation(annotation: PaperAnnotation): string {
  const sourceRefs = annotation.semanticAnchor.sourceRefs
  const pageIndexes = sourceRefs.pageIndexes.map((pageIndex) => pageIndex + 1)
  const pages = pageIndexes.length > 0 ? `第 ${pageIndexes.join('、')} 页` : '未知页码'
  const viewName = annotation.createdInView === 'translation' ? '译文' : '原文'
  return `${pages} / ${viewName}`
}

function getPaperAnnotationSortKey(annotation: PaperAnnotation): {
  pageIndex: number
  blockIndex: number
  createdAt: string
  id: string
} {
  const sourceRefs = annotation.semanticAnchor.sourceRefs
  return {
    pageIndex: sourceRefs.start?.pageIndex ?? sourceRefs.pageIndexes[0] ?? Number.MAX_SAFE_INTEGER,
    blockIndex:
      sourceRefs.start?.blockIndex ?? sourceRefs.blockIndexes[0] ?? Number.MAX_SAFE_INTEGER,
    createdAt: annotation.createdAt,
    id: annotation.id
  }
}

function sortPaperNoteAnnotations(annotations: PaperAnnotation[]): PaperAnnotation[] {
  return [...annotations].sort((a, b) => {
    const aKey = getPaperAnnotationSortKey(a)
    const bKey = getPaperAnnotationSortKey(b)
    return (
      aKey.pageIndex - bKey.pageIndex ||
      aKey.blockIndex - bKey.blockIndex ||
      aKey.createdAt.localeCompare(bKey.createdAt) ||
      aKey.id.localeCompare(bKey.id)
    )
  })
}

function getLatestTimestamp(values: string[]): string {
  return values.filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || new Date().toISOString()
}

function buildPaperNoteSection(annotation: PaperAnnotation, index: number): string[] {
  const sourceLocation = formatPaperSourceLocation(annotation)
  const selectedText =
    annotation.selectedTextSnapshot ||
    annotation.originalAnchor?.selectedText ||
    annotation.translationAnchor?.selectedText ||
    ''
  const contextBefore = annotation.contextBefore || annotation.originalAnchor?.prefixText || ''
  const contextAfter = annotation.contextAfter || annotation.originalAnchor?.suffixText || ''

  return [
    `## ${index + 1}. ${sourceLocation}`,
    '',
    `创建时间：${annotation.createdAt}`,
    `更新时间：${annotation.updatedAt}`,
    '',
    '### 笔记',
    annotation.comment,
    '',
    '### 选中文本',
    selectedText || '无选中文本',
    '',
    '### 上下文',
    contextBefore ? `前文：${contextBefore}` : '前文：无',
    contextAfter ? `后文：${contextAfter}` : '后文：无'
  ]
}

function buildPaperNotesContent(paper: PaperDocument, annotations: PaperAnnotation[]): string {
  const sortedAnnotations = sortPaperNoteAnnotations(annotations)
  const latestUpdatedAt = getLatestTimestamp(
    sortedAnnotations.map((annotation) => annotation.updatedAt)
  )
  const sections = sortedAnnotations.flatMap((annotation, index) => [
    '',
    ...buildPaperNoteSection(annotation, index)
  ])

  return [
    `# ${paper.fileName} - 论文笔记`,
    '',
    `论文：${paper.fileName}`,
    `笔记数量：${sortedAnnotations.length}`,
    `最近更新：${latestUpdatedAt}`,
    ...sections
  ].join('\n')
}

function buildPaperNotesSummary(paper: PaperDocument, annotations: PaperAnnotation[]): string {
  const latestUpdatedAt = getLatestTimestamp(annotations.map((annotation) => annotation.updatedAt))
  return `${paper.fileName} · ${annotations.length} 条笔记 · 最近更新 ${latestUpdatedAt}`
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function createUploadedOrigin(): FileOriginInfo {
  return {
    displayName: '上传文件',
    allowExternalOpen: true,
    allowDelete: true
  }
}

async function removeFileChunksFromKnowledgeBases(fileId: string, kbIds: string[]): Promise<void> {
  for (const kbId of kbIds) {
    try {
      await getVectorDBService().deleteFileChunks(kbId, fileId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('删除文件索引失败，继续清理文件元数据', 'main', {
        fileId,
        kbId,
        error: errorMessage
      })
    }
  }
}

function removeInvalidatedFileFromKnowledgeBase(kb: KnowledgeBase, fileId: string): KnowledgeBase {
  const invalidation = kb.indexInvalidation
  if (!invalidation) {
    return kb
  }

  const nextFiles = invalidation.files.filter((file) => file.fileId !== fileId)
  const nextInvalidation: KnowledgeIndexInvalidationState | undefined =
    nextFiles.length > 0
      ? {
          ...invalidation,
          files: nextFiles
        }
      : undefined

  return {
    ...kb,
    indexInvalidation: nextInvalidation
  }
}

export interface PaperNoteResourceSyncResult {
  success: boolean
  file?: FileItem
  error?: string
  contentChanged?: boolean
  previousUsedByKBIds?: string[]
  legacyMigrated?: boolean
  removedFileIds?: string[]
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

  private normalizeStoredFile(
    file: FileItem,
    existingKBIds: Set<string>
  ): { file: FileItem; changed: boolean } {
    const sourceKind = file.sourceKind || 'uploaded'
    const usedByKBIds = (file.usedByKBIds || []).filter((kbId) => existingKBIds.has(kbId))
    const origin: FileOriginInfo =
      sourceKind === 'uploaded'
        ? { ...createUploadedOrigin(), ...(file.origin || {}) }
        : {
            allowExternalOpen: sourceKind === 'paper_file',
            allowDelete: false,
            ...(file.origin || {})
          }
    const absolutePath =
      sourceKind === 'uploaded'
        ? join(getFilesStoragePath(), file.filePath)
        : file.absolutePath || ''
    const normalizedFile: FileItem = {
      ...file,
      sourceKind,
      origin,
      absolutePath,
      usedByKBIds
    }

    return {
      file: normalizedFile,
      changed:
        file.sourceKind !== normalizedFile.sourceKind ||
        file.absolutePath !== normalizedFile.absolutePath ||
        JSON.stringify(file.origin || null) !== JSON.stringify(normalizedFile.origin || null) ||
        (file.usedByKBIds || []).length !== normalizedFile.usedByKBIds.length ||
        !(file.usedByKBIds || []).every((id) => normalizedFile.usedByKBIds.includes(id))
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
      const normalizedFiles = files.map((file) => this.normalizeStoredFile(file, existingKBIds))

      this.files = normalizedFiles.map((item) => item.file)
      const hasChanges = normalizedFiles.some((item) => item.changed)

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
    return this.files.filter((file) => {
      const searchableText = [
        file.name,
        file.sourceKind,
        file.origin?.paperName,
        file.origin?.displayName,
        file.origin?.summary
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(lowerQuery)
    })
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
        contentHash,
        sourceKind: 'uploaded',
        origin: createUploadedOrigin()
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

  registerPaperFile(paper: PaperDocument): { success: boolean; file?: FileItem; error?: string } {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const fileId = getPaperFileResourceId(paper.id)
      const existingFile = this.files.find((file) => file.id === fileId)
      const now = new Date().toISOString()
      const paperFile: FileItem = {
        id: fileId,
        name: paper.fileName,
        filePath: `paper://${paper.id}/source.pdf`,
        absolutePath: paper.filePath,
        fileType: 'pdf',
        size: paper.fileSize,
        uploadedAt: existingFile?.uploadedAt || paper.createdAt || now,
        usedByKBIds: existingFile?.usedByKBIds || [],
        contentHash: paper.fileHash,
        sourceKind: 'paper_file',
        origin: {
          paperId: paper.id,
          paperName: paper.fileName,
          displayName: '论文',
          summary: `论文：${paper.fileName}`,
          allowExternalOpen: true,
          allowDelete: false,
          updatedAt: paper.updatedAt
        }
      }

      if (existingFile) {
        Object.assign(existingFile, paperFile)
      } else {
        this.files.unshift(paperFile)
      }

      this.saveFilesMetadata()
      logger.info('论文已同步到文件资源池', 'main', { paperId: paper.id, fileId })
      return { success: true, file: existingFile || paperFile }
    } catch (error) {
      const errorMessage = `同步论文文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage, 'main', { paperId: paper.id })
      return { success: false, error: errorMessage }
    }
  }

  private getPaperNoteResourceKnowledgeBaseIds(files: FileItem[]): string[] {
    const fileIds = new Set(files.map((file) => file.id))
    const knowledgeBases = readKnowledgeBases()
    const linkedKBIds = knowledgeBases
      .filter((kb) => (kb.linkedFileIds || []).some((fileId) => fileIds.has(fileId)))
      .map((kb) => kb.id)

    return uniqueStrings([...files.flatMap((file) => file.usedByKBIds || []), ...linkedKBIds])
  }

  private getPaperNoteFilesByPaperId(paperId: string): FileItem[] {
    return this.files.filter((file) => {
      return file.sourceKind === 'paper_note' && file.origin?.paperId === paperId
    })
  }

  private getLegacyPaperNoteFiles(paperId: string): FileItem[] {
    const aggregateFileId = getPaperNoteResourceId(paperId)
    return this.getPaperNoteFilesByPaperId(paperId).filter((file) => file.id !== aggregateFileId)
  }

  private async removePaperNoteFiles(files: FileItem[]): Promise<void> {
    if (files.length === 0) {
      return
    }

    const fileIds = new Set(files.map((file) => file.id))
    const affectedKBIds = this.getPaperNoteResourceKnowledgeBaseIds(files)
    const knowledgeBases = readKnowledgeBases()
    const now = new Date().toISOString()
    let knowledgeBasesChanged = false

    for (let index = 0; index < knowledgeBases.length; index++) {
      let nextKB = knowledgeBases[index]
      let kbChanged = false
      const linkedFileIds = nextKB.linkedFileIds || []
      const nextLinkedFileIds = linkedFileIds.filter((fileId) => !fileIds.has(fileId))

      if (nextLinkedFileIds.length !== linkedFileIds.length) {
        nextKB = {
          ...nextKB,
          linkedFileIds: nextLinkedFileIds,
          documentCount: nextLinkedFileIds.length
        }
        kbChanged = true
      }

      for (const fileId of fileIds) {
        const previousInvalidation = nextKB.indexInvalidation
        nextKB = removeInvalidatedFileFromKnowledgeBase(nextKB, fileId)
        kbChanged = kbChanged || previousInvalidation !== nextKB.indexInvalidation
      }

      if (kbChanged) {
        knowledgeBases[index] = {
          ...nextKB,
          updatedAt: now
        }
        knowledgeBasesChanged = true
      }
    }

    if (knowledgeBasesChanged) {
      writeKnowledgeBases(knowledgeBases)
    }

    for (const file of files) {
      await removeFileChunksFromKnowledgeBases(file.id, affectedKBIds)
    }

    this.files = this.files.filter((file) => !fileIds.has(file.id))
    this.saveFilesMetadata()
  }

  private async migrateLegacyPaperNoteResources(
    aggregateFileId: string,
    legacyFiles: FileItem[],
    aggregateUsedByKBIds: string[]
  ): Promise<void> {
    if (legacyFiles.length === 0) {
      return
    }

    const legacyFileIds = new Set(legacyFiles.map((file) => file.id))
    const legacyUsedByKBIds = this.getPaperNoteResourceKnowledgeBaseIds(legacyFiles)
    const targetKBIds = uniqueStrings([...aggregateUsedByKBIds, ...legacyUsedByKBIds])
    const knowledgeBases = readKnowledgeBases()
    const now = new Date().toISOString()
    let knowledgeBasesChanged = false

    for (let index = 0; index < knowledgeBases.length; index++) {
      let nextKB = knowledgeBases[index]
      let kbChanged = false
      const linkedFileIds = nextKB.linkedFileIds || []
      const nextLinkedFileIds = linkedFileIds.filter((fileId) => !legacyFileIds.has(fileId))

      if (targetKBIds.includes(nextKB.id) && !nextLinkedFileIds.includes(aggregateFileId)) {
        nextLinkedFileIds.push(aggregateFileId)
      }

      if (
        nextLinkedFileIds.length !== linkedFileIds.length ||
        nextLinkedFileIds.some((fileId, itemIndex) => linkedFileIds[itemIndex] !== fileId)
      ) {
        nextKB = {
          ...nextKB,
          linkedFileIds: nextLinkedFileIds,
          documentCount: nextLinkedFileIds.length
        }
        kbChanged = true
      }

      for (const legacyFileId of legacyFileIds) {
        const previousInvalidation = nextKB.indexInvalidation
        nextKB = removeInvalidatedFileFromKnowledgeBase(nextKB, legacyFileId)
        kbChanged = kbChanged || previousInvalidation !== nextKB.indexInvalidation
      }

      if (kbChanged) {
        knowledgeBases[index] = {
          ...nextKB,
          updatedAt: now
        }
        knowledgeBasesChanged = true
      }
    }

    if (knowledgeBasesChanged) {
      writeKnowledgeBases(knowledgeBases)
    }

    for (const legacyFile of legacyFiles) {
      await removeFileChunksFromKnowledgeBases(legacyFile.id, targetKBIds)
    }

    this.files = this.files.filter((file) => !legacyFileIds.has(file.id))
    this.saveFilesMetadata()

    logger.info('旧版逐批注论文笔记资源已合并为论文级资源', 'main', {
      aggregateFileId,
      legacyFileIds: [...legacyFileIds],
      kbIds: targetKBIds
    })
  }

  async upsertPaperNotesResource(
    paper: PaperDocument,
    annotations: PaperAnnotation[]
  ): Promise<PaperNoteResourceSyncResult> {
    if (!this.loaded) {
      this.initialize()
    }

    const noteAnnotations = sortPaperNoteAnnotations(
      annotations.filter((annotation) => annotation.kind === 'note')
    )
    if (noteAnnotations.length === 0) {
      return this.removePaperNotesResource(paper.id)
    }

    try {
      const fileId = getPaperNoteResourceId(paper.id)
      const existingFile = this.files.find((file) => file.id === fileId)
      const legacyFiles = this.getLegacyPaperNoteFiles(paper.id)
      const previousContentHash = existingFile?.contentHash
      const previousUsedByKBIds = uniqueStrings([
        ...(existingFile ? this.getPaperNoteResourceKnowledgeBaseIds([existingFile]) : []),
        ...this.getPaperNoteResourceKnowledgeBaseIds(legacyFiles)
      ])
      const content = buildPaperNotesContent(paper, noteAnnotations)
      const contentHash = calculateFileHash(Buffer.from(content, 'utf-8'))
      const selectedText = noteAnnotations
        .map((annotation) => {
          return (
            annotation.selectedTextSnapshot ||
            annotation.originalAnchor?.selectedText ||
            annotation.translationAnchor?.selectedText ||
            ''
          )
        })
        .filter(Boolean)
        .map((text) => compactText(text, 80))
        .join('\n')
      const latestUpdatedAt = getLatestTimestamp(
        noteAnnotations.map((annotation) => annotation.updatedAt)
      )
      const noteFile: FileItem = {
        id: fileId,
        name: `${paper.fileName} - 论文笔记.md`,
        filePath: `paper://${paper.id}/notes.md`,
        absolutePath: '',
        fileType: 'md',
        size: Buffer.byteLength(content, 'utf-8'),
        uploadedAt: existingFile?.uploadedAt || noteAnnotations[0]?.createdAt || paper.createdAt,
        usedByKBIds: previousUsedByKBIds,
        contentHash,
        sourceKind: 'paper_note',
        origin: {
          paperId: paper.id,
          paperName: paper.fileName,
          displayName: '论文笔记',
          summary: buildPaperNotesSummary(paper, noteAnnotations),
          noteContent: content,
          allowExternalOpen: false,
          allowDelete: false,
          selectedText,
          updatedAt: latestUpdatedAt
        }
      }

      if (existingFile) {
        Object.assign(existingFile, noteFile)
      } else {
        this.files.unshift(noteFile)
      }

      this.saveFilesMetadata()
      if (legacyFiles.length > 0) {
        await this.migrateLegacyPaperNoteResources(fileId, legacyFiles, previousUsedByKBIds)
      }

      logger.info('论文笔记已同步到文件资源池', 'main', {
        paperId: paper.id,
        fileId,
        noteCount: noteAnnotations.length
      })
      return {
        success: true,
        file: existingFile || noteFile,
        contentChanged:
          typeof previousContentHash === 'string' && previousContentHash !== contentHash,
        previousUsedByKBIds,
        legacyMigrated: legacyFiles.length > 0,
        removedFileIds: legacyFiles.map((file) => file.id)
      }
    } catch (error) {
      const errorMessage = `同步论文笔记失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage, 'main', { paperId: paper.id })
      return { success: false, error: errorMessage }
    }
  }

  async removePaperNotesResource(paperId: string): Promise<PaperNoteResourceSyncResult> {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const noteFiles = this.getPaperNoteFilesByPaperId(paperId)
      if (noteFiles.length === 0) {
        return { success: true, removedFileIds: [] }
      }

      await this.removePaperNoteFiles(noteFiles)
      return {
        success: true,
        removedFileIds: noteFiles.map((file) => file.id)
      }
    } catch (error) {
      const errorMessage = `移除论文笔记失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage, 'main', { paperId })
      return { success: false, error: errorMessage }
    }
  }

  async removePaperNoteResource(
    paperId: string,
    annotationId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    const fileId = getLegacyPaperNoteResourceId(paperId, annotationId)
    const fileIndex = this.files.findIndex((file) => file.id === fileId)
    if (fileIndex === -1) {
      return { success: true }
    }

    return this.removeFileAtIndex(fileIndex, {
      forceDelete: true,
      allowManagedResourceDelete: true
    })
  }

  async removePaperResources(paperId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    const resourceIds = this.files
      .filter((file) => file.origin?.paperId === paperId)
      .map((file) => file.id)

    for (const resourceId of resourceIds) {
      const fileIndex = this.files.findIndex((file) => file.id === resourceId)
      if (fileIndex === -1) {
        continue
      }

      const result = await this.removeFileAtIndex(fileIndex, {
        forceDelete: true,
        allowManagedResourceDelete: true
      })
      if (!result.success) {
        return result
      }
    }

    return { success: true }
  }

  async readFileResourceContent(
    fileId: string
  ): Promise<{ success: boolean; data?: { content: string; file: FileItem }; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    const file = this.getFileById(fileId)
    if (!file) {
      return { success: false, error: '文件不存在' }
    }

    if (file.sourceKind === 'paper_note') {
      const content = file.origin?.noteContent || ''
      if (!content.trim()) {
        return { success: false, error: '论文笔记内容为空' }
      }

      return { success: true, data: { content, file } }
    }

    if (!file.absolutePath || !existsSync(file.absolutePath)) {
      return { success: false, error: '文件不存在，可能已被删除' }
    }

    try {
      const content = await readFileContent(file.absolutePath, file.name)
      return { success: true, data: { content, file } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  async readFileResourcePreview(
    fileId: string
  ): Promise<{ success: boolean; data?: FilePreviewData; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    const file = this.getFileById(fileId)
    if (!file) {
      return { success: false, error: '文件不存在' }
    }

    if (file.sourceKind === 'paper_note') {
      return createFilePreviewDataFromContent(
        file.origin?.noteContent || '',
        file.name,
        file.size,
        file.uploadedAt,
        file.fileType
      )
    }

    return readFilePreviewData(
      file.absolutePath,
      file.name,
      file.size,
      file.uploadedAt,
      file.fileType
    )
  }

  private async removeFileAtIndex(
    fileIndex: number,
    options: { forceDelete?: boolean; allowManagedResourceDelete?: boolean } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const file = this.files[fileIndex]

    if (!file) {
      return { success: false, error: '文件不存在' }
    }

    if (
      file.sourceKind !== 'uploaded' &&
      file.origin?.allowDelete === false &&
      !options.allowManagedResourceDelete
    ) {
      return { success: false, error: '论文来源资源由论文系统管理，请在论文页面删除' }
    }

    if (file.usedByKBIds.length > 0 && !options.forceDelete) {
      return {
        success: false,
        error: `文件正在被 ${file.usedByKBIds.length} 个知识库使用，请先取消关联后再删除`
      }
    }

    if (file.usedByKBIds.length > 0) {
      const usedByKBIds = [...file.usedByKBIds]
      const knowledgeBases = readKnowledgeBases()

      for (const kbId of usedByKBIds) {
        const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
        if (kbIndex !== -1) {
          knowledgeBases[kbIndex].linkedFileIds = knowledgeBases[kbIndex].linkedFileIds.filter(
            (id) => id !== file.id
          )
          knowledgeBases[kbIndex] = removeInvalidatedFileFromKnowledgeBase(
            knowledgeBases[kbIndex],
            file.id
          )
          knowledgeBases[kbIndex].documentCount = knowledgeBases[kbIndex].linkedFileIds.length
          knowledgeBases[kbIndex].updatedAt = new Date().toISOString()
        }
      }

      await removeFileChunksFromKnowledgeBases(file.id, usedByKBIds)
      writeKnowledgeBases(knowledgeBases)
      logger.info('删除文件时已从关联知识库移除', 'main', {
        fileId: file.id,
        kbIds: usedByKBIds
      })
    }

    if (file.sourceKind === 'uploaded') {
      const fullPath = join(getFilesStoragePath(), file.filePath)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }
    }

    this.files.splice(fileIndex, 1)
    this.saveFilesMetadata()

    logger.info('文件删除成功', 'main', { id: file.id, name: file.name })
    return { success: true }
  }

  /**
   * 删除文件
   * 删除物理文件和元数据，可选择是否强制删除正在被知识库使用的文件
   */
  async deleteFile(
    fileId: string,
    forceDelete: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const fileIndex = this.files.findIndex((f) => f.id === fileId)
      if (fileIndex === -1) {
        return { success: false, error: '文件不存在' }
      }

      return await this.removeFileAtIndex(fileIndex, { forceDelete })
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
        if (!knowledgeBases[kbIndex].linkedFileIds.includes(fileId)) {
          knowledgeBases[kbIndex].linkedFileIds.push(fileId)
        }
        knowledgeBases[kbIndex].documentCount = knowledgeBases[kbIndex].linkedFileIds.length
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
        knowledgeBases[kbIndex2] = removeInvalidatedFileFromKnowledgeBase(
          knowledgeBases[kbIndex2],
          fileId
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
