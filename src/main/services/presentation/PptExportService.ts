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
import {
  DEFAULT_TEMPLATE_SLIDE_SIZE,
  TEMPLATE_LAYOUT_PRESETS,
  scaleTemplateLayoutPosition
} from './PptTemplateLayoutPresets'
import { PptContentParser } from './PptContentParser'
import { PptGenerator } from './PptGenerator'
import { PptTemplateStyleExtractor } from './PptTemplateStyleExtractor'
import type {
  PreviewPptExportResult,
  GeneratePptRequest,
  GeneratePptResult,
  PptExportConfig,
  PptSlideSize,
  PptStyleConfig,
  SlideContentBlock,
  SlideStyle,
  TemplateSlideLayout,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'
import type { ParsedSlide } from '@shared/types/ppt-export'
import type {
  PptTemplateAnalysis,
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'

/** 最大推荐的幻灯片数量 */
const MAX_RECOMMENDED_SLIDES = 50

/** 最大允许的幻灯片数量 */
const MAX_ALLOWED_SLIDES = 100

/** 性能监控阈值（毫秒） */
const PERFORMANCE_WARNING_THRESHOLD = 3000

/** 默认样式配置 */
const DEFAULT_STYLE: Required<PptStyleConfig> = {
  primaryColor: '1E3A5F',
  backgroundColor: 'FFFFFF',
  titleFont: 'Microsoft YaHei',
  bodyFont: 'Microsoft YaHei',
  titleSize: 36,
  bodySize: 18
}

/** SVG 预览每英寸像素数 */
const PREVIEW_PIXELS_PER_INCH = 96

/** SVG 预览兜底尺寸 */
const DEFAULT_PREVIEW_SLIDE_SIZE_PX = {
  width: 1280,
  height: 720
}

/** Office 主题色兜底映射 */
const OFFICE_THEME_COLORS: Record<string, string> = {
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
  tx1: '#000000',
  tx2: '#44546a',
  dk1: '#000000',
  dk2: '#44546a',
  lt1: '#ffffff',
  lt2: '#e7e6e6'
}

interface PreviewCanvasSize {
  width: number
  height: number
}

interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
}

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
      // 获取可用模板列表
      const availableTemplates = await this.getAvailableTemplates()

      // 确定要使用的模板 ID
      const effectiveTemplateId = templateId || availableTemplates[0]?.id

      let style: PptStyleConfig = { ...DEFAULT_STYLE }
      let templateLayouts: TemplateSlideLayout[] | undefined
      let slideSize: PptSlideSize | undefined
      let styleSource: PptExportConfig['styleSource'] | undefined
      let expectedSlideCount: number | undefined
      let templateBundle: TemplateRenderBundle | null = null

      if (effectiveTemplateId) {
        const extraction = await this.loadTemplateExtraction(effectiveTemplateId)
        if (extraction?.style) {
          style = extraction.style
          styleSource = { type: 'template', templateId: effectiveTemplateId }
        }
        templateLayouts = extraction?.layouts
        slideSize = extraction?.slideSize
        expectedSlideCount = extraction?.layouts?.length
        if (styleSource) {
          templateBundle = this.loadTemplateRenderBundle(styleSource)
        }
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
      this.attachSlidePreviewImages(
        slidePreviews,
        slides,
        {
          slides: slidePreviews,
          styleSource: styleSource!,
          style,
          templateLayouts,
          slideSize
        },
        templateBundle
      )

      const config: PptExportConfig = {
        slides: slidePreviews,
        styleSource: styleSource!,
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
   * 为页面预览补充 SVG 缩略图
   * @param previews - 预览数据
   * @param slides - 原始页面
   * @param config - 当前导出配置
   * @param templateBundle - 模板渲染上下文
   */
  private attachSlidePreviewImages(
    previews: Array<{ index: number; previewImageDataUrl?: string }>,
    slides: ParsedSlide[],
    config: PptExportConfig,
    templateBundle: TemplateRenderBundle | null
  ): void {
    previews.forEach((preview, orderIndex) => {
      const slide = slides[orderIndex]
      if (!slide) {
        return
      }

      try {
        preview.previewImageDataUrl = this.buildSlidePreviewImage(
          slide,
          config,
          templateBundle,
          orderIndex
        )
      } catch (error) {
        logger.warn('生成 PPT 页面预览图失败，将退回文字摘要模式', 'main', {
          slideIndex: slide.index,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  }

  /**
   * 构建单页 SVG 预览图
   * @param slide - 页面内容
   * @param config - 当前导出配置
   * @param templateBundle - 模板资源
   * @param orderIndex - 当前顺序
   * @returns SVG data URL
   */
  private buildSlidePreviewImage(
    slide: ParsedSlide,
    config: PptExportConfig,
    templateBundle: TemplateRenderBundle | null,
    orderIndex: number
  ): string {
    const slideSize = config.slideSize || DEFAULT_TEMPLATE_SLIDE_SIZE
    const canvas = this.getPreviewCanvasSize(slideSize)
    const templateSlide = this.resolveTemplateSlide(templateBundle, slide, orderIndex)
    const slideStyle = this.buildSlideStyle(config, templateSlide)
    const zones = this.resolvePreviewZones(slide, slideSize)
    const backgroundColor = this.resolvePreviewColor(
      templateSlide?.background?.color || slideStyle?.backgroundColor || config.style.backgroundColor,
      '#ffffff',
      config.style
    )
    const backgroundImagePath = templateSlide?.background?.imagePath
    const backgroundImageData = backgroundImagePath
      ? templateBundle?.mediaData.get(backgroundImagePath)
      : undefined
    const decorations = templateSlide
      ? this.renderTemplatePreviewDecorations(
          templateSlide,
          config.style,
          zones.title,
          zones.content,
          canvas,
          templateBundle?.mediaData
        )
      : ''
    const contentMarkup = this.renderSlidePreviewContent(slide, config.style, zones, canvas)
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
      `<rect width="100%" height="100%" fill="${backgroundColor}" />`,
      backgroundImageData
        ? `<image href="${backgroundImageData}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" preserveAspectRatio="none" />`
        : '',
      decorations,
      contentMarkup,
      '</svg>'
    ]
      .filter(Boolean)
      .join('')

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }

  /**
   * 获取 SVG 画布尺寸
   * @param slideSize - 幻灯片尺寸
   * @returns 像素尺寸
   */
  private getPreviewCanvasSize(slideSize: PptSlideSize): PreviewCanvasSize {
    const width = Math.round(slideSize.width * PREVIEW_PIXELS_PER_INCH)
    const height = Math.round(slideSize.height * PREVIEW_PIXELS_PER_INCH)

    return {
      width: width > 0 ? width : DEFAULT_PREVIEW_SLIDE_SIZE_PX.width,
      height: height > 0 ? height : DEFAULT_PREVIEW_SLIDE_SIZE_PX.height
    }
  }

  /**
   * 解析当前页的标题区和内容区
   * @param slide - 页面内容
   * @param slideSize - 页面尺寸
   * @returns 预览区域
   */
  private resolvePreviewZones(
    slide: ParsedSlide,
    slideSize: PptSlideSize
  ): { title: PreviewRect; subtitle?: PreviewRect; content?: PreviewRect } {
    if (slide.layoutHint === 'cover') {
      return {
        title: this.toPreviewRect(
          scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.cover.title),
          slideSize
        ),
        subtitle: this.toPreviewRect(
          scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.cover.subtitle),
          slideSize
        ),
        content: this.toPreviewRect(
          scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.cover.body),
          slideSize
        )
      }
    }

    if (slide.layoutHint === 'ending') {
      return {
        title: this.toPreviewRect(
          scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.ending.title),
          slideSize
        ),
        subtitle: this.toPreviewRect(
          scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.ending.subtitle),
          slideSize
        )
      }
    }

    return {
      title: this.toPreviewRect(
        scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.content.title),
        slideSize
      ),
      content: this.toPreviewRect(
        scaleTemplateLayoutPosition(slideSize, TEMPLATE_LAYOUT_PRESETS.content.body),
        slideSize
      )
    }
  }

  /**
   * 将英寸坐标转换为像素坐标
   * @param position - 英寸坐标
   * @param slideSize - 页面尺寸
   * @returns 像素坐标
   */
  private toPreviewRect(
    position: { x: number; y: number; w: number; h: number },
    slideSize: PptSlideSize
  ): PreviewRect {
    const canvas = this.getPreviewCanvasSize(slideSize)

    return {
      x: Math.round((position.x / slideSize.width) * canvas.width),
      y: Math.round((position.y / slideSize.height) * canvas.height),
      w: Math.round((position.w / slideSize.width) * canvas.width),
      h: Math.round((position.h / slideSize.height) * canvas.height)
    }
  }

  /**
   * 渲染模板静态装饰
   * @param templateSlide - 模板页
   * @param style - 当前样式
   * @param titleZone - 标题区域
   * @param contentZone - 内容区域
   * @param canvas - 画布尺寸
   * @param mediaData - 模板图片资源
   * @returns SVG 片段
   */
  private renderTemplatePreviewDecorations(
    templateSlide: PptTemplateSlideAnalysis,
    style: PptStyleConfig,
    titleZone: PreviewRect,
    contentZone: PreviewRect | undefined,
    canvas: PreviewCanvasSize,
    mediaData?: Map<string, string>
  ): string {
    const elements = [...templateSlide.elements].sort((left, right) => left.zIndex - right.zIndex)

    return elements
      .filter((element) => this.shouldRenderPreviewTemplateElement(element, titleZone, contentZone))
      .map((element) => {
        switch (element.kind) {
          case 'shape':
            return this.renderPreviewTemplateShape(element, style, canvas)
          case 'image':
            return this.renderPreviewTemplateImage(element, canvas, mediaData)
          default:
            return ''
        }
      })
      .join('')
  }

  /**
   * 判断模板元素是否应进入预览
   * @param element - 模板元素
   * @param titleZone - 标题区
   * @param contentZone - 内容区
   * @returns 是否保留
   */
  private shouldRenderPreviewTemplateElement(
    element: PptTemplateElementAnalysis,
    titleZone: PreviewRect,
    contentZone?: PreviewRect
  ): boolean {
    if (element.kind === 'placeholder' || element.kind === 'table' || element.kind === 'chart') {
      return false
    }

    if (!['shape', 'image'].includes(element.kind)) {
      return false
    }

    return !this.isPreviewElementOverlappingContentZone(element, titleZone, contentZone)
  }

  /**
   * 判断模板元素是否与动态内容区重叠
   * @param element - 模板元素
   * @param titleZone - 标题区
   * @param contentZone - 内容区
   * @returns 是否重叠
   */
  private isPreviewElementOverlappingContentZone(
    element: PptTemplateElementAnalysis,
    titleZone: PreviewRect,
    contentZone?: PreviewRect
  ): boolean {
    const elementRect = this.toElementPreviewRect(element)
    const zones = contentZone ? [titleZone, contentZone] : [titleZone]

    return zones.some((zone) => {
      const overlapX = Math.max(
        0,
        Math.min(elementRect.x + elementRect.w, zone.x + zone.w) -
          Math.max(elementRect.x, zone.x)
      )
      const overlapY = Math.max(
        0,
        Math.min(elementRect.y + elementRect.h, zone.y + zone.h) -
          Math.max(elementRect.y, zone.y)
      )
      const overlapArea = overlapX * overlapY
      const elementArea = elementRect.w * elementRect.h

      return elementArea > 0 && overlapArea / elementArea > 0.2
    })
  }

  /**
   * 将模板元素位置转换为像素坐标
   * @param element - 模板元素
   * @returns 画布坐标
   */
  private toElementPreviewRect(element: PptTemplateElementAnalysis): PreviewRect {
    return {
      x: Math.round((element.x / 914400) * PREVIEW_PIXELS_PER_INCH),
      y: Math.round((element.y / 914400) * PREVIEW_PIXELS_PER_INCH),
      w: Math.round((element.cx / 914400) * PREVIEW_PIXELS_PER_INCH),
      h: Math.round((element.cy / 914400) * PREVIEW_PIXELS_PER_INCH)
    }
  }

  /**
   * 渲染模板形状
   * @param element - 模板元素
   * @param style - 当前样式
   * @param canvas - 画布尺寸
   * @returns SVG 片段
   */
  private renderPreviewTemplateShape(
    element: PptTemplateElementAnalysis,
    style: PptStyleConfig,
    canvas: PreviewCanvasSize
  ): string {
    const rect = this.fitRectToCanvas(this.toElementPreviewRect(element), canvas)
    const fill = element.shape?.fillColor
      ? this.resolvePreviewColor(element.shape.fillColor, '#ffffff', style)
      : 'transparent'
    const stroke = element.shape?.strokeColor
      ? this.resolvePreviewColor(element.shape.strokeColor, 'transparent', style)
      : 'transparent'
    const strokeWidth = element.shape?.strokeWidth
      ? Math.max(1, Math.round(element.shape.strokeWidth / 12700 / 2))
      : 0
    const radius =
      element.shape?.preset === 'roundRect'
        ? Math.max(8, Math.round(Math.min(rect.w, rect.h) * 0.12))
        : 0

    if (element.shape?.preset === 'ellipse') {
      return `<ellipse cx="${rect.x + rect.w / 2}" cy="${rect.y + rect.h / 2}" rx="${rect.w / 2}" ry="${rect.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    }

    if (element.shape?.preset === 'line') {
      return `<line x1="${rect.x}" y1="${rect.y}" x2="${rect.x + rect.w}" y2="${rect.y + rect.h}" stroke="${stroke}" stroke-width="${Math.max(strokeWidth, 2)}" />`
    }

    return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  }

  /**
   * 渲染模板图片
   * @param element - 模板元素
   * @param canvas - 画布尺寸
   * @param mediaData - 模板图片资源
   * @returns SVG 片段
   */
  private renderPreviewTemplateImage(
    element: PptTemplateElementAnalysis,
    canvas: PreviewCanvasSize,
    mediaData?: Map<string, string>
  ): string {
    const imagePath = element.image?.relationshipTarget
    const imageData = imagePath ? mediaData?.get(imagePath) : undefined
    if (!imageData) {
      return ''
    }

    const rect = this.fitRectToCanvas(this.toElementPreviewRect(element), canvas)
    return `<image href="${imageData}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" preserveAspectRatio="none" />`
  }

  /**
   * 渲染页面动态内容
   * @param slide - 页面内容
   * @param style - 当前样式
   * @param zones - 页面区域
   * @param canvas - 画布尺寸
   * @returns SVG 片段
   */
  private renderSlidePreviewContent(
    slide: ParsedSlide,
    style: PptStyleConfig,
    zones: { title: PreviewRect; subtitle?: PreviewRect; content?: PreviewRect },
    canvas: PreviewCanvasSize
  ): string {
    const titleFontSize =
      slide.layoutHint === 'cover'
        ? Math.round((style.titleSize || DEFAULT_STYLE.titleSize) * 1.24)
        : slide.layoutHint === 'ending'
          ? Math.round((style.titleSize || DEFAULT_STYLE.titleSize) * 1.16)
          : style.titleSize || DEFAULT_STYLE.titleSize
    const titleMarkup = this.renderPreviewTextBlock(
      slide.title,
      zones.title,
      {
        fontSize: titleFontSize,
        fontFamily: style.titleFont || DEFAULT_STYLE.titleFont,
        fill: this.resolvePreviewColor(style.primaryColor, '#1e3a5f', style),
        fontWeight: 700,
        centered: slide.layoutHint === 'cover' || slide.layoutHint === 'ending',
        maxLines: slide.layoutHint ? 2 : 3
      },
      canvas
    )
    const subtitleSource = slide.subtitle || (slide.layoutHint === 'ending' ? '感谢聆听' : '')
    const subtitleMarkup =
      zones.subtitle && subtitleSource
        ? this.renderPreviewTextBlock(
            subtitleSource,
            zones.subtitle,
            {
              fontSize:
                slide.layoutHint === 'cover'
                  ? Math.max((style.bodySize || DEFAULT_STYLE.bodySize) + 3, 18)
                  : Math.max((style.bodySize || DEFAULT_STYLE.bodySize) + 1, 16),
              fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
              fill: '#64748b',
              centered: true,
              maxLines: 2
            },
            canvas
          )
        : ''
    const bodyMarkup = zones.content
      ? this.renderPreviewBodyBlocks(slide.blocks, zones.content, style, canvas)
      : ''

    return [titleMarkup, subtitleMarkup, bodyMarkup].filter(Boolean).join('')
  }

  /**
   * 渲染正文内容块
   * @param blocks - 内容块
   * @param contentZone - 内容区
   * @param style - 当前样式
   * @param canvas - 画布尺寸
   * @returns SVG 片段
   */
  private renderPreviewBodyBlocks(
    blocks: SlideContentBlock[],
    contentZone: PreviewRect,
    style: PptStyleConfig,
    canvas: PreviewCanvasSize
  ): string {
    const bodyFontSize = style.bodySize || DEFAULT_STYLE.bodySize
    const gap = Math.max(12, Math.round(bodyFontSize * 0.9))
    let currentY = contentZone.y
    const maxY = contentZone.y + contentZone.h
    const fragments: string[] = []

    for (const block of blocks) {
      if (currentY >= maxY - 12) {
        break
      }

      if (block.type === 'paragraph') {
        const rect = {
          x: contentZone.x,
          y: currentY,
          w: contentZone.w,
          h: maxY - currentY
        }
        const lineCount = Math.max(1, Math.floor(rect.h / Math.max(bodyFontSize * 1.35, 22)))
        fragments.push(
          this.renderPreviewTextBlock(
            block.text,
            rect,
            {
              fontSize: bodyFontSize,
              fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
              fill: '#334155',
              maxLines: Math.min(lineCount, 6)
            },
            canvas
          )
        )
        currentY += Math.min(rect.h, lineCount * Math.round(bodyFontSize * 1.48)) + gap
        continue
      }

      if (block.type === 'list') {
        const listText = block.items
          .slice(0, 5)
          .map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${item}`)
          .join('\n')
        const rect = {
          x: contentZone.x,
          y: currentY,
          w: contentZone.w,
          h: maxY - currentY
        }
        const lineCount = Math.max(1, Math.floor(rect.h / Math.max(bodyFontSize * 1.45, 24)))
        fragments.push(
          this.renderPreviewTextBlock(
            listText,
            rect,
            {
              fontSize: bodyFontSize,
              fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
              fill: '#334155',
              maxLines: Math.min(lineCount, 6)
            },
            canvas
          )
        )
        currentY += Math.min(rect.h, lineCount * Math.round(bodyFontSize * 1.52)) + gap
        continue
      }

      if (block.type === 'table') {
        const tableHeight = Math.min(maxY - currentY, Math.max(120, contentZone.h * 0.45))
        if (tableHeight <= 40) {
          break
        }

        fragments.push(
          this.renderPreviewTableBlock(
            block.headers,
            block.rows,
            {
              x: contentZone.x,
              y: currentY,
              w: contentZone.w,
              h: tableHeight
            },
            style,
            canvas
          )
        )
        currentY += tableHeight + gap
        continue
      }

      if (block.type === 'image') {
        const imageHeight = Math.min(maxY - currentY, Math.max(120, contentZone.h * 0.36))
        if (imageHeight <= 40) {
          break
        }

        fragments.push(
          this.renderPreviewImagePlaceholder(block.alt || '图片', {
            x: contentZone.x,
            y: currentY,
            w: contentZone.w,
            h: imageHeight
          })
        )
        currentY += imageHeight + gap
      }
    }

    return fragments.join('')
  }

  /**
   * 渲染文本块
   * @param text - 文本
   * @param rect - 位置
   * @param options - 样式
   * @param canvas - 画布
   * @returns SVG 片段
   */
  private renderPreviewTextBlock(
    text: string,
    rect: PreviewRect,
    options: {
      fontSize: number
      fontFamily: string
      fill: string
      fontWeight?: number
      centered?: boolean
      maxLines?: number
    },
    canvas: PreviewCanvasSize
  ): string {
    const safeText = text.trim()
    if (!safeText) {
      return ''
    }

    const clippedRect = this.fitRectToCanvas(rect, canvas)
    const lineHeight = Math.max(options.fontSize * 1.36, 20)
    const maxChars = Math.max(6, Math.floor(clippedRect.w / Math.max(options.fontSize * 0.62, 8)))
    const lines = this.wrapPreviewText(safeText, maxChars, options.maxLines || 4)
    if (lines.length === 0) {
      return ''
    }

    const totalHeight = lines.length * lineHeight
    const startY = options.centered
      ? clippedRect.y + Math.max(options.fontSize, (clippedRect.h - totalHeight) / 2 + options.fontSize)
      : clippedRect.y + options.fontSize + 2
    const x = options.centered ? clippedRect.x + clippedRect.w / 2 : clippedRect.x + 8
    const anchor = options.centered ? 'middle' : 'start'
    const tspans = lines
      .map((line, index) => {
        const dy = index === 0 ? 0 : lineHeight
        return `<tspan x="${x}" dy="${dy}">${this.escapeXml(line)}</tspan>`
      })
      .join('')

    return `<text x="${x}" y="${startY}" fill="${options.fill}" font-size="${options.fontSize}" font-weight="${options.fontWeight || 500}" text-anchor="${anchor}" font-family="${this.escapeXml(options.fontFamily)}">${tspans}</text>`
  }

  /**
   * 渲染表格块
   * @param headers - 表头
   * @param rows - 数据行
   * @param rect - 区域
   * @param style - 当前样式
   * @param canvas - 画布
   * @returns SVG 片段
   */
  private renderPreviewTableBlock(
    headers: string[],
    rows: string[][],
    rect: PreviewRect,
    style: PptStyleConfig,
    canvas: PreviewCanvasSize
  ): string {
    const clippedRect = this.fitRectToCanvas(rect, canvas)
    const columnCount = Math.max(1, Math.min(headers.length, 4))
    const rowCount = Math.max(1, Math.min(rows.length + 1, 5))
    const colWidth = clippedRect.w / columnCount
    const rowHeight = clippedRect.h / rowCount
    const primary = this.resolvePreviewColor(style.primaryColor, '#1e3a5f', style)
    const fragments = [
      `<rect x="${clippedRect.x}" y="${clippedRect.y}" width="${clippedRect.w}" height="${clippedRect.h}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" rx="8" ry="8" />`
    ]

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const cellX = clippedRect.x + columnIndex * colWidth
      fragments.push(
        `<rect x="${cellX}" y="${clippedRect.y}" width="${colWidth}" height="${rowHeight}" fill="${primary}" />`
      )
      fragments.push(
        this.renderPreviewTextBlock(
          headers[columnIndex] || '',
          {
            x: cellX + 8,
            y: clippedRect.y + 6,
            w: colWidth - 16,
            h: rowHeight - 12
          },
          {
            fontSize: Math.max((style.bodySize || DEFAULT_STYLE.bodySize) - 2, 12),
            fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
            fill: '#ffffff',
            fontWeight: 700,
            centered: true,
            maxLines: 2
          },
          canvas
        )
      )
    }

    for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex++) {
      const sourceRow = rows[rowIndex] || []
      const cellY = clippedRect.y + rowHeight * (rowIndex + 1)
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        const cellX = clippedRect.x + columnIndex * colWidth
        const fill = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff'
        fragments.push(
          `<rect x="${cellX}" y="${cellY}" width="${colWidth}" height="${rowHeight}" fill="${fill}" stroke="#e2e8f0" stroke-width="1" />`
        )
        fragments.push(
          this.renderPreviewTextBlock(
            sourceRow[columnIndex] || '',
            {
              x: cellX + 6,
              y: cellY + 4,
              w: colWidth - 12,
              h: rowHeight - 8
            },
            {
              fontSize: Math.max((style.bodySize || DEFAULT_STYLE.bodySize) - 3, 11),
              fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
              fill: '#334155',
              maxLines: 2
            },
            canvas
          )
        )
      }
    }

    return fragments.join('')
  }

  /**
   * 渲染图片占位预览
   * @param label - 标签
   * @param rect - 区域
   * @returns SVG 片段
   */
  private renderPreviewImagePlaceholder(label: string, rect: PreviewRect): string {
    return [
      `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="14" ry="14" fill="#e2e8f0" />`,
      `<text x="${rect.x + rect.w / 2}" y="${rect.y + rect.h / 2}" fill="#64748b" font-size="18" font-weight="600" text-anchor="middle" dominant-baseline="middle">${this.escapeXml(label)}</text>`
    ].join('')
  }

  /**
   * 将矩形限制在画布内
   * @param rect - 矩形
   * @param canvas - 画布
   * @returns 裁剪后的矩形
   */
  private fitRectToCanvas(rect: PreviewRect, canvas: PreviewCanvasSize): PreviewRect {
    const x = Math.max(0, rect.x)
    const y = Math.max(0, rect.y)

    return {
      x,
      y,
      w: Math.max(0, Math.min(rect.w, canvas.width - x)),
      h: Math.max(0, Math.min(rect.h, canvas.height - y))
    }
  }

  /**
   * 解析预览颜色
   * @param color - 原始颜色
   * @param fallback - 兜底颜色
   * @param style - 当前样式
   * @returns CSS 颜色
   */
  private resolvePreviewColor(
    color?: string,
    fallback: string = '#ffffff',
    style?: PptStyleConfig
  ): string {
    if (!color) {
      return fallback
    }

    const normalized = color.trim().replace(/^#/, '').toLowerCase()
    if (/^[0-9a-f]{6}$/i.test(normalized)) {
      return `#${normalized}`
    }

    if (normalized === 'accent1' && style?.primaryColor) {
      return this.resolvePreviewColor(style.primaryColor, fallback)
    }

    if (normalized === 'bg1' && style?.backgroundColor) {
      return this.resolvePreviewColor(style.backgroundColor, fallback)
    }

    if (normalized === 'tx1') {
      return '#333333'
    }

    return OFFICE_THEME_COLORS[normalized] ?? fallback
  }

  /**
   * 文本换行
   * @param text - 文本
   * @param maxChars - 每行最大字符数
   * @param maxLines - 最大行数
   * @returns 文本行
   */
  private wrapPreviewText(text: string, maxChars: number, maxLines: number): string[] {
    const tokens = text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const lines: string[] = []

    for (const token of tokens) {
      let current = ''
      for (const char of token) {
        if ((current + char).length > maxChars && current) {
          lines.push(current)
          current = char
          if (lines.length >= maxLines) {
            return this.ellipsizePreviewLines(lines, maxLines)
          }
        } else {
          current += char
        }
      }

      if (current) {
        lines.push(current)
        if (lines.length >= maxLines) {
          return this.ellipsizePreviewLines(lines, maxLines)
        }
      }
    }

    return lines
  }

  /**
   * 为最后一行追加省略号
   * @param lines - 文本行
   * @param maxLines - 最大行数
   * @returns 处理后的文本行
   */
  private ellipsizePreviewLines(lines: string[], maxLines: number): string[] {
    if (lines.length < maxLines) {
      return lines
    }

    const truncated = lines.slice(0, maxLines)
    const lastLine = truncated[maxLines - 1] || ''
    truncated[maxLines - 1] = lastLine.endsWith('...') ? lastLine : `${lastLine}...`
    return truncated
  }

  /**
   * 转义 XML
   * @param value - 原始字符串
   * @returns 转义后的字符串
   */
  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
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
