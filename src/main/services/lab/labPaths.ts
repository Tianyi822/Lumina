import { join, normalize, basename } from 'path'
import { getConfigDirPath } from '../config/configPaths'

/** 实验室数据目录名称 */
export const LAB_DIR_NAME = 'lab'

/** 实验室元数据文件名 */
export const METADATA_FILE_NAME = 'metadata.json'

/** 操作日志文件名 */
export const OPERATION_LOG_FILE_NAME = 'opt.log'

/**
 * 获取实验室数据根目录路径
 */
export function getLabDirPath(): string {
  return join(getConfigDirPath(), LAB_DIR_NAME)
}

/**
 * 获取指定实验室的目录路径
 */
export function getLabInstancePath(labId: string): string {
  return join(getLabDirPath(), labId)
}

/**
 * 获取实验室元数据文件路径
 */
export function getMetadataFilePath(labId: string): string {
  return join(getLabInstancePath(labId), METADATA_FILE_NAME)
}

/**
 * 获取实验室操作日志文件路径
 */
export function getOperationLogPath(labId: string): string {
  return join(getLabInstancePath(labId), OPERATION_LOG_FILE_NAME)
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
 * 验证 labId 是否合法
 * 格式: lab-{timestamp}-{random}
 */
export function isValidLabId(labId: string): boolean {
  const pattern = /^lab-\d+-[a-z0-9]+$/
  if (!pattern.test(labId)) {
    return false
  }

  if (labId.includes('/') || labId.includes('\\') || labId.includes('..')) {
    return false
  }

  return true
}

/**
 * 验证路径是否在实验室数据目录内
 */
export function isPathInLabDir(filePath: string): boolean {
  const labDir = getLabDirPath()
  const normalizedPath = normalize(filePath)
  const normalizedLabDir = normalize(labDir)

  if (!normalizedPath.startsWith(normalizedLabDir)) {
    return false
  }

  const fileName = basename(normalizedPath)
  if (fileName !== basename(filePath)) {
    return false
  }

  return true
}

/**
 * 生成新的实验室 ID
 */
export function generateLabId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `lab-${timestamp}-${random}`
}
