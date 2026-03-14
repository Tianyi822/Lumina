/**
 * PPT 模板服务
 * 负责模板的上传、存储、列表查询等操作
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, extname } from 'path'
import { PptTemplateAnalyzer } from './PptTemplateAnalyzer'
import {
  getTemplatesIndexPath,
  getTemplateDirPath,
  getTemplateSourcePath,
  getTemplateAnalysisPath,
  isValidTemplateId,
  ensureTemplateDir,
  initializePptTemplateStorage
} from './templatePaths'
import { logger } from '@main/services/logger'
import { truncateText } from '@shared/utils'
import type {
  PptTemplateListItem,
  CreatePptTemplateRequest,
  PptTemplateAnalysis
} from '@shared/types/ppt-template'

/** 最大文件大小（50MB） */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 支持的文件扩展名 */
const SUPPORTED_EXTENSIONS = ['.pptx']

type PptTemplateAnalysisDetailLevel = 'summary' | 'full'

/**
 * PPT 模板服务类
 */
export class PptTemplateService {
  private analyzer: PptTemplateAnalyzer
  private loaded: boolean = false
  private templates: PptTemplateListItem[] = []

  constructor() {
    this.analyzer = new PptTemplateAnalyzer()
  }

  /**
   * 初始化服务
   */
  initialize(): void {
    try {
      initializePptTemplateStorage()
      this.loadTemplatesIndex()
      this.loaded = true
      logger.info('PPT 模板服务初始化成功', 'main', { count: this.templates.length })
    } catch (error) {
      const errorMessage = `PPT 模板服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.templates = []
      this.loaded = true
    }
  }

  /**
   * 加载模板索引
   */
  private loadTemplatesIndex(): void {
    const indexPath = getTemplatesIndexPath()
    if (!existsSync(indexPath)) {
      this.templates = []
      return
    }

    try {
      const content = readFileSync(indexPath, 'utf-8')
      this.templates = JSON.parse(content) as PptTemplateListItem[]
    } catch (error) {
      logger.error('加载模板索引失败', 'main', { error })
      this.templates = []
    }
  }

  /**
   * 保存模板索引
   */
  private saveTemplatesIndex(): void {
    try {
      const indexPath = getTemplatesIndexPath()
      writeFileSync(indexPath, JSON.stringify(this.templates, null, 2), 'utf-8')
    } catch (error) {
      const errorMessage = `保存模板索引失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 获取所有模板列表
   */
  getAllTemplates(): PptTemplateListItem[] {
    if (!this.loaded) {
      this.initialize()
    }
    return [...this.templates]
  }

  /**
   * 根据 ID 获取模板
   */
  getTemplateById(id: string): PptTemplateListItem | null {
    if (!this.loaded) {
      this.initialize()
    }
    return this.templates.find((t) => t.id === id) || null
  }

  /**
   * 获取可供模型使用的模板列表
   * 仅返回分析完成的模板，按创建时间倒序排序
   */
  getAvailableTemplates(): PptTemplateListItem[] {
    if (!this.loaded) {
      this.initialize()
    }

    return this.templates
      .filter((template) => template.status === 'completed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((template) => ({ ...template }))
  }

  /**
   * 获取分析完成的模板
   */
  getAvailableTemplateById(templateId: string): PptTemplateListItem | null {
    return this.getAvailableTemplates().find((template) => template.id === templateId) || null
  }

  /**
   * 创建模板
   */
  async createTemplate(
    fileBuffer: Buffer,
    fileName: string,
    request: CreatePptTemplateRequest = {}
  ): Promise<{
    success: boolean
    data?: PptTemplateListItem
    error?: string
  }> {
    if (!this.loaded) {
      this.initialize()
    }

    let templateId: string | null = null
    let templateAddedToIndex = false

    try {
      // 1. 文件验证
      const validationResult = this.validateFile(fileBuffer, fileName)
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error }
      }

      // 2. 生成模板名称
      const templateName = this.generateTemplateName(fileName, request.name)

      // 3. 名称去重检查（case-insensitive）
      const nameConflictError = this.checkNameConflict(templateName)
      if (nameConflictError) {
        return { success: false, error: nameConflictError }
      }

      // 4. 生成模板 ID
      templateId = this.generateTemplateId()

      // 5. 创建模板目录
      ensureTemplateDir(templateId)

      // 6. 分析模板（必须成功才能继续）
      const {
        success,
        analysis,
        error: analysisError
      } = await this.analyzer.analyze(fileBuffer, templateId, templateName, fileName)

      if (!success || !analysis) {
        // 分析失败，清理已创建的目录
        this.cleanupTemplateDir(templateId)
        return { success: false, error: analysisError || '模板分析失败' }
      }

      // 7. 保存源文件
      const sourcePath = getTemplateSourcePath(templateId)
      writeFileSync(sourcePath, fileBuffer)

      // 8. 保存分析结果
      const analysisPath = getTemplateAnalysisPath(templateId)
      writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf-8')

      // 10. 创建模板元数据
      const templateItem: PptTemplateListItem = {
        id: templateId,
        name: templateName,
        originalFileName: fileName,
        fileSize: fileBuffer.length,
        slideCount: analysis.slides.length,
        createdAt: new Date().toISOString(),
        analysisVersion: analysis.schemaVersion,
        status: 'completed'
      }

      // 11. 写入索引（最后一步，确保前面的操作都成功）
      this.templates.unshift(templateItem)
      templateAddedToIndex = true
      this.saveTemplatesIndex()

      logger.info('PPT 模板创建成功', 'main', {
        id: templateId,
        name: templateName,
        slideCount: templateItem.slideCount
      })

      return { success: true, data: templateItem }
    } catch (error) {
      if (templateAddedToIndex && templateId) {
        this.templates = this.templates.filter((template) => template.id !== templateId)
      }

      if (templateId) {
        this.cleanupTemplateDir(templateId)
      }

      const errorMessage = `创建模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 验证文件
   */
  private validateFile(buffer: Buffer, fileName: string): { valid: boolean; error?: string } {
    // 检查文件大小
    if (buffer.length > MAX_FILE_SIZE) {
      return { valid: false, error: `文件过大（最大支持 50MB）` }
    }

    // 检查文件扩展名
    const ext = extname(fileName).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `不支持的文件类型，仅支持 .pptx` }
    }

    return { valid: true }
  }

  /**
   * 生成模板名称
   */
  private generateTemplateName(fileName: string, customName?: string): string {
    if (customName && customName.trim()) {
      return customName.trim()
    }

    // 默认名称：模板-{文件名去扩展名}
    const baseName = basename(fileName, extname(fileName))
    return `模板-${baseName}`
  }

  /**
   * 检查名称冲突（case-insensitive）
   */
  private checkNameConflict(name: string): string | undefined {
    const normalizedName = name.toLowerCase().trim()

    const conflict = this.templates.find((t) => t.name.toLowerCase().trim() === normalizedName)

    if (conflict) {
      return `模板名称 "${name}" 已存在，请使用其他名称`
    }

    return undefined
  }

  /**
   * 生成模板 ID
   */
  private generateTemplateId(): string {
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    return `ppt-template-${timestamp}-${randomStr}`
  }

  /**
   * 清理模板目录
   */
  private cleanupTemplateDir(templateId: string): void {
    try {
      const dirPath = getTemplateDirPath(templateId)
      if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true })
        logger.info('清理模板目录', 'main', { templateId })
      }
    } catch (error) {
      logger.warn('清理模板目录失败', 'main', { templateId, error })
    }
  }

  /**
   * 获取模板分析结果
   */
  getTemplateAnalysis(templateId: string): PptTemplateAnalysis | null {
    if (!isValidTemplateId(templateId)) {
      return null
    }

    const analysisPath = getTemplateAnalysisPath(templateId)
    if (!existsSync(analysisPath)) {
      return null
    }

    try {
      const content = readFileSync(analysisPath, 'utf-8')
      return JSON.parse(content) as PptTemplateAnalysis
    } catch (error) {
      logger.error('读取模板分析结果失败', 'main', { templateId, error })
      return null
    }
  }

  /**
   * 获取模板缩略图数据
   * 返回缩略图的 Buffer，如果不存在返回 null
   */
  getTemplateSourceData(templateId: string): Buffer | null {
    if (!isValidTemplateId(templateId)) {
      return null
    }

    const sourcePath = getTemplateSourcePath(templateId)
    if (!existsSync(sourcePath)) {
      return null
    }

    try {
      return readFileSync(sourcePath)
    } catch (error) {
      logger.error('读取模板源文件失败', 'main', { templateId, error })
      return null
    }
  }

  /**
   * 获取供工具调用使用的模板分析结果
   */
  getTemplateAnalysisForTool(
    templateId: string,
    detailLevel: PptTemplateAnalysisDetailLevel = 'summary'
  ): Record<string, unknown> | null {
    const template = this.getAvailableTemplateById(templateId)
    if (!template) {
      return null
    }

    const analysis = this.getTemplateAnalysis(templateId)
    if (!analysis) {
      return null
    }

    if (detailLevel === 'full') {
      return analysis as unknown as Record<string, unknown>
    }

    return this.buildTemplateAnalysisSummary(template, analysis)
  }

  /**
   * 构建适合模型消费的模板摘要
   */
  private buildTemplateAnalysisSummary(
    template: PptTemplateListItem,
    analysis: PptTemplateAnalysis
  ): Record<string, unknown> {
    return {
      template: {
        id: template.id,
        name: template.name,
        originalFileName: template.originalFileName,
        slideCount: template.slideCount,
        createdAt: template.createdAt
      },
      presentation: {
        slideCount: analysis.presentation.slideCount,
        slideWidth: analysis.presentation.slideWidth,
        slideHeight: analysis.presentation.slideHeight,
        themeName: analysis.presentation.themeName,
        masterCount: analysis.presentation.masterCount,
        layoutCount: analysis.presentation.layoutCount
      },
      slides: analysis.slides.map((slide) => {
        const elementKinds = Array.from(
          new Set(slide.elements.map((element) => element.kind).filter(Boolean))
        )
        const placeholderTypes = Array.from(
          new Set(
            slide.elements
              .map((element) => element.placeholder?.type)
              .filter((value): value is string => Boolean(value))
          )
        )

        return {
          slideIndex: slide.slideIndex,
          title: slide.title,
          layoutName: slide.layoutName,
          masterName: slide.masterName,
          elementCount: slide.elements.length,
          elementKinds,
          placeholderTypes,
          textSummary: truncateText(slide.plainText || '', 240),
          hasNotes: Boolean(slide.notesText?.trim())
        }
      })
    }
  }

  /**
   * 删除模板
   */
  deleteTemplate(templateId: string): { success: boolean; error?: string } {
    if (!this.loaded) {
      this.initialize()
    }

    try {
      const index = this.templates.findIndex((t) => t.id === templateId)
      if (index === -1) {
        return { success: false, error: '模板不存在' }
      }

      // 删除模板目录
      this.cleanupTemplateDir(templateId)

      // 从索引中移除
      this.templates.splice(index, 1)
      this.saveTemplatesIndex()

      logger.info('PPT 模板删除成功', 'main', { templateId })
      return { success: true }
    } catch (error) {
      const errorMessage = `删除模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }
}

/** 单例实例 */
let pptTemplateServiceInstance: PptTemplateService | null = null

/**
 * 获取 PPT 模板服务单例
 */
export function getPptTemplateService(): PptTemplateService {
  if (!pptTemplateServiceInstance) {
    pptTemplateServiceInstance = new PptTemplateService()
  }
  return pptTemplateServiceInstance
}
