import { relative, resolve, sep } from 'path'
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
      return denied('协议 URL 无效')
    }
    const segments = decodePathSegments(url.pathname)
    if (!segments) {
      return denied('协议路径无效')
    }
    if (url.hostname === 'writing') {
      return resolveWritingResource(segments, roots.writingRoot)
    }
    if (url.hostname === 'paper') {
      return resolvePaperResource(segments, roots.papersRoot)
    }
    return denied('协议资源类型无效')
  } catch {
    return denied('协议 URL 无效')
  }
}

function resolveWritingResource(segments: string[], writingRoot: string): WriterProtocolResolution {
  if (segments.length !== 3 || segments[1] !== 'assets' || !isValidWriterDocumentId(segments[0])) {
    return denied('写作资源路径无效')
  }
  const mimeType = getImageMimeType(segments[2])
  if (!mimeType) {
    return denied('写作资源类型无效')
  }
  const assetsRoot = resolve(writingRoot, 'documents', segments[0], 'assets')
  const path = resolve(assetsRoot, segments[2])
  if (!isPathInside(assetsRoot, path)) {
    return denied('写作资源路径越界')
  }
  return { success: true, path, mimeType, cacheControl: IMMUTABLE_CACHE_CONTROL }
}

function resolvePaperResource(segments: string[], papersRoot: string): WriterProtocolResolution {
  const isPaperImage = segments.length >= 3 && (segments[1] === 'pages' || segments[1] === 'assets')
  const isSourcePdf = segments.length === 2 && segments[1] === 'source.pdf'
  if (!isPaperImage && !isSourcePdf) {
    return denied('论文资源路径无效')
  }
  const mimeType = isSourcePdf ? 'application/pdf' : getImageMimeType(segments[segments.length - 1])
  if (!mimeType) {
    return denied('论文资源类型无效')
  }
  const paperRoot = resolve(papersRoot, segments[0])
  const path = resolve(paperRoot, ...segments.slice(1))
  if (!isPathInside(paperRoot, path)) {
    return denied('论文资源路径越界')
  }
  return { success: true, path, mimeType, cacheControl: IMMUTABLE_CACHE_CONTROL }
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
