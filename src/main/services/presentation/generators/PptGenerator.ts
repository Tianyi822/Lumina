/**
 * PPT 生成器
 * 使用 PptxGenJS 构建最终的 PPTX 文件
 */

import PptxGenJS from 'pptxgenjs'
import { logger } from '@main/services/logger'
import type { PptStyleConfig } from '@shared/types/ppt-export'
import type { SlideContentBlock, SlideStyle } from '@shared/types/ppt-export'
import { LayoutCalculator } from './LayoutCalculator'
import { ElementRenderer } from './ElementRenderer'
import { TemplateRenderer } from './TemplateRenderer'
import { SlideRenderer } from './SlideRenderer'
import type { SlideRenderOptions } from './types'
import { DEFAULT_GENERATOR_STYLE } from './types'

/**
 * PPT 幻灯片生成器
 * 负责使用 PptxGenJS 创建 PowerPoint 文档
 *
 * 架构说明：
 * - LayoutCalculator: 负责布局计算（位置、尺寸）
 * - ElementRenderer: 负责渲染文本、列表、表格等元素
 * - TemplateRenderer: 负责渲染模板装饰元素
 * - SlideRenderer: 负责渲染完整幻灯片（组合上述模块）
 */
export class PptGenerator {
  private pptx: PptxGenJS
  private style: Required<PptStyleConfig>
  private slideWidth: number
  private slideHeight: number
  private slideCount: number

  // 子模块
  private layoutCalculator: LayoutCalculator
  private elementRenderer: ElementRenderer
  private templateRenderer: TemplateRenderer
  private slideRenderer: SlideRenderer

  constructor() {
    this.pptx = new PptxGenJS()
    this.style = { ...DEFAULT_GENERATOR_STYLE }
    this.slideCount = 0

    // 初始化幻灯片尺寸
    const defaultSize = LayoutCalculator.getDefaultSlideSize()
    this.slideWidth = defaultSize.width
    this.slideHeight = defaultSize.height

    // 初始化子模块
    this.layoutCalculator = new LayoutCalculator(
      this.slideWidth,
      this.slideHeight,
      this.style
    )
    this.elementRenderer = new ElementRenderer(this.style, this.layoutCalculator)
    this.templateRenderer = new TemplateRenderer(this.style, this.layoutCalculator)
    this.slideRenderer = new SlideRenderer(
      this.style,
      this.layoutCalculator,
      this.elementRenderer,
      this.templateRenderer,
      () => this.addSlide()
    )

    this.initializeDefaults()
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaults(): void {
    this.setSlideSize(this.slideWidth, this.slideHeight)
  }

  /**
   * 应用样式配置
   * 设置主题色、字体等基础样式
   * @param config - 样式配置
   */
  applyStyleConfig(config: PptStyleConfig): void {
    if (config.primaryColor) {
      this.style.primaryColor = config.primaryColor
    }
    if (config.backgroundColor) {
      this.style.backgroundColor = config.backgroundColor
    }
    if (config.titleFont) {
      this.style.titleFont = config.titleFont
    }
    if (config.bodyFont) {
      this.style.bodyFont = config.bodyFont
    }
    if (config.titleSize) {
      this.style.titleSize = config.titleSize
    }
    if (config.bodySize) {
      this.style.bodySize = config.bodySize
    }

    // 同步更新子模块的样式
    this.layoutCalculator.updateStyle(this.style)
    this.elementRenderer.updateStyle(this.style)
    this.templateRenderer.updateStyle(this.style)
    this.slideRenderer.updateStyle(this.style)
  }

  /**
   * 设置幻灯片尺寸
   * 从模板分析结果获取或使用默认值（16:9）
   * @param width - 宽度（英寸）
   * @param height - 高度（英寸）
   */
  setSlideSize(width: number, height: number): void {
    this.slideWidth = width
    this.slideHeight = height
    this.pptx.defineLayout({ name: 'CUSTOM', width, height })
    this.pptx.layout = 'CUSTOM'

    // 同步更新布局计算器
    this.layoutCalculator.updateSlideSize(width, height)
  }

  /**
   * 获取当前样式配置
   * @returns 样式配置
   */
  getStyle(): Required<PptStyleConfig> {
    return { ...this.style }
  }

  /**
   * 创建标题幻灯片
   * @param title - 主标题
   * @param subtitle - 副标题（可选）
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createTitleSlide(
    title: string,
    subtitle?: string,
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    this.slideRenderer.createTitleSlide(title, subtitle, style, options)
    logger.debug('创建标题幻灯片', 'main', { title, hasSubtitle: !!subtitle })
  }

  /**
   * 创建内容幻灯片
   * @param title - 幻灯片标题
   * @param blocks - 内容块数组
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createContentSlide(
    title: string,
    blocks: SlideContentBlock[],
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    this.slideRenderer.createContentSlide(title, blocks, style, options)
    logger.debug('创建内容幻灯片', 'main', {
      title,
      blockCount: blocks.length,
      singlePage: options?.singlePage === true
    })
  }

  /**
   * 创建表格幻灯片
   * @param title - 幻灯片标题
   * @param tableData - 表格数据
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createTableSlide(
    title: string,
    tableData: { headers: string[]; rows: string[][] },
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    this.slideRenderer.createTableSlide(title, tableData, style, options)
    logger.debug('创建表格幻灯片', 'main', {
      title,
      colCount: tableData.headers.length,
      rowCount: tableData.rows.length
    })
  }

  /**
   * 创建并计数幻灯片
   * @returns 幻灯片实例
   */
  private addSlide(): PptxGenJS.Slide {
    this.slideCount += 1
    return this.pptx.addSlide()
  }

  /**
   * 保存并返回 Buffer
   * 优化内存使用，直接返回 Buffer 而非多次转换
   * @returns PPTX 文件的二进制数据
   */
  async save(): Promise<Buffer> {
    const startTime = Date.now()
    try {
      const buffer = await this.pptx.write({ outputType: 'nodebuffer' })

      // 优化内存使用：直接使用 Buffer.from，避免不必要的中间转换
      let result: Buffer
      if (Buffer.isBuffer(buffer)) {
        // 已经是 Buffer，直接使用
        result = buffer
      } else if (buffer instanceof Uint8Array) {
        // Uint8Array 转 Buffer（高效）
        result = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } else if (buffer instanceof ArrayBuffer) {
        // ArrayBuffer 转 Buffer
        result = Buffer.from(buffer)
      } else if (typeof buffer === 'string') {
        // base64 字符串转 Buffer（罕见情况）
        result = Buffer.from(buffer, 'base64')
      } else {
        // 其他未知类型，尝试转换
        result = Buffer.from(buffer as unknown as ArrayBufferLike)
      }

      const elapsed = Date.now() - startTime
      logger.info('PPTX 文件生成成功', 'main', {
        size: result.length,
        elapsed: `${elapsed}ms`
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPTX 文件生成失败', 'main', { error: errorMessage })
      throw new Error(`PPTX 生成失败: ${errorMessage}`)
    }
  }

  /**
   * 获取当前幻灯片数量（用于进度监控）
   * @returns 当前已创建的幻灯片数量
   */
  getSlideCount(): number {
    return this.slideCount
  }
}
