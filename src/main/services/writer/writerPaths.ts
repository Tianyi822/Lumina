import { app } from 'electron'
import { join } from 'path'

const WRITING_DIR_NAME = 'writing'
const DOCUMENTS_DIR_NAME = 'documents'
const INDEX_FILE_NAME = 'index.json'
const DOCUMENT_FILE_NAME = 'document.json'
const ASSETS_DIR_NAME = 'assets'
const WRITER_DOCUMENT_ID_PATTERN = /^writer-[a-z0-9-]{8,}$/

/** 获取写作工作区根目录 */
export function getWritingRootPath(): string {
  return join(app.getPath('home'), '.lumina', WRITING_DIR_NAME)
}

/** 获取写作索引路径 */
export function getWriterIndexPath(): string {
  return join(getWritingRootPath(), INDEX_FILE_NAME)
}

/** 获取写作文档目录 */
export function getWriterDocumentsPath(): string {
  return join(getWritingRootPath(), DOCUMENTS_DIR_NAME)
}

/** 获取单个写作文档目录 */
export function getWriterDocumentDir(documentId: string, rootPath = getWritingRootPath()): string {
  return join(rootPath, DOCUMENTS_DIR_NAME, documentId)
}

/** 获取单个写作文档数据路径 */
export function getWriterDocumentPath(documentId: string, rootPath = getWritingRootPath()): string {
  return join(getWriterDocumentDir(documentId, rootPath), DOCUMENT_FILE_NAME)
}

/** 获取单个写作文档资源目录 */
export function getWriterAssetsDir(documentId: string, rootPath = getWritingRootPath()): string {
  return join(getWriterDocumentDir(documentId, rootPath), ASSETS_DIR_NAME)
}

/** 判断文档 ID 是否可安全用于文件路径 */
export function isValidWriterDocumentId(documentId: string): boolean {
  return typeof documentId === 'string' && WRITER_DOCUMENT_ID_PATTERN.test(documentId)
}
