import { tmpdir } from 'os'
import { join, normalize, posix, sep } from 'path'

/** 默认项目根目录（后端服务目录） */
export const DEFAULT_PROJECT_ROOT = '/app'

/** 前端实验室项目根目录 */
export const FRONTEND_PROJECT_ROOT = '/workspace'

/** 允许写入的项目根目录白名单 */
export const ALLOWED_PROJECT_ROOTS = [DEFAULT_PROJECT_ROOT, FRONTEND_PROJECT_ROOT]

/**
 * 获取实验室文件服务的临时目录根路径
 */
export function getLabFileTempRoot(): string {
  return join(tmpdir(), 'lumina', 'lab-files')
}

/**
 * 规范化并校验项目根目录
 * 只允许白名单中的根目录
 * @returns 合法的根目录，无效返回 null
 */
export function normalizeProjectRoot(projectRoot?: string): string | null {
  const normalized = posix.normalize(projectRoot || DEFAULT_PROJECT_ROOT)
  return ALLOWED_PROJECT_ROOTS.includes(normalized) ? normalized : null
}

/**
 * 规范化并校验项目内相对文件路径
 * 防止路径遍历攻击（../）和空字节注入（\0）
 * @returns 合法规范化后的相对路径，无效返回 null
 */
export function normalizeProjectFilePath(filePath: string): string | null {
  if (typeof filePath !== 'string') {
    return null
  }

  const trimmedPath = filePath.trim()
  // 拒绝空路径和空字节注入
  if (!trimmedPath || trimmedPath.includes('\0')) {
    return null
  }

  // 统一为 Unix 风格路径
  const unixStylePath = trimmedPath.replace(/\\/g, '/')
  // 拒绝绝对路径
  if (unixStylePath.startsWith('/')) {
    return null
  }

  const normalized = posix.normalize(unixStylePath)
  if (!normalized || normalized === '.' || normalized === '..') {
    return null
  }

  // 防止路径遍历攻击
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    return null
  }

  return normalized
}

/**
 * 校验路径是否位于临时目录内部
 * 防止文件越界写入到系统其他位置
 */
export function isPathInTempRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = normalize(rootPath)
  const normalizedTarget = normalize(targetPath)
  return (
    normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
  )
}
