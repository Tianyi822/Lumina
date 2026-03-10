import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'

import { getConfigDirPath, getKnowledgeDirPath } from '@main/services/config/configPaths'
import { logger } from '@main/services/logger'

const KNOWLEDGE_DATA_DIR_NAME = 'data'
const KNOWLEDGE_FILES_DIR_NAME = 'files'
const KNOWLEDGE_VECTOR_DB_DIR_NAME = 'db'
const KNOWLEDGE_BASES_FILE_NAME = 'knowledge-bases.json'
const FILES_METADATA_FILE_NAME = 'files-metadata.json'

/**
 * 获取知识库数据目录
 */
export function getKnowledgeDataDirPath(): string {
  return join(getKnowledgeDirPath(), KNOWLEDGE_DATA_DIR_NAME)
}

/**
 * 获取知识库定义文件路径
 */
export function getKnowledgeBaseFilePath(): string {
  return join(getKnowledgeDirPath(), KNOWLEDGE_BASES_FILE_NAME)
}

/**
 * 获取文件元数据路径
 */
export function getFilesMetadataPath(): string {
  return join(getKnowledgeDirPath(), FILES_METADATA_FILE_NAME)
}

/**
 * 获取知识库文件存储目录
 */
export function getFilesStoragePath(): string {
  return join(getKnowledgeDataDirPath(), KNOWLEDGE_FILES_DIR_NAME)
}

/**
 * 获取向量数据库目录
 */
export function getVectorDBDirPath(): string {
  return join(getKnowledgeDataDirPath(), KNOWLEDGE_VECTOR_DB_DIR_NAME)
}

function ensureKnowledgeDir(): void {
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
}

function isEmptyDirectory(dirPath: string): boolean {
  if (!existsSync(dirPath)) {
    return false
  }

  try {
    return statSync(dirPath).isDirectory() && readdirSync(dirPath).length === 0
  } catch {
    return false
  }
}

function getLegacyKnowledgeBaseFilePath(): string {
  return join(getConfigDirPath(), KNOWLEDGE_BASES_FILE_NAME)
}

function getLegacyFilesMetadataPath(): string {
  return join(getConfigDirPath(), FILES_METADATA_FILE_NAME)
}

function getLegacyKnowledgeDataDirPath(): string {
  return join(getConfigDirPath(), KNOWLEDGE_DATA_DIR_NAME)
}

function migrateLegacyEntry(sourcePath: string, targetPath: string, label: string): void {
  if (!existsSync(sourcePath)) {
    return
  }

  if (existsSync(targetPath)) {
    if (isEmptyDirectory(targetPath)) {
      rmSync(targetPath)
    } else {
      logger.warn('发现旧版知识库存储，但新目录已存在，跳过自动迁移', 'main', {
        label,
        sourcePath,
        targetPath
      })
      return
    }
  }

  renameSync(sourcePath, targetPath)
  logger.info('知识库存储已迁移到新目录', 'main', {
    label,
    sourcePath,
    targetPath
  })
}

/**
 * 初始化知识库存储目录，并迁移旧版路径
 */
export function initializeKnowledgeStorage(): void {
  ensureKnowledgeDir()

  migrateLegacyEntry(
    getLegacyKnowledgeBaseFilePath(),
    getKnowledgeBaseFilePath(),
    'knowledge-bases.json'
  )
  migrateLegacyEntry(getLegacyFilesMetadataPath(), getFilesMetadataPath(), 'files-metadata.json')
  migrateLegacyEntry(getLegacyKnowledgeDataDirPath(), getKnowledgeDataDirPath(), 'data')
}
