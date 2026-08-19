import { lstat, realpath } from 'fs/promises'
import { dirname, relative, resolve, sep } from 'path'
import { t } from '@main/services/i18n'
import { isValidWriterDocumentId } from '@main/services/writer/writerPaths'

const IMMUTABLE_CACHE_CONTROL = 'private, max-age=31536000, immutable'

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export interface LuminaProtocolRoots {
  papersRoot: string
  writingRoot: string
}

export type WriterProtocolResolution =
  | { success: true; path: string; mimeType: string; cacheControl: string }
  | { success: false; errorCode: number; reason: string }

/** 将 lumina URL 安全解析为论文或写作资源的本地路径 */
export function resolveLuminaResource(
  rawUrl: string,
  roots: LuminaProtocolRoots
): WriterProtocolResolution {
  try {
    const url = new URL(rawUrl)
    if (
      url.protocol !== 'lumina:' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return denied(t('notifications.protocol.invalidProtocolUrl'))
    }
    const segments = decodePathSegments(url.pathname)
    if (!segments) {
      return denied(t('notifications.protocol.invalidProtocolPath'))
    }
    if (url.hostname === 'writing') {
      return resolveWritingResource(segments, roots.writingRoot)
    }
    if (url.hostname === 'paper') {
      return resolvePaperResource(segments, roots.papersRoot)
    }
    return denied(t('notifications.protocol.invalidResourceType'))
  } catch {
    return denied(t('notifications.protocol.invalidProtocolUrl'))
  }
}

/** 在读取前确认目标及其资源根目录均未通过符号链接逃逸 */
export async function resolveLuminaResourceFile(
  rawUrl: string,
  roots: LuminaProtocolRoots
): Promise<WriterProtocolResolution> {
  const resolution = resolveLuminaResource(rawUrl, roots)
  if (!resolution.success) {
    return resolution
  }
  try {
    const resourceRoot = getResourceRoot(rawUrl, roots)
    if (!resourceRoot) {
      return denied(t('notifications.protocol.invalidResourcePath'))
    }
    const canonicalRoot = await getCanonicalDirectory(resourceRoot)
    if (isWritingUrl(rawUrl)) {
      const canonicalWritingRoot = await realpath(roots.writingRoot)
      if (
        !isPathInside(canonicalWritingRoot, canonicalRoot) ||
        !(await hasSafeWritingDirectoryChain(resourceRoot, canonicalWritingRoot))
      ) {
        return denied(t('notifications.protocol.writingRootOutOfBounds'))
      }
    }
    const fileStat = await lstat(resolution.path)
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      return denied(t('notifications.protocol.notPlainFile'))
    }
    const canonicalFilePath = await realpath(resolution.path)
    if (!isPathInside(canonicalRoot, canonicalFilePath)) {
      return denied(t('notifications.protocol.realPathOutOfBounds'))
    }
    return { ...resolution, path: canonicalFilePath }
  } catch {
    return denied(t('notifications.protocol.resourceUnreadable'))
  }
}

function resolveWritingResource(segments: string[], writingRoot: string): WriterProtocolResolution {
  if (segments.length !== 3 || segments[1] !== 'assets' || !isValidWriterDocumentId(segments[0])) {
    return denied(t('notifications.protocol.invalidWritingPath'))
  }
  const mimeType = getImageMimeType(segments[2])
  if (!mimeType) {
    return denied(t('notifications.protocol.invalidWritingType'))
  }
  const assetsRoot = resolve(writingRoot, 'documents', segments[0], 'assets')
  const path = resolve(assetsRoot, segments[2])
  if (!isPathInside(assetsRoot, path)) {
    return denied(t('notifications.protocol.writingPathOutOfBounds'))
  }
  return { success: true, path, mimeType, cacheControl: IMMUTABLE_CACHE_CONTROL }
}

function resolvePaperResource(segments: string[], papersRoot: string): WriterProtocolResolution {
  if (segments.length < 2) {
    return denied(t('notifications.protocol.invalidPaperPath'))
  }
  const mimeType = getPaperMimeType(segments)
  const paperRoot = resolve(papersRoot, segments[0])
  const path = resolve(paperRoot, ...segments.slice(1))
  if (!isPathInside(paperRoot, path)) {
    return denied(t('notifications.protocol.paperPathOutOfBounds'))
  }
  return { success: true, path, mimeType, cacheControl: IMMUTABLE_CACHE_CONTROL }
}

function getPaperMimeType(segments: string[]): string {
  if (segments.length === 2 && segments[1] === 'source.pdf') {
    return 'application/pdf'
  }
  return getImageMimeType(segments[segments.length - 1]) ?? 'application/octet-stream'
}

function getResourceRoot(rawUrl: string, roots: LuminaProtocolRoots): string | null {
  try {
    const url = new URL(rawUrl)
    const segments = decodePathSegments(url.pathname)
    if (!segments) {
      return null
    }
    if (url.hostname === 'writing' && segments.length === 3 && segments[1] === 'assets') {
      return resolve(roots.writingRoot, 'documents', segments[0], 'assets')
    }
    if (url.hostname === 'paper' && segments.length >= 2) {
      return resolve(roots.papersRoot, segments[0])
    }
    return null
  } catch {
    return null
  }
}

function isWritingUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname === 'writing'
  } catch {
    return false
  }
}

async function getCanonicalDirectory(path: string): Promise<string> {
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(t('notifications.protocol.rootNotPlainDirectory'))
  }
  return realpath(path)
}

/** 仅允许 URL 指向其自身的真实 documents/<id>/assets 目录链 */
async function hasSafeWritingDirectoryChain(
  assetsPath: string,
  canonicalWritingRoot: string
): Promise<boolean> {
  const documentPath = dirname(assetsPath)
  const documentsPath = dirname(documentPath)
  try {
    const canonicalDocumentsPath = await getCanonicalDirectory(documentsPath)
    const canonicalDocumentPath = await getCanonicalDirectory(documentPath)
    return (
      isPathInside(canonicalWritingRoot, canonicalDocumentsPath) &&
      isPathInside(canonicalDocumentsPath, canonicalDocumentPath)
    )
  } catch {
    return false
  }
}

function decodePathSegments(pathname: string): string[] | null {
  const rawSegments = pathname.split('/').filter(Boolean)
  if (rawSegments.length === 0) {
    return null
  }
  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return null
    }
    if (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0') ||
      segment.includes('%')
    ) {
      return null
    }
    segments.push(segment)
  }
  return segments
}

function getImageMimeType(fileName: string): string | null {
  const extensionIndex = fileName.lastIndexOf('.')
  if (extensionIndex <= 0) {
    return null
  }
  return IMAGE_MIME_TYPES[fileName.slice(extensionIndex).toLowerCase()] ?? null
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath))
  return relativePath !== '' && !relativePath.startsWith(`..${sep}`) && relativePath !== '..'
}

function denied(reason: string): WriterProtocolResolution {
  return { success: false, errorCode: -10, reason }
}
