/**
 * PPT 模板分析器
 * 解析 .pptx 文件结构，提取幻灯片、元素、样式等信息
 */

import { createHash } from 'crypto'
import type {
  PptTemplateAnalysis,
  PptTemplateSlideAnalysis,
  PptPresentationOverview
} from '@shared/types/ppt-template'
import { logger } from '@main/services/logger'
import { ANALYSIS_VERSION, DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT, PptxFiles } from './types'
import { PptxFileReader } from './PptxFileReader'
import { RelationshipResolver } from './RelationshipResolver'
import { ElementAnalyzer } from './ElementAnalyzer'
import { SlideAnalyzer } from './SlideAnalyzer'

/**
 * PPTX 模板分析器类
 * 协调各子分析器完成整体分析流程
 */
export class PptTemplateAnalyzer {
  private fileReader: PptxFileReader
  private relResolver: RelationshipResolver
  private elementAnalyzer: ElementAnalyzer
  private slideAnalyzer: SlideAnalyzer

  constructor() {
    this.fileReader = new PptxFileReader()
    this.relResolver = new RelationshipResolver()
    this.elementAnalyzer = new ElementAnalyzer(this.relResolver)
    this.slideAnalyzer = new SlideAnalyzer(this.elementAnalyzer, this.relResolver)
  }

  /**
   * 分析 PPTX 文件
   */
  async analyze(
    buffer: Buffer,
    templateId: string,
    templateName: string,
    fileName: string
  ): Promise<{
    success: boolean
    analysis?: PptTemplateAnalysis
    thumbnail?: Uint8Array
    error?: string
  }> {
    try {
      const files = await this.fileReader.extractPptxFiles(buffer)
      if (!files) {
        return { success: false, error: '无法解压 PPTX 文件' }
      }

      // 解析各级关系
      this.relResolver.resolveSlideRelationships(files)
      this.relResolver.resolveLayoutRelationships(files)
      this.relResolver.resolveMasterMetadata(files)

      const presentation = this.parsePresentationInfo(files)
      const slides: PptTemplateSlideAnalysis[] = []
      const orderedSlides = [...files.slides.entries()].sort((left, right) => left[0] - right[0])

      for (const [index, slideFile] of orderedSlides) {
        slides.push(await this.slideAnalyzer.analyzeSlide(index, slideFile, files))
      }

      const analysis: PptTemplateAnalysis = {
        schemaVersion: ANALYSIS_VERSION,
        templateId,
        templateName,
        source: {
          originalFileName: fileName,
          fileSize: buffer.length,
          uploadedAt: new Date().toISOString(),
          hash: this.calculateHash(buffer)
        },
        presentation,
        slides
      }

      // 提取内置缩略图
      const thumbnail = this.extractThumbnail(files)

      logger.info('PPTX 模板分析完成', 'main', {
        templateId,
        slideCount: slides.length,
        hasThumbnail: !!thumbnail
      })

      return { success: true, analysis, thumbnail }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPTX 模板分析失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 提取 PPTX 内置缩略图
   * PPTX 文件通常在 docProps/thumbnail.jpeg 包含缩略图
   */
  private extractThumbnail(files: PptxFiles): Uint8Array | undefined {
    // 尝试常见的缩略图路径
    const thumbnailPaths = [
      'docProps/thumbnail.jpeg',
      'docProps/thumbnail.jpg',
      'docProps/thumbnail.png'
    ]

    for (const path of thumbnailPaths) {
      const thumbnail = files.media.get(path)
      if (thumbnail) {
        return thumbnail
      }
    }

    return undefined
  }

  /**
   * 解析演示文稿信息
   */
  private parsePresentationInfo(files: PptxFiles): PptPresentationOverview {
    let slideWidth = DEFAULT_SLIDE_WIDTH
    let slideHeight = DEFAULT_SLIDE_HEIGHT

    const presentationRoot =
      this.getNode(files.presentation, 'p:presentation') ?? files.presentation
    const slideSize = this.getNode(presentationRoot, 'p:sldSz')

    slideWidth = this.getNumber(this.getValue(slideSize, 'cx')) ?? slideWidth
    slideHeight = this.getNumber(this.getValue(slideSize, 'cy')) ?? slideHeight

    let themeName: string | undefined
    for (const [themeId, theme] of files.themes) {
      const themeRoot = this.getNode(theme, 'a:theme') ?? theme
      themeName = this.getString(this.getValue(themeRoot, 'name')) || themeId
      if (themeName) {
        break
      }
    }

    return {
      slideCount: files.slides.size,
      slideWidth,
      slideHeight,
      themeName,
      masterCount: files.masters.size,
      layoutCount: files.layouts.size
    }
  }

  /**
   * 计算文件哈希
   */
  private calculateHash(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex')
  }

  /**
   * 判断是否为 XML 节点对象
   */
  private isXmlNode(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  /**
   * 获取对象属性值
   */
  private getValue(node: Record<string, unknown> | undefined | null, key: string): unknown {
    return node?.[key]
  }

  /**
   * 获取对象子节点
   */
  private getNode(
    node: Record<string, unknown> | undefined | null,
    key: string
  ): Record<string, unknown> | undefined {
    const value = this.getValue(node, key)
    return this.isXmlNode(value) ? value : undefined
  }

  /**
   * 读取字符串值
   */
  private getString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number') {
      return String(value)
    }

    return undefined
  }

  /**
   * 读取数值
   */
  private getNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return Number.isNaN(parsed) ? undefined : parsed
    }

    return undefined
  }
}
