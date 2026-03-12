/**
 * PPT 模板路径管理
 * 统一管理 ~/.sparrow-manus/ppt-template 目录下的所有路径
 */

import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { getConfigDirPath } from '@main/services/config/configPaths'

/** PPT 模板存储目录名称 */
export const PPT_TEMPLATE_DIR_NAME = 'ppt-template'

/** 模板索引文件名 */
export const TEMPLATES_INDEX_FILE_NAME = 'templates.json'

/** 源文件名 */
export const SOURCE_FILE_NAME = 'source.pptx'

/** 分析结果文件名 */
export const ANALYSIS_FILE_NAME = 'analysis.json'

/**
 * 获取 PPT 模板存储目录路径
 * 返回 ~/.sparrow-manus/ppt-template
 */
export function getPptTemplateDirPath(): string {
  return join(getConfigDirPath(), PPT_TEMPLATE_DIR_NAME)
}

/**
 * 获取模板索引文件路径
 * 返回 ~/.sparrow-manus/ppt-template/templates.json
 */
export function getTemplatesIndexPath(): string {
  return join(getPptTemplateDirPath(), TEMPLATES_INDEX_FILE_NAME)
}

/**
 * 获取指定模板的目录路径
 * 返回 ~/.sparrow-manus/ppt-template/<templateId>
 */
export function getTemplateDirPath(templateId: string): string {
  return join(getPptTemplateDirPath(), templateId)
}

/**
 * 获取模板源文件路径
 * 返回 ~/.sparrow-manus/ppt-template/<templateId>/source.pptx
 */
export function getTemplateSourcePath(templateId: string): string {
  return join(getTemplateDirPath(templateId), SOURCE_FILE_NAME)
}

/**
 * 获取模板分析结果文件路径
 * 返回 ~/.sparrow-manus/ppt-template/<templateId>/analysis.json
 */
export function getTemplateAnalysisPath(templateId: string): string {
  return join(getTemplateDirPath(templateId), ANALYSIS_FILE_NAME)
}

/**
 * 验证模板 ID 是否合法
 * 防止路径遍历攻击
 */
export function isValidTemplateId(templateId: string): boolean {
  // templateId 格式: ppt-template-{timestamp}-{random}
  const pattern = /^ppt-template-\d+-[a-z0-9]+$/
  if (!pattern.test(templateId)) {
    return false
  }

  // 额外检查：确保没有路径分隔符
  if (templateId.includes('/') || templateId.includes('\\') || templateId.includes('..')) {
    return false
  }

  return true
}

/**
 * 确保 PPT 模板存储目录存在
 */
export function ensurePptTemplateDir(): void {
  const dirPath = getPptTemplateDirPath()
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 确保指定模板的目录存在
 */
export function ensureTemplateDir(templateId: string): void {
  if (!isValidTemplateId(templateId)) {
    throw new Error(`无效的模板 ID: ${templateId}`)
  }
  const dirPath = getTemplateDirPath(templateId)
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 初始化 PPT 模板存储
 * 确保目录和索引文件存在
 */
export function initializePptTemplateStorage(): void {
  ensurePptTemplateDir()

  // 如果索引文件不存在，创建空数组
  const indexPath = getTemplatesIndexPath()
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, JSON.stringify([], null, 2), 'utf-8')
  }
}
