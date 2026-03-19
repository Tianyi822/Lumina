/**
 * PPT 导出服务
 * 协调内容解析、样式配置和生成流程
 */

import { createHash } from 'crypto'
import { unzipSync } from 'fflate'
import { logger } from '@main/services/logger'
import { getPptTemplateService } from './PptTemplateService'
import { PptContentParser } from './PptContentParser'
import { PptGenerator } from './PptGenerator'
import { PptPreviewGenerator } from './PptPreviewGenerator'
import { PptTemplateStyleExtractor } from './PptTemplateStyleExtractor'
import {
  MAX_RECOMMENDED_SLIDES,
  MAX_ALLOWED_SLIDES,
  PERFORMANCE_WARNING_THRESHOLD,
  DEFAULT_STYLE
} from './constants'
import {
  resolveTemplateSlide,
  buildSlideStyle,
  buildFileName,
  resolveMediaMimeType,
  isTableOnlySlide
} from './utils'
import type {
  PreviewPptExportResult,
  GeneratePptRequest,
  GeneratePptResult,
  PptExportConfig,
  PptSlideSize,
  PptStyleConfig,
  SlideContentBlock,
  TemplateSlideLayout,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'
import type { ParsedSlide } from '@shared/types/ppt-export'
import type { PptTemplateListItem } from '@shared/types/ppt-template'
import type { TemplateAnalysisContext, TemplateRenderBundle } from './types'

interface ParsedSlidesCacheEntry {
  key: string
  slides: ParsedSlide[]
}

/**
 * PPT 导出服务
 * 提供内容解析、样式配置和 PPT 生成功能
 */
export class PptExportService {
  private parser: PptContentParser
  private styleExtractor: PptTemplateStyleExtractor
  private previewGenerator: PptPreviewGenerator
  private lastParsedSlidesCache: ParsedSlidesCacheEntry | null = null

  constructor() {
    this.parser = new PptContentParser()
    this.styleExtractor = new PptTemplateStyleExtractor()
    this.previewGenerator = new PptPreviewGenerator()
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
  async previewExport(content: string, templateId?: string): Promise<PreviewPptExportResult> {
    const startTime = Date.now()
    try {
      // 获取可用模板列表
      const availableTemplates = await this.getAvailableTemplates()

      // 确定要使用的模板 ID（注意：空字符串应被视为无效）
      const effectiveTemplateId = templateId?.trim() || availableTemplates[0]?.id

      let style: PptStyleConfig = { ...DEFAULT_STYLE }
      let templateLayouts: TemplateSlideLayout[] | undefined
      let slideSize: PptSlideSize | undefined
      let styleSource: PptExportConfig['styleSource'] | undefined
      let expectedSlideCount: number | undefined
      let templateContext: TemplateAnalysisContext | null = null

      if (effectiveTemplateId) {
        templateContext = this.loadTemplateAnalysisContextByTemplateId(effectiveTemplateId)
        if (templateContext) {
          styleSource = { type: 'template', templateId: effectiveTemplateId }
        }

        const extraction = templateContext
          ? this.styleExtractor.extract(templateContext.analysis)
          : null
        if (extraction?.style) {
          style = extraction.style
        }
        templateLayouts = extraction?.layouts
        slideSize = extraction?.slideSize
        expectedSlideCount = templateContext?.analysis.slides.length
      }

      if (!styleSource) {
        return {
          success: false,
          error: '未找到可用的 PPT 模板'
        }
      }

      // 解析内容为幻灯片
      const slides = this.parseContentToSlides(content, {
        expectedSlideCount,
        templateId: styleSource.templateId
      })

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
      this.previewGenerator.attachSlidePreviewImages(
        slidePreviews,
        slides,
        {
          slides: slidePreviews,
          styleSource,
          style,
          templateLayouts,
          slideSize
        },
        templateContext
      )

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
      const templateContext = this.loadTemplateAnalysisContext(request.config.styleSource)
      if (!templateContext) {
        return {
          success: false,
          error: '未找到模板分析结果'
        }
      }

      const templateBundle = this.loadTemplateRenderBundle(
        request.config.styleSource,
        templateContext
      )
      const expectedSlideCount =
        templateContext.analysis.slides.length || request.config.slides.length

      // 解析内容
      slides = this.parseContentToSlides(request.content, {
        expectedSlideCount,
        templateId: request.config.styleSource.templateId
      })

      // 过滤选中的幻灯片
      const selectedIndices = request.config.slides.filter((s) => s.selected).map((s) => s.index)
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
        const templateSlide = resolveTemplateSlide(templateBundle, slide, i)
        const slideStyle = buildSlideStyle(request.config, templateSlide)

        // 保持单页展示（PPT 导出目前不支持分页）
        const shouldKeepSinglePage = true

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
        } else if (isTableOnlySlide(slide)) {
          const tableBlock = slide.blocks[0] as Extract<SlideContentBlock, { type: 'table' }>
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
      const fileName = buildFileName(request.title)
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
      const templateContext = this.loadTemplateAnalysisContextByTemplateId(templateId)

      if (!templateContext) {
        return null
      }

      return this.styleExtractor.extract(templateContext.analysis)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('加载模板完整样式失败', 'main', { templateId, error: errorMessage })
      return null
    }
  }

  /**
   * 解析 Markdown 内容为幻灯片结构
   * @param content - Markdown 内容
   * @param options - 解析选项
   * @returns 解析后的幻灯片数组
   */
  private parseContentToSlides(
    content: string,
    options: { expectedSlideCount?: number; templateId?: string } = {}
  ): ParsedSlide[] {
    const cacheKey = this.buildParsedSlidesCacheKey(content, options)

    if (this.lastParsedSlidesCache?.key === cacheKey) {
      logger.debug('PPT 内容解析命中缓存', 'main', {
        templateId: options.templateId,
        expectedSlideCount: options.expectedSlideCount
      })
      return this.lastParsedSlidesCache.slides
    }

    const slides = this.parser.parse(content, { expectedSlideCount: options.expectedSlideCount })
    this.lastParsedSlidesCache = { key: cacheKey, slides }

    return slides
  }

  /**
   * 构建解析缓存 key
   * @param content - Markdown 内容
   * @param options - 解析选项
   * @returns 缓存 key
   */
  private buildParsedSlidesCacheKey(
    content: string,
    options: { expectedSlideCount?: number; templateId?: string }
  ): string {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    const contentHash = createHash('sha1').update(normalizedContent).digest('hex')

    return `${contentHash}:${options.expectedSlideCount ?? 'none'}:${options.templateId ?? 'none'}`
  }

  /**
   * 加载模板分析上下文
   * @param styleSource - 样式来源
   * @returns 模板分析上下文
   */
  private loadTemplateAnalysisContext(
    styleSource: PptExportConfig['styleSource']
  ): TemplateAnalysisContext | null {
    if (styleSource.type !== 'template') {
      return null
    }

    return this.loadTemplateAnalysisContextByTemplateId(styleSource.templateId)
  }

  /**
   * 按模板 ID 加载模板分析上下文
   * @param templateId - 模板 ID
   * @returns 模板分析上下文
   */
  private loadTemplateAnalysisContextByTemplateId(
    templateId: string
  ): TemplateAnalysisContext | null {
    const templateService = getPptTemplateService()
    const analysis = templateService.getTemplateAnalysis(templateId)

    if (!analysis) {
      logger.warn('未找到模板分析结果', 'main', { templateId })
      return null
    }

    return { analysis }
  }

  /**
   * 加载模板渲染上下文
   * @param styleSource - 样式来源
   * @param templateContext - 预加载的模板分析上下文
   * @returns 渲染上下文
   */
  private loadTemplateRenderBundle(
    styleSource: PptExportConfig['styleSource'],
    templateContext?: TemplateAnalysisContext | null
  ): TemplateRenderBundle | null {
    if (styleSource.type !== 'template') {
      return null
    }

    const effectiveTemplateContext =
      templateContext ?? this.loadTemplateAnalysisContext(styleSource)
    if (!effectiveTemplateContext) {
      return null
    }

    const templateId = styleSource.templateId
    const templateService = getPptTemplateService()
    const sourceBuffer = templateService.getTemplateSourceData(templateId)
    if (!sourceBuffer) {
      logger.warn('模板源文件缺失，将退回到纯样式模式', 'main', { templateId })
      return { analysis: effectiveTemplateContext.analysis, mediaData: new Map() }
    }

    try {
      const archive = unzipSync(new Uint8Array(sourceBuffer))
      const mediaData = new Map<string, string>()

      for (const [path, data] of Object.entries(archive)) {
        if (!path.startsWith('ppt/media/')) {
          continue
        }

        const mimeType = resolveMediaMimeType(path)
        const base64 = Buffer.from(data).toString('base64')
        mediaData.set(path, `data:${mimeType};base64,${base64}`)
      }

      return { analysis: effectiveTemplateContext.analysis, mediaData }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('加载模板媒体资源失败，将退回到纯样式模式', 'main', {
        templateId,
        error: errorMessage
      })
      return { analysis: effectiveTemplateContext.analysis, mediaData: new Map() }
    }
  }

  /**
   * 获取可用模板列表
   * @returns 模板列表
   */
  private async getAvailableTemplates(): Promise<PptTemplateListItem[]> {
    try {
      const templateService = getPptTemplateService()
      return templateService.getAvailableTemplates()
    } catch {
      return []
    }
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
