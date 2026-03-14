/**
 * PPT 导出服务
 * 协调内容解析、样式配置和生成流程
 */

import { readFileSync } from 'fs'
import { extname } from 'path'
import { unzipSync } from 'fflate'
import { logger } from '@main/services/logger'
import { getPptTemplateService } from './PptTemplateService'
import { getTemplateSourcePath } from './templatePaths'
import { PptContentParser } from './PptContentParser'
import { PptGenerator } from './PptGenerator'
import { PptTemplateStyleExtractor } from './PptTemplateStyleExtractor'
import { getDefaultPresetStyle, PPT_STYLE_PRESETS } from './PptStylePresets'
import type {
  PreviewPptExportResult,
  GeneratePptRequest,
  GeneratePptResult,
  PptExportConfig,
  PptSlideSize,
  PptStyleConfig,
  PptStylePreset,
  SlideStyle,
  TemplateSlideLayout,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'
import type { ParsedSlide } from '@shared/types/ppt-export'
import type { PptTemplateAnalysis, PptTemplateSlideAnalysis } from '@shared/types/ppt-template'

/** 最大推荐的幻灯片数量 */
const MAX_RECOMMENDED_SLIDES = 50

/** 最大允许的幻灯片数量 */
const MAX_ALLOWED_SLIDES = 100

/** 性能监控阈值（毫秒） */
const PERFORMANCE_WARNING_THRESHOLD = 3000

/**
 * 模板渲染上下文
 */
interface TemplateRenderBundle {
  analysis: PptTemplateAnalysis
  mediaData: Map<string, string>
}

/**
 * PPT 导出服务
 * 提供内容解析、样式配置和 PPT 生成功能
 */
export class PptExportService {
  private parser: PptContentParser
  private styleExtractor: PptTemplateStyleExtractor

  constructor() {
    this.parser = new PptContentParser()
    this.styleExtractor = new PptTemplateStyleExtractor()
  }

  /**
   * 获取最大推荐的幻灯片数量
   */
  getMaxRecommendedSlides(): number {
    return MAX_RECOMMENDED_SLIDES
  }

  /**
   * 检查幻灯片数量是否在推荐范围内
   */
  isSlideCountRecommended(count: number): boolean {
    return count <= MAX_RECOMMENDED_SLIDES
  }

  /**
   * 获取幻灯片数量警告信息
   */
  getSlideCountWarning(count: number): string | null {
    if (count > MAX_ALLOWED_SLIDES) {
      return `幻灯片数量 (${count}) 超过最大限制 (${MAX_ALLOWED_SLIDES})，请减少页面数量`
    }
    if (count > MAX_RECOMMENDED_SLIDES) {
      return `幻灯片数量 (${count}) 较多，生成可能需要较长时间。建议控制在 ${MAX_RECOMMENDED_SLIDES} 页以内以获得最佳性能。`
    }
    return null
  }

  /**
   * 预览导出配置
   * 解析内容并返回配置数据，供前端显示配置对话框
   * @param content - 消息内容
   * @param templateId - 模板 ID（可选，用于提取样式）
   * @returns 导出预览结果
   */
  async previewExport(
    content: string,
    templateId?: string
  ): Promise<PreviewPptExportResult> {
    const startTime = Date.now()
    try {
      let style = getDefaultPresetStyle().config
      let templateLayouts: TemplateSlideLayout[] | undefined
      let slideSize: PptSlideSize | undefined
      let styleSource: PptExportConfig['styleSource'] = {
        type: 'preset',
        presetId: getDefaultPresetStyle().id
      }
      let expectedSlideCount: number | undefined

      if (templateId) {
        const extraction = await this.loadTemplateExtraction(templateId)
        if (extraction?.style) {
          style = extraction.style
          styleSource = { type: 'template', templateId }
        }
        templateLayouts = extraction?.layouts
        slideSize = extraction?.slideSize
        expectedSlideCount = extraction?.layouts?.length
      }

      // 解析内容为幻灯片
      const slides = this.parseContentToSlides(content, expectedSlideCount)

      // 检查幻灯片数量
      const slideCountWarning = this.getSlideCountWarning(slides.length)
      if (slides.length > MAX_ALLOWED_SLIDES) {
        return {
          success: false,
          error: slideCountWarning || '幻灯片数量超过限制'
        }
      }

      // 记录性能警告
      if (slideCountWarning) {
        logger.warn('PPT 导出预览：页面数量较多', 'main', {
          slideCount: slides.length,
          warning: slideCountWarning
        })
      }

      // 生成幻灯片预览列表
      const slidePreviews = this.parser.generatePreview(slides)

      // 获取可用模板列表
      const availableTemplates = await this.getAvailableTemplates()

      const config: PptExportConfig = {
        slides: slidePreviews,
        styleSource,
        style,
        templateLayouts,
        slideSize
      }

      const elapsed = Date.now() - startTime
      if (elapsed > PERFORMANCE_WARNING_THRESHOLD) {
        logger.warn('PPT 导出预览耗时较长', 'main', { elapsed, slideCount: slides.length })
      } else {
        logger.debug('PPT 导出预览完成', 'main', { elapsed, slideCount: slides.length })
      }

      return {
        success: true,
        config,
        availableTemplates,
        warning: slideCountWarning || undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 导出预览失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 生成 PPT
   * 根据配置生成最终的 PPTX 文件
   * @param request - 生成 PPT 请求
   * @returns 生成结果
   */
  async generatePpt(request: GeneratePptRequest): Promise<GeneratePptResult> {
    const startTime = Date.now()
    let slides: ParsedSlide[] = []

    try {
      const templateBundle = this.loadTemplateRenderBundle(request.config.styleSource)
      const expectedSlideCount =
        request.config.styleSource.type === 'template'
          ? templateBundle?.analysis.slides.length || request.config.slides.length
          : undefined

      // 解析内容
      slides = this.parseContentToSlides(request.content, expectedSlideCount)

      // 过滤选中的幻灯片
      const selectedIndices = request.config.slides
        .filter((s) => s.selected)
        .map((s) => s.index)
      const selectedSlides = slides.filter((_, index) => selectedIndices.includes(index))

      if (selectedSlides.length === 0) {
        return {
          success: false,
          error: '未选择任何导出页面'
        }
      }

      // 检查幻灯片数量
      if (selectedSlides.length > MAX_ALLOWED_SLIDES) {
        return {
          success: false,
          error: `幻灯片数量 (${selectedSlides.length}) 超过最大限制 (${MAX_ALLOWED_SLIDES})`
        }
      }

      // 记录大文件警告
      if (selectedSlides.length > MAX_RECOMMENDED_SLIDES) {
        logger.warn('PPT 生成：页面数量较多，可能需要较长时间', 'main', {
          slideCount: selectedSlides.length,
          recommended: MAX_RECOMMENDED_SLIDES
        })
      }

      // 创建生成器
      const generator = new PptGenerator()

      // 应用样式配置
      generator.applyStyleConfig(request.config.style)
      if (request.config.slideSize) {
        generator.setSlideSize(request.config.slideSize.width, request.config.slideSize.height)
      }

      // 生成幻灯片（使用 for 循环而非 forEach 以便更好的性能控制）
      for (let i = 0; i < selectedSlides.length; i++) {
        const slide = selectedSlides[i]
        const templateSlide = this.resolveTemplateSlide(templateBundle, slide, i)
        const slideStyle = this.buildSlideStyle(request.config, templateSlide)
        const shouldKeepSinglePage =
          slide.strictPageCount === true || request.config.styleSource.type === 'template'

        // 仅无正文的封面页/分隔页使用标题幻灯片，避免第一页正文被错误丢弃
        const isTitleSlide =
          slide.type === 'title' || slide.type === 'section' || Boolean(slide.layoutHint)

        if (isTitleSlide) {
          // 标题页
          generator.createTitleSlide(slide.title, slide.subtitle, slideStyle, {
            singlePage: shouldKeepSinglePage,
            layoutHint: slide.layoutHint,
            blocks: slide.blocks,
            templateSlide,
            mediaData: templateBundle?.mediaData
          })
        } else if (this.isTableOnlySlide(slide)) {
          const tableBlock = slide.blocks[0]
          generator.createTableSlide(
            slide.title,
            {
              headers: tableBlock.headers,
              rows: tableBlock.rows
            },
            slideStyle,
            {
              singlePage: shouldKeepSinglePage,
              subtitle: slide.subtitle,
              templateSlide,
              mediaData: templateBundle?.mediaData
            }
          )
        } else {
          // 内容页
          generator.createContentSlide(slide.title, slide.blocks, slideStyle, {
            singlePage: shouldKeepSinglePage,
            subtitle: slide.subtitle,
            templateSlide,
            mediaData: templateBundle?.mediaData
          })
        }

        // 每 10 张幻灯片记录一次进度（用于大文件）
        if ((i + 1) % 10 === 0) {
          logger.debug('PPT 生成进度', 'main', {
            current: i + 1,
            total: selectedSlides.length
          })
        }
      }

      // 保存文件
      const buffer = await generator.save()
      const fileName = this.buildFileName(request.title)
      const generatedSlideCount = generator.getSlideCount()

      const elapsed = Date.now() - startTime
      const avgTimePerSlide = elapsed / Math.max(generatedSlideCount, 1)

      logger.info('PPT 生成成功', 'main', {
        fileName,
        slideCount: generatedSlideCount,
        parsedSlideCount: selectedSlides.length,
        size: buffer.length,
        elapsed: `${elapsed}ms`,
        avgTimePerSlide: `${avgTimePerSlide.toFixed(2)}ms/slide`
      })

      // 性能警告
      if (elapsed > PERFORMANCE_WARNING_THRESHOLD) {
        logger.warn('PPT 生成耗时较长', 'main', {
          elapsed,
          slideCount: generatedSlideCount,
          recommendation: '建议减少页面数量以提升性能'
        })
      }

      return {
        success: true,
        data: Array.from(buffer),
        fileName
      }
    } catch (error) {
      const elapsed = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 生成失败', 'main', {
        error: errorMessage,
        elapsed,
        slideCount: slides.length
      })

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 获取可用的预设样式列表
   * @returns 预设样式数组
   */
  getStylePresets(): PptStylePreset[] {
    return PPT_STYLE_PRESETS
  }

  /**
   * 从模板分析结果中提取样式
   * @param templateId - 模板 ID
   * @returns 提取的样式配置或 null
   */
  async loadTemplateStyle(templateId: string): Promise<PptStyleConfig | null> {
    const extraction = await this.loadTemplateExtraction(templateId)
    return extraction?.style ?? null
  }

  /**
   * 从模板分析结果中提取完整样式信息
   * @param templateId - 模板 ID
   * @returns 提取结果或 null
   */
  async loadTemplateExtraction(templateId: string): Promise<TemplateStyleExtraction | null> {
    try {
      const templateService = getPptTemplateService()
      const analysis = await templateService.getTemplateAnalysis(templateId)

      if (!analysis) {
        logger.warn('未找到模板分析结果', 'main', { templateId })
        return null
      }

      return this.styleExtractor.extract(analysis)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('加载模板完整样式失败', 'main', { templateId, error: errorMessage })
      return null
    }
  }

  /**
   * 解析 Markdown 内容为幻灯片结构
   * @param content - Markdown 内容
   * @param expectedSlideCount - 期望页数（通常来自模板）
   * @returns 解析后的幻灯片数组
   */
  private parseContentToSlides(content: string, expectedSlideCount?: number): ParsedSlide[] {
    return this.parser.parse(content, { expectedSlideCount })
  }

  /**
   * 加载模板渲染上下文
   * @param styleSource - 样式来源
   * @returns 渲染上下文
   */
  private loadTemplateRenderBundle(
    styleSource: PptExportConfig['styleSource']
  ): TemplateRenderBundle | null {
    if (styleSource.type !== 'template') {
      return null
    }

    const templateId = styleSource.templateId
    const templateService = getPptTemplateService()
    const analysis = templateService.getTemplateAnalysis(templateId)

    if (!analysis) {
      logger.warn('模板渲染上下文缺失分析结果', 'main', { templateId })
      return null
    }

    try {
      const sourceBuffer = readFileSync(getTemplateSourcePath(templateId))
      const archive = unzipSync(new Uint8Array(sourceBuffer))
      const mediaData = new Map<string, string>()

      for (const [path, data] of Object.entries(archive)) {
        if (!path.startsWith('ppt/media/')) {
          continue
        }

        const mimeType = this.resolveMediaMimeType(path)
        const base64 = Buffer.from(data).toString('base64')
        mediaData.set(path, `data:${mimeType};base64,${base64}`)
      }

      return { analysis, mediaData }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('加载模板媒体资源失败，将退回到纯样式模式', 'main', {
        templateId,
        error: errorMessage
      })
      return { analysis, mediaData: new Map() }
    }
  }

  /**
   * 解析媒体 MIME 类型
   * @param filePath - 文件路径
   * @returns MIME 类型
   */
  private resolveMediaMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()

    switch (ext) {
      case '.png':
        return 'image/png'
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      case '.webp':
        return 'image/webp'
      case '.svg':
        return 'image/svg+xml'
      case '.tif':
      case '.tiff':
        return 'image/tiff'
      default:
        return 'application/octet-stream'
    }
  }

  /**
   * 构建当前页面的最终样式
   * 模板模式下统一使用与修复版一致的稳定版式，不再依赖不可靠的占位符推断
   * @param config - 导出配置
   * @param slide - 当前页面
   * @param templateSlide - 模板页
   * @returns 最终样式
   */
  private buildSlideStyle(
    config: PptExportConfig,
    templateSlide?: PptTemplateSlideAnalysis
  ): SlideStyle | undefined {
    if (config.styleSource.type === 'template' && templateSlide) {
      return {
        backgroundColor: templateSlide.background?.color || config.style.backgroundColor
      }
    }

    return {
      backgroundColor: config.style.backgroundColor
    }
  }

  /**
   * 解析当前页面应复用的模板页
   * @param bundle - 模板渲染上下文
   * @param slide - 原始页面
   * @param generatedIndex - 当前生成顺序
   * @returns 模板页分析结果
   */
  private resolveTemplateSlide(
    bundle: TemplateRenderBundle | null,
    slide: ParsedSlide,
    generatedIndex: number
  ): PptTemplateSlideAnalysis | undefined {
    if (!bundle || bundle.analysis.slides.length === 0) {
      return undefined
    }

    if (slide.index >= 0 && slide.index < bundle.analysis.slides.length) {
      return bundle.analysis.slides[slide.index]
    }

    return bundle.analysis.slides[generatedIndex % bundle.analysis.slides.length]
  }

  /**
   * 判断是否为仅包含表格的幻灯片
   * @param slide - 幻灯片数据
   * @returns 是否仅包含单个表格块
   */
  private isTableOnlySlide(slide: ParsedSlide): slide is ParsedSlide & {
    blocks: [{ type: 'table'; headers: string[]; rows: string[][] }]
  } {
    return slide.blocks.length === 1 && slide.blocks[0].type === 'table'
  }

  /**
   * 获取可用模板列表
   * @returns 模板列表
   */
  private async getAvailableTemplates() {
    try {
      const templateService = getPptTemplateService()
      return templateService.getAvailableTemplates()
    } catch {
      return []
    }
  }

  /**
   * 构建文件名
   * @param title - 文件标题
   * @returns 文件名
   */
  private buildFileName(title?: string): string {
    const baseTitle = title ? this.sanitizeFileName(title) : 'presentation'
    const timestamp = this.formatTimestamp()
    return `${baseTitle}_${timestamp}.pptx`
  }

  /**
   * 清洗文件名
   * @param name - 原始名称
   * @returns 清洗后的名称
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48)
  }

  /**
   * 格式化时间戳
   * @returns 格式化的时间戳
   */
  private formatTimestamp(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${year}${month}${day}_${hours}${minutes}${seconds}`
  }
}

// ==================== 单例实例 ====================

let pptExportServiceInstance: PptExportService | null = null

/**
 * 获取 PPT 导出服务单例
 */
export function getPptExportService(): PptExportService {
  if (!pptExportServiceInstance) {
    pptExportServiceInstance = new PptExportService()
  }
  return pptExportServiceInstance
}
