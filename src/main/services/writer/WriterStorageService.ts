import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, open, readFile, readdir, rename, rm } from 'fs/promises'
import { join, relative, resolve, sep } from 'path'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import { saveWriterDocumentRequestSchema, writerDocumentSchema } from '@shared/schemas/writerSchema'
import type {
  SaveWriterDocumentRequest,
  WriterDocument,
  WriterDocumentSummary,
  WriterFolder,
  WriterIndex,
  WriterJsonDocument,
  WriterResult
} from '@shared/types/writer'
import {
  getWriterAssetsDir,
  getWriterDocumentDir,
  getWriterDocumentPath,
  getWritingRootPath,
  isValidWriterDocumentId
} from './writerPaths'

const WRITER_SCHEMA_VERSION = 1
const MAX_RECENT_DOCUMENTS = 50
const DEFAULT_DOCUMENT_TITLE = '未命名文档'

interface WriterStorageServiceOptions {
  rootPath?: string
}

interface StoredWriterIndex {
  schemaVersion: number
  folders: WriterFolder[]
  documents: WriterDocumentSummary[]
  recentDocumentIds: string[]
}

function createEmptyIndex(): WriterIndex {
  return {
    schemaVersion: WRITER_SCHEMA_VERSION,
    folders: [],
    documents: [],
    recentDocumentIds: []
  }
}

function createEmptyContent(): WriterJsonDocument {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }]
  }
}

function toSummary(document: WriterDocument): WriterDocumentSummary {
  return {
    id: document.id,
    revision: document.revision,
    title: document.title,
    folderId: document.folderId,
    favorite: document.favorite,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  }
}

function sortDocuments(documents: WriterDocumentSummary[]): WriterDocumentSummary[] {
  return [...documents].sort((left, right) => {
    if (left.favorite !== right.favorite) {
      return left.favorite ? -1 : 1
    }
    const updatedAtOrder = right.updatedAt.localeCompare(left.updatedAt)
    if (updatedAtOrder !== 0) {
      return updatedAtOrder
    }
    return left.id.localeCompare(right.id)
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWriterFolder(value: unknown): value is WriterFolder {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.sortOrder === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isWriterDocumentSummary(value: unknown): value is WriterDocumentSummary {
  return (
    isObject(value) &&
    isValidWriterDocumentId(typeof value.id === 'string' ? value.id : '') &&
    typeof value.revision === 'number' &&
    typeof value.title === 'string' &&
    (value.folderId === undefined || typeof value.folderId === 'string') &&
    typeof value.favorite === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function parseWriterIndex(value: unknown): WriterIndex | null {
  if (!isObject(value)) {
    return null
  }
  const stored = value as Partial<StoredWriterIndex>
  if (
    !Number.isInteger(stored.schemaVersion) ||
    !Array.isArray(stored.folders) ||
    !Array.isArray(stored.documents) ||
    !Array.isArray(stored.recentDocumentIds) ||
    !stored.folders.every(isWriterFolder) ||
    !stored.documents.every(isWriterDocumentSummary) ||
    !stored.recentDocumentIds.every((id) => typeof id === 'string' && isValidWriterDocumentId(id))
  ) {
    return null
  }
  return {
    schemaVersion: WRITER_SCHEMA_VERSION,
    folders: [...stored.folders].sort((left, right) => left.sortOrder - right.sortOrder),
    documents: sortDocuments(stored.documents),
    recentDocumentIds: [...new Set(stored.recentDocumentIds)].slice(0, MAX_RECENT_DOCUMENTS)
  }
}

/** 将历史文档转换为当前 Schema，保持函数无 I/O 副作用 */
function migrateWriterDocument(
  value: unknown
): { document: WriterDocument; changed: boolean } | null {
  const parsed = writerDocumentSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const document = parsed.data
  if (document.schemaVersion === WRITER_SCHEMA_VERSION) {
    return { document, changed: false }
  }
  return {
    document: { ...document, schemaVersion: WRITER_SCHEMA_VERSION },
    changed: true
  }
}

/** 写作文档的本地索引与原子存储服务 */
export class WriterStorageService {
  private readonly rootPath: string
  private readonly documentsPath: string
  private readonly indexPath: string
  private writeTail: Promise<void> = Promise.resolve()
  private initialized = false
  private index = createEmptyIndex()

  constructor(options: WriterStorageServiceOptions = {}) {
    this.rootPath = resolve(options.rootPath ?? getWritingRootPath())
    this.documentsPath = resolve(this.rootPath, 'documents')
    this.indexPath = resolve(this.rootPath, 'index.json')
  }

  async initialize(): Promise<WriterResult<WriterIndex>> {
    return this.enqueueWrite(async () => {
      try {
        const index = await this.initializeCore()
        return { success: true, data: structuredClone(index) }
      } catch (error) {
        return this.toIoError<WriterIndex>(
          'notifications.writer.operations.initializeStorage',
          error
        )
      }
    })
  }

  async createDocument(title?: string): Promise<WriterResult<WriterDocument>> {
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const normalizedTitle = title?.trim() || DEFAULT_DOCUMENT_TITLE
        if (normalizedTitle.length > 200) {
          return this.invalidInput<WriterDocument>(
            t('notifications.writer.titleTooLong', { max: 200 })
          )
        }

        const now = new Date().toISOString()
        const document = writerDocumentSchema.parse({
          schemaVersion: WRITER_SCHEMA_VERSION,
          id: `writer-${randomUUID()}`,
          revision: 0,
          title: normalizedTitle,
          content: createEmptyContent(),
          favorite: false,
          createdAt: now,
          updatedAt: now
        })
        await mkdir(getWriterAssetsDir(document.id, this.rootPath), { recursive: true })
        await this.writeDocumentAtomically(document)
        await this.upsertSummary(document)
        return { success: true, data: structuredClone(document) }
      } catch (error) {
        return this.toIoError<WriterDocument>(
          'notifications.writer.operations.createDocument',
          error
        )
      }
    })
  }

  async listDocuments(): Promise<WriterResult<WriterIndex>> {
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        return { success: true, data: structuredClone(this.index) }
      } catch (error) {
        return this.toIoError<WriterIndex>(
          'notifications.writer.operations.readDocumentIndex',
          error
        )
      }
    })
  }

  async getDocument(id: string): Promise<WriterResult<WriterDocument>> {
    if (!isValidWriterDocumentId(id)) {
      return this.invalidInput<WriterDocument>(t('notifications.writer.invalidId'))
    }
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const result = await this.readDocument(id)
        if (!result.success || !result.data) {
          return result
        }
        this.index.recentDocumentIds = [
          id,
          ...this.index.recentDocumentIds.filter((recentId) => recentId !== id)
        ].slice(0, MAX_RECENT_DOCUMENTS)
        await this.writeIndexAtomically(this.index)
        return { success: true, data: structuredClone(result.data) }
      } catch (error) {
        return this.toIoError<WriterDocument>('notifications.writer.operations.readDocument', error)
      }
    })
  }

  async saveDocument(request: SaveWriterDocumentRequest): Promise<WriterResult<WriterDocument>> {
    const parsedRequest = saveWriterDocumentRequestSchema.safeParse(request)
    if (!parsedRequest.success) {
      return this.invalidInput<WriterDocument>(t('notifications.writer.invalidSaveRequest'))
    }
    const validRequest = parsedRequest.data
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const currentResult = await this.readDocument(validRequest.documentId)
        if (!currentResult.success || !currentResult.data) {
          return currentResult
        }
        if (currentResult.data.revision !== validRequest.expectedRevision) {
          return {
            success: false,
            code: 'revision_conflict',
            error: t('notifications.writer.revisionConflict')
          }
        }

        const now = new Date().toISOString()
        const next = writerDocumentSchema.parse({
          ...currentResult.data,
          title: validRequest.title.trim() || DEFAULT_DOCUMENT_TITLE,
          content: validRequest.content,
          revision: validRequest.expectedRevision + 1,
          updatedAt: now
        })
        await this.writeDocumentAtomically(next)
        await this.upsertSummary(next)
        return { success: true, data: structuredClone(next) }
      } catch (error) {
        return this.toIoError<WriterDocument>('notifications.writer.operations.saveDocument', error)
      }
    })
  }

  async deleteDocument(id: string): Promise<WriterResult<void>> {
    if (!isValidWriterDocumentId(id) || !this.isSafeDocumentDirectory(id)) {
      return this.invalidInput<void>(t('notifications.writer.invalidId'))
    }
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const currentResult = await this.readDocument(id)
        if (!currentResult.success) {
          return { success: false, code: currentResult.code, error: currentResult.error }
        }
        await rm(getWriterDocumentDir(id, this.rootPath), { recursive: true, force: false })
        this.index.documents = this.index.documents.filter((document) => document.id !== id)
        this.index.recentDocumentIds = this.index.recentDocumentIds.filter(
          (recentId) => recentId !== id
        )
        await this.writeIndexAtomically(this.index)
        return { success: true }
      } catch (error) {
        return this.toIoError<void>('notifications.writer.operations.deleteDocument', error)
      }
    })
  }

  async createFolder(name: string): Promise<WriterResult<WriterFolder>> {
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const normalizedName = name.trim()
        if (!normalizedName || normalizedName.length > 100) {
          return this.invalidInput<WriterFolder>(t('notifications.writer.invalidFolderName'))
        }
        const now = new Date().toISOString()
        const folder: WriterFolder = {
          id: `folder-${randomUUID()}`,
          name: normalizedName,
          sortOrder: Math.max(-1, ...this.index.folders.map((item) => item.sortOrder)) + 1,
          createdAt: now,
          updatedAt: now
        }
        this.index.folders.push(folder)
        await this.writeIndexAtomically(this.index)
        return { success: true, data: structuredClone(folder) }
      } catch (error) {
        return this.toIoError<WriterFolder>('notifications.writer.operations.createFolder', error)
      }
    })
  }

  async renameFolder(id: string, name: string): Promise<WriterResult<WriterFolder>> {
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const normalizedName = name.trim()
        const folder = this.index.folders.find((item) => item.id === id)
        if (!folder) {
          return {
            success: false,
            code: 'not_found',
            error: t('notifications.writer.folderNotFound')
          }
        }
        if (!normalizedName || normalizedName.length > 100) {
          return this.invalidInput<WriterFolder>(t('notifications.writer.invalidFolderName'))
        }
        folder.name = normalizedName
        folder.updatedAt = new Date().toISOString()
        await this.writeIndexAtomically(this.index)
        return { success: true, data: structuredClone(folder) }
      } catch (error) {
        return this.toIoError<WriterFolder>('notifications.writer.operations.renameFolder', error)
      }
    })
  }

  async deleteFolder(id: string): Promise<WriterResult<void>> {
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        if (!this.index.folders.some((folder) => folder.id === id)) {
          return {
            success: false,
            code: 'not_found',
            error: t('notifications.writer.folderNotFound')
          }
        }
        const documents = await this.readAllDocuments()
        for (const document of documents) {
          if (document.folderId === id) {
            await this.updateStoredDocument(document, { folderId: undefined })
          }
        }
        this.index.folders = this.index.folders.filter((folder) => folder.id !== id)
        await this.rebuildDocumentSummaries()
        await this.writeIndexAtomically(this.index)
        return { success: true }
      } catch (error) {
        return this.toIoError<void>('notifications.writer.operations.deleteFolder', error)
      }
    })
  }

  async moveDocument(id: string, folderId?: string): Promise<WriterResult<WriterDocument>> {
    if (!isValidWriterDocumentId(id)) {
      return this.invalidInput<WriterDocument>(t('notifications.writer.invalidId'))
    }
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        if (folderId && !this.index.folders.some((folder) => folder.id === folderId)) {
          return {
            success: false,
            code: 'not_found',
            error: t('notifications.writer.folderNotFound')
          }
        }
        const result = await this.readDocument(id)
        if (!result.success || !result.data) {
          return result
        }
        const next = await this.updateStoredDocument(result.data, { folderId })
        return { success: true, data: structuredClone(next) }
      } catch (error) {
        return this.toIoError<WriterDocument>('notifications.writer.operations.moveDocument', error)
      }
    })
  }

  async setFavorite(id: string, favorite: boolean): Promise<WriterResult<WriterDocument>> {
    if (!isValidWriterDocumentId(id) || typeof favorite !== 'boolean') {
      return this.invalidInput<WriterDocument>(t('notifications.writer.invalidFavorite'))
    }
    return this.enqueueWrite(async () => {
      try {
        await this.ensureInitialized()
        const result = await this.readDocument(id)
        if (!result.success || !result.data) {
          return result
        }
        const next = await this.updateStoredDocument(result.data, { favorite })
        return { success: true, data: structuredClone(next) }
      } catch (error) {
        return this.toIoError<WriterDocument>(
          'notifications.writer.operations.updateFavorite',
          error
        )
      }
    })
  }

  // ============ 同步引擎专用接口（不经 WriterService 编排层） ============

  /** 同步下行 index（原子写，不触发 recentDocumentIds 更新） */
  applySyncedIndex(merged: WriterIndex): Promise<WriterResult<WriterIndex>> {
    return this.enqueueWrite(async () => {
      this.index = merged
      await this.writeIndexAtomically(this.index)
      return { success: true, data: this.index }
    })
  }

  /** 同步下行文档（原子写 document.json，不递增 revision，更新 summary） */
  applySyncedDocument(doc: WriterDocument): Promise<WriterResult<WriterDocument>> {
    return this.enqueueWrite(async () => {
      // 落盘前再次检查：若本地 revision 更新则跳过（防 autosave 竞态回退）
      const localResult = await this.readDocument(doc.id)
      if (localResult.success && localResult.data && localResult.data.revision > doc.revision) {
        return {
          success: false,
          code: 'revision_conflict',
          error: t('notifications.writer.localRevisionNewer')
        }
      }
      await this.writeDocumentAtomically(doc)
      await this.upsertSummary(doc)
      return { success: true, data: doc }
    })
  }

  /** 同步下行删除文档（rm -rf 目录 + 从 index 移除） */
  applySyncedDeletedDocument(documentId: string): Promise<WriterResult<true>> {
    return this.enqueueWrite(async () => {
      if (!isValidWriterDocumentId(documentId) || !this.isSafeDocumentDirectory(documentId)) {
        return this.invalidInput<true>(t('notifications.writer.invalidId'))
      }
      try {
        await rm(getWriterDocumentDir(documentId, this.rootPath), { recursive: true, force: true })
      } catch {
        // 目录不存在视为已删除
      }
      this.index.documents = this.index.documents.filter((d) => d.id !== documentId)
      this.index.recentDocumentIds = this.index.recentDocumentIds.filter((id) => id !== documentId)
      await this.writeIndexAtomically(this.index)
      return { success: true, data: true }
    })
  }

  /** 同步层只读：读取文档原始 JSON（不更新 recentDocumentIds，无副作用） */
  readDocumentForSync(documentId: string): Promise<WriterResult<WriterDocument>> {
    return this.readDocument(documentId)
  }

  private async initializeCore(): Promise<WriterIndex> {
    if (this.initialized) {
      return this.index
    }
    await mkdir(this.documentsPath, { recursive: true })
    await this.recoverTemporaryDocuments()
    await this.recoverTemporaryIndex()

    const storedIndex = await this.readIndex()
    this.index = storedIndex ?? createEmptyIndex()
    if (!storedIndex && existsSync(this.indexPath)) {
      logger.warn('写作文档索引损坏，正在重建', 'main', { path: this.indexPath })
    }

    await this.rebuildDocumentSummaries()
    await this.cleanTemporaryDocuments()
    await this.cleanTemporaryIndex()
    await this.writeIndexAtomically(this.index)
    this.initialized = true
    return this.index
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeCore()
    }
  }

  private async readIndex(): Promise<WriterIndex | null> {
    try {
      const content = await readFile(this.indexPath, 'utf-8')
      return parseWriterIndex(JSON.parse(content) as unknown)
    } catch {
      return null
    }
  }

  private async rebuildDocumentSummaries(): Promise<void> {
    const documents = await this.readAllDocuments()
    const documentIds = new Set(documents.map((document) => document.id))
    this.index.schemaVersion = WRITER_SCHEMA_VERSION
    this.index.documents = sortDocuments(documents.map(toSummary))
    this.index.recentDocumentIds = this.index.recentDocumentIds
      .filter((id, position, ids) => documentIds.has(id) && ids.indexOf(id) === position)
      .slice(0, MAX_RECENT_DOCUMENTS)
  }

  private async readAllDocuments(): Promise<WriterDocument[]> {
    const entries = await readdir(this.documentsPath, { withFileTypes: true })
    const documents: WriterDocument[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidWriterDocumentId(entry.name)) {
        continue
      }
      let migration: { document: WriterDocument; changed: boolean } | null
      try {
        const content = await readFile(getWriterDocumentPath(entry.name, this.rootPath), 'utf-8')
        migration = migrateWriterDocument(JSON.parse(content) as unknown)
      } catch {
        continue
      }
      if (!migration || migration.document.id !== entry.name) {
        continue
      }
      if (migration.changed) {
        await this.writeDocumentAtomically(migration.document)
      }
      documents.push(migration.document)
    }
    return documents
  }

  private async readDocument(id: string): Promise<WriterResult<WriterDocument>> {
    if (!isValidWriterDocumentId(id) || !this.isSafeDocumentDirectory(id)) {
      return this.invalidInput<WriterDocument>(t('notifications.writer.invalidId'))
    }
    try {
      const content = await readFile(getWriterDocumentPath(id, this.rootPath), 'utf-8')
      const migration = migrateWriterDocument(JSON.parse(content) as unknown)
      if (!migration) {
        return {
          success: false,
          code: 'io_error',
          error: t('notifications.writer.invalidDocumentData')
        }
      }
      if (migration.document.id !== id) {
        return {
          success: false,
          code: 'io_error',
          error: t('notifications.writer.documentDirectoryMismatch')
        }
      }
      return { success: true, data: migration.document }
    } catch (error) {
      const code = this.isNotFoundError(error) ? 'not_found' : 'io_error'
      return {
        success: false,
        code,
        error:
          code === 'not_found'
            ? t('notifications.writer.documentNotFound')
            : t('notifications.writer.readDocumentFailed')
      }
    }
  }

  private async updateStoredDocument(
    document: WriterDocument,
    changes: Partial<Pick<WriterDocument, 'folderId' | 'favorite'>>
  ): Promise<WriterDocument> {
    const next = writerDocumentSchema.parse({
      ...document,
      ...changes,
      revision: document.revision + 1,
      updatedAt: new Date().toISOString()
    })
    await this.writeDocumentAtomically(next)
    await this.upsertSummary(next)
    return next
  }

  private async upsertSummary(document: WriterDocument): Promise<void> {
    const summary = toSummary(document)
    const currentIndex = this.index.documents.findIndex((item) => item.id === document.id)
    if (currentIndex >= 0) {
      this.index.documents[currentIndex] = summary
    } else {
      this.index.documents.push(summary)
    }
    this.index.documents = sortDocuments(this.index.documents)
    await this.writeIndexAtomically(this.index)
  }

  private async recoverTemporaryDocuments(): Promise<void> {
    const entries = await readdir(this.documentsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidWriterDocumentId(entry.name)) {
        continue
      }
      const documentPath = getWriterDocumentPath(entry.name, this.rootPath)
      const temporaryPath = `${documentPath}.tmp`
      if (!existsSync(temporaryPath) || existsSync(documentPath)) {
        continue
      }
      try {
        const content = await readFile(temporaryPath, 'utf-8')
        const migration = migrateWriterDocument(JSON.parse(content) as unknown)
        if (migration?.document.id === entry.name) {
          await rename(temporaryPath, documentPath)
        }
      } catch {
        // 无效临时文件将在初始化末尾统一清理
      }
    }
  }

  private async recoverTemporaryIndex(): Promise<void> {
    const temporaryPath = `${this.indexPath}.tmp`
    if (!existsSync(temporaryPath) || existsSync(this.indexPath)) {
      return
    }
    try {
      const content = await readFile(temporaryPath, 'utf-8')
      if (parseWriterIndex(JSON.parse(content) as unknown)) {
        await rename(temporaryPath, this.indexPath)
      }
    } catch {
      // 无效索引临时文件将在初始化末尾统一清理
    }
  }

  private async cleanTemporaryDocuments(): Promise<void> {
    const entries = await readdir(this.documentsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      await rm(join(this.documentsPath, entry.name, 'document.json.tmp'), {
        force: true
      })
    }
  }

  private async cleanTemporaryIndex(): Promise<void> {
    await rm(`${this.indexPath}.tmp`, { force: true })
  }

  private async writeDocumentAtomically(document: WriterDocument): Promise<void> {
    const documentPath = getWriterDocumentPath(document.id, this.rootPath)
    await mkdir(getWriterDocumentDir(document.id, this.rootPath), { recursive: true })
    await this.writeJsonAtomically(documentPath, document)
  }

  private async writeIndexAtomically(index: WriterIndex): Promise<void> {
    await this.writeJsonAtomically(this.indexPath, index)
  }

  private async writeJsonAtomically(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.tmp`
    const file = await open(temporaryPath, 'w')
    try {
      await file.writeFile(JSON.stringify(value, null, 2))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, path)
  }

  private isSafeDocumentDirectory(id: string): boolean {
    const documentDirectory = resolve(getWriterDocumentDir(id, this.rootPath))
    const pathToRoot = relative(this.documentsPath, documentDirectory)
    return pathToRoot !== '' && !pathToRoot.startsWith(`..${sep}`) && pathToRoot !== '..'
  }

  private enqueueWrite<T>(operation: () => Promise<WriterResult<T>>): Promise<WriterResult<T>> {
    const next = this.writeTail.then(operation, operation)
    this.writeTail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private invalidInput<T>(error: string): WriterResult<T> {
    return { success: false, code: 'invalid_input', error }
  }

  private toIoError<T>(operationKey: string, error: unknown): WriterResult<T> {
    const detail = error instanceof Error ? error.message : String(error)
    const message = t('notifications.writer.operationFailed', { operation: t(operationKey) })
    logger.error(message, 'main', { error: detail, rootPath: this.rootPath })
    return { success: false, code: 'io_error', error: message }
  }

  private isNotFoundError(error: unknown): boolean {
    return isObject(error) && error.code === 'ENOENT'
  }
}
