import { mkdirSync } from 'fs'
import { join } from 'path'
import { getConfigDirPath } from '@main/services/config'

const PRESENTATION_DIR_NAME = 'presentation'
const TEMPLATE_METADATA_FILE_NAME = 'templates.json'

/**
 * 获取 PPT 模板存储目录
 */
export function getPresentationDirPath(): string {
  return join(getConfigDirPath(), PRESENTATION_DIR_NAME)
}

/**
 * 获取 PPT 模板元数据文件路径
 */
export function getPresentationTemplateMetadataPath(): string {
  return join(getPresentationDirPath(), TEMPLATE_METADATA_FILE_NAME)
}

/**
 * 确保 PPT 模板存储目录存在
 */
export function ensurePresentationDir(): void {
  mkdirSync(getPresentationDirPath(), { recursive: true })
}
