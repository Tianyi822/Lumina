import { createHash, randomUUID } from 'crypto'
import { link, lstat, mkdir, open, readdir, readFile, rm, unlink } from 'fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'path'
import { logger } from '@main/services/logger'
import type { WriterAsset, WriterAssetImportInput, WriterResult } from '@shared/types/writer'
import {
  getWriterAssetsDir,
  getWriterDocumentDir,
  getWritingRootPath,
  isValidWriterDocumentId
} from './writerPaths'

const MAX_ASSET_BYTES = 20 * 1024 * 1024
const ASSET_CACHE_CONTROL = 'private, max-age=31536000, immutable'

interface WriterAssetServiceOptions {
  rootPath?: string
}

interface ImageFormat {
  extension: 'png' | 'jpg' | 'webp' | 'gif'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

const IMAGE_FORMATS: Record<string, ImageFormat> = {
  png: { extension: 'png', mimeType: 'image/png' },
  jpg: { extension: 'jpg', mimeType: 'image/jpeg' },
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
  gif: { extension: 'gif', mimeType: 'image/gif' }
}

function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return IMAGE_FORMATS.png
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return IMAGE_FORMATS.jpg
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return IMAGE_FORMATS.webp
  }
  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return IMAGE_FORMATS.gif
  }
  return null
}

function hasSafeFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName === basename(fileName) &&
    !fileName.includes('\\') &&
    !fileName.includes('\0')
  )
}

/** 写作图片资源的校验、去重与清理服务 */
export class WriterAssetService {
  private readonly rootPath: string
  private readonly documentsPath: string

  constructor(options: WriterAssetServiceOptions = {}) {
    this.rootPath = resolve(options.rootPath ?? getWritingRootPath())
    this.documentsPath = resolve(this.rootPath, 'documents')
  }

  async importBytes(
    documentId: string,
    input: WriterAssetImportInput
  ): Promise<WriterResult<WriterAsset>> {
    const validation = this.validateImport(documentId, input)
    if (!validation.success || !validation.data) {
      return {
        success: false,
        code: validation.code ?? 'invalid_input',
        error: validation.error ?? '图片导入请求无效'
      }
    }

    const { bytes, format } = validation.data
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const storedFileName = `${sha256}.${format.extension}`
    const relativePath = `assets/${storedFileName}`
    try {
      const assetsPath = await this.ensureSafeAssetsDirectory(documentId)
      const targetPath = resolve(assetsPath, storedFileName)
      if (!this.isPathInside(assetsPath, targetPath)) {
        return this.invalidInput<WriterAsset>('资源路径无效')
      }
      await this.writeDeduplicatedFile(targetPath, bytes, sha256)
      return {
        success: true,
        data: {
          assetId: sha256,
          fileName: input.fileName,
          relativePath,
          mimeType: format.mimeType,
          size: bytes.byteLength,
          sha256,
          url: `lumina://writing/${documentId}/${relativePath}`
        }
      }
    } catch (error) {
      return this.toIoError<WriterAsset>('导入写作图片资源失败', error)
    }
  }

  async collectGarbage(
    documentId: string,
    referencedPaths: string[]
  ): Promise<WriterResult<number>> {
    if (!isValidWriterDocumentId(documentId) || !Array.isArray(referencedPaths)) {
      return this.invalidInput<number>('文档 ID 或资源引用无效')
    }

    try {
      const assetsPath = getWriterAssetsDir(documentId, this.rootPath)
      if (!this.isSafeAssetsPath(documentId, assetsPath)) {
        return this.invalidInput<number>('资源目录无效')
      }
      const referencedFileNames = new Set(
        referencedPaths.flatMap((path) => this.toSafeReferencedFileName(path))
      )
      let removed = 0
      const entries = await readdir(assetsPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith('.tmp') || referencedFileNames.has(entry.name)) {
          continue
        }
        const targetPath = resolve(assetsPath, entry.name)
        if (!this.isPathInside(assetsPath, targetPath)) {
          continue
        }
        await unlink(targetPath)
        removed += 1
      }
      return { success: true, data: removed }
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return { success: true, data: 0 }
      }
      return this.toIoError<number>('清理写作图片资源失败', error)
    }
  }

  private validateImport(
    documentId: string,
    input: WriterAssetImportInput
  ): WriterResult<{ bytes: Buffer; format: ImageFormat }> {
    if (
      !isValidWriterDocumentId(documentId) ||
      !input ||
      typeof input.fileName !== 'string' ||
      typeof input.declaredMimeType !== 'string' ||
      !(input.bytes instanceof Uint8Array)
    ) {
      return this.invalidInput('图片导入请求无效')
    }
    if (input.bytes.byteLength > MAX_ASSET_BYTES) {
      return this.invalidInput('图片资源不能超过 20MB')
    }
    if (!hasSafeFileName(input.fileName)) {
      return this.invalidInput('图片文件名无效')
    }
    const fileExtension = extname(input.fileName).slice(1).toLowerCase()
    const declaredFormat = IMAGE_FORMATS[fileExtension]
    const bytes = Buffer.from(input.bytes)
    const detectedFormat = detectImageFormat(bytes)
    if (!declaredFormat || !detectedFormat || declaredFormat.mimeType !== detectedFormat.mimeType) {
      return this.invalidInput('图片扩展名或内容签名无效')
    }
    if (input.declaredMimeType.toLowerCase() !== detectedFormat.mimeType) {
      return this.invalidInput('图片 MIME 类型与内容不匹配')
    }
    return { success: true, data: { bytes, format: detectedFormat } }
  }

  private async ensureSafeAssetsDirectory(documentId: string): Promise<string> {
    const assetsPath = getWriterAssetsDir(documentId, this.rootPath)
    if (!this.isSafeAssetsPath(documentId, assetsPath)) {
      throw new Error('资源目录越界')
    }
    await mkdir(assetsPath, { recursive: true })
    await this.assertRealDirectory(this.rootPath)
    await this.assertRealDirectory(this.documentsPath)
    await this.assertRealDirectory(getWriterDocumentDir(documentId, this.rootPath))
    await this.assertRealDirectory(assetsPath)
    return assetsPath
  }

  private async writeDeduplicatedFile(path: string, bytes: Buffer, sha256: string): Promise<void> {
    try {
      await this.verifyExistingFile(path, sha256)
      return
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error
      }
    }

    const temporaryPath = join(dirname(path), `.${basename(path)}-${randomUUID()}.tmp`)
    try {
      const file = await open(temporaryPath, 'wx')
      try {
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
      try {
        await link(temporaryPath, path)
      } catch (error) {
        if (!this.isAlreadyExistsError(error)) {
          throw error
        }
        await this.verifyExistingFile(path, sha256)
      }
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  private async verifyExistingFile(path: string, sha256: string): Promise<void> {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('重复资源不是普通文件')
    }
    const existing = await readFile(path)
    if (createHash('sha256').update(existing).digest('hex') !== sha256) {
      throw new Error('重复资源哈希不一致')
    }
  }

  private toSafeReferencedFileName(path: unknown): string[] {
    if (typeof path !== 'string' || !path.startsWith('assets/')) {
      return []
    }
    const fileName = path.slice('assets/'.length)
    return hasSafeFileName(fileName) ? [fileName] : []
  }

  private isSafeAssetsPath(documentId: string, assetsPath: string): boolean {
    const documentPath = resolve(getWriterDocumentDir(documentId, this.rootPath))
    return (
      this.isPathInside(this.documentsPath, documentPath) &&
      this.isPathInside(documentPath, resolve(assetsPath))
    )
  }

  private isPathInside(rootPath: string, candidatePath: string): boolean {
    const relativePath = relative(resolve(rootPath), resolve(candidatePath))
    return relativePath !== '' && !relativePath.startsWith(`..${sep}`) && relativePath !== '..'
  }

  private async assertRealDirectory(path: string): Promise<void> {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('资源目录不能是符号链接')
    }
  }

  private invalidInput<T>(error: string): WriterResult<T> {
    return { success: false, code: 'invalid_input', error }
  }

  private toIoError<T>(message: string, error: unknown): WriterResult<T> {
    const detail = error instanceof Error ? error.message : String(error)
    logger.error(message, 'main', { error: detail, rootPath: this.rootPath })
    return { success: false, code: 'io_error', error: message }
  }

  private isAlreadyExistsError(error: unknown): boolean {
    return this.getErrorCode(error) === 'EEXIST'
  }

  private isNotFoundError(error: unknown): boolean {
    return this.getErrorCode(error) === 'ENOENT'
  }

  private getErrorCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return null
    }
    return typeof error.code === 'string' ? error.code : null
  }
}

export { ASSET_CACHE_CONTROL }
