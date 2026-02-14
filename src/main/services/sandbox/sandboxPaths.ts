import { join, normalize, basename } from 'path'
import { getConfigDirPath } from '../config/configPaths'

/** 沙箱数据目录名称 */
export const SANDBOX_DIR_NAME = 'sandboxs'

/** 沙箱元数据文件名 */
export const METADATA_FILE_NAME = 'metadata.json'

/** 操作日志文件名 */
export const OPERATION_LOG_FILE_NAME = 'opt.log'

/**
 * 获取沙箱数据根目录路径
 */
export function getSandboxDirPath(): string {
  return join(getConfigDirPath(), SANDBOX_DIR_NAME)
}

/**
 * 获取指定沙箱的目录路径
 */
export function getSandboxBoxPath(sandboxId: string): string {
  return join(getSandboxDirPath(), sandboxId)
}

/**
 * 获取沙箱元数据文件路径
 */
export function getMetadataFilePath(sandboxId: string): string {
  return join(getSandboxBoxPath(sandboxId), METADATA_FILE_NAME)
}

/**
 * 获取沙箱操作日志文件路径
 */
export function getOperationLogPath(sandboxId: string): string {
  return join(getSandboxBoxPath(sandboxId), OPERATION_LOG_FILE_NAME)
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50) || 'untitled'
  )
}

/**
 * 验证 sandboxId 是否合法
 * 格式: box-{timestamp}-{random}
 */
export function isValidSandboxId(sandboxId: string): boolean {
  const pattern = /^box-\d+-[a-z0-9]+$/
  if (!pattern.test(sandboxId)) {
    return false
  }

  if (sandboxId.includes('/') || sandboxId.includes('\\') || sandboxId.includes('..')) {
    return false
  }

  return true
}

/**
 * 验证路径是否在沙箱数据目录内
 */
export function isPathInSandboxDir(filePath: string): boolean {
  const sandboxDir = getSandboxDirPath()
  const normalizedPath = normalize(filePath)
  const normalizedSandboxDir = normalize(sandboxDir)

  if (!normalizedPath.startsWith(normalizedSandboxDir)) {
    return false
  }

  const fileName = basename(normalizedPath)
  if (fileName !== basename(filePath.split('/').pop() || '')) {
    return false
  }

  return true
}

/**
 * 生成新的沙箱 ID
 */
export function generateSandboxId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `box-${timestamp}-${random}`
}
