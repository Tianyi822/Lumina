import { tmpdir } from 'os'
import { join, normalize, posix, sep } from 'path'

/** 默认项目根目录 */
export const DEFAULT_PROJECT_ROOT = '/app'

/** 允许写入的项目根目录白名单 */
export const ALLOWED_PROJECT_ROOTS = [DEFAULT_PROJECT_ROOT]

/**
 * 获取沙箱文件服务的临时目录根路径
 */
export function getSandboxFileTempRoot(): string {
  return join(tmpdir(), 'sparrow-manus', 'sandbox-files')
}

/**
 * 规范化并校验项目根目录
 */
export function normalizeProjectRoot(projectRoot?: string): string | null {
  const normalized = posix.normalize(projectRoot || DEFAULT_PROJECT_ROOT)
  return ALLOWED_PROJECT_ROOTS.includes(normalized) ? normalized : null
}

/**
 * 规范化并校验项目内相对文件路径
 */
export function normalizeProjectFilePath(filePath: string): string | null {
  if (typeof filePath !== 'string') {
    return null
  }

  const trimmedPath = filePath.trim()
  if (!trimmedPath || trimmedPath.includes('\0')) {
    return null
  }

  const unixStylePath = trimmedPath.replace(/\\/g, '/')
  if (unixStylePath.startsWith('/')) {
    return null
  }

  const normalized = posix.normalize(unixStylePath)
  if (!normalized || normalized === '.' || normalized === '..') {
    return null
  }

  if (normalized.startsWith('../') || normalized.includes('/../')) {
    return null
  }

  return normalized
}

/**
 * 校验路径是否位于临时目录内部
 */
export function isPathInTempRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = normalize(rootPath)
  const normalizedTarget = normalize(targetPath)
  return (
    normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
  )
}
