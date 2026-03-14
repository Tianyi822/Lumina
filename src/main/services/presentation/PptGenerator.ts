/**
 * PPT 生成器
 * 使用 PptxGenJS 构建最终的 PPTX 文件
 */

import PptxGenJS from 'pptxgenjs'
import { logger } from '@main/services/logger'
import {
  DEFAULT_TEMPLATE_SLIDE_SIZE,
  TEMPLATE_LAYOUT_PRESETS,
  scaleTemplateLayoutPosition
} from './PptTemplateLayoutPresets'
import type { PptSlideSize, PptStyleConfig } from '@shared/types/ppt-export'
import type { SlideContentBlock, SlideStyle } from '@shared/types/ppt-export'
import type {
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'

/** 默认幻灯片尺寸（16:9，英寸） */
const DEFAULT_SLIDE_WIDTH = DEFAULT_TEMPLATE_SLIDE_SIZE.width
const DEFAULT_SLIDE_HEIGHT = DEFAULT_TEMPLATE_SLIDE_SIZE.height

/** 默认样式配置 */
const DEFAULT_STYLE = {
  primaryColor: '1E3A5F',
  backgroundColor: 'FFFFFF',
  titleFont: 'Microsoft YaHei',
  bodyFont: 'Microsoft YaHei',
  titleSize: 36,
  bodySize: 18
}

/** 单页模式下的最小正文字号 */
const MIN_BODY_FONT_SIZE = 10

/**
 * 幻灯片渲染选项
 */
interface SlideRenderOptions {
  /** 是否强制保持为单页 */
  singlePage?: boolean
  /** 页面布局提示 */
  layoutHint?: 'cover' | 'ending'
  /** 副标题 */
  subtitle?: string
  /** 标题页正文内容 */
  blocks?: SlideContentBlock[]
  /** 模板页分析结果 */
  templateSlide?: PptTemplateSlideAnalysis
  /** 模板媒体资源 */
  mediaData?: Map<string, string>
}

/**
 * 当前页内容排版参数
 */
interface SlideContentMetrics {
  bodyFontSize: number
  listLineSpacing: number
  tableHeaderFontSize: number
  tableBodyFontSize: number
}

/**
 * PPT 幻灯片生成器
 * 负责使用 PptxGenJS 创建 PowerPoint 文档
 */
export class PptGenerator {
  private pptx: PptxGenJS
  private style: Required<PptStyleConfig>
  private slideWidth: number
  private slideHeight: number
  private slideCount: number

  constructor() {
    this.pptx = new PptxGenJS()
    this.style = { ...DEFAULT_STYLE }
    this.slideWidth = DEFAULT_SLIDE_WIDTH
    this.slideHeight = DEFAULT_SLIDE_HEIGHT
    this.slideCount = 0
    this.initializeDefaults()
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaults(): void {
    // 设置默认布局为 16:9
    this.setSlideSize(DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT)
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
   */
  createTitleSlide(
    title: string,
    subtitle?: string,
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const slide = this.createSlideShell(style, options)
    const isCoverSlide = options?.layoutHint === 'cover'
    const isEndingSlide = options?.layoutHint === 'ending'

    // 标题位置配置
    const titlePos =
      isCoverSlide
        ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.title)
        : isEndingSlide
          ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.ending.title)
          : this.resolvePosition(style?.titlePosition, {
              x: 0.5,
              y: subtitle ? 2.5 : 3,
              w: '90%',
              h: subtitle ? 1.2 : 1.5
            })

    const subtitlePos = subtitle
      ? isCoverSlide
        ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.subtitle)
        : isEndingSlide
          ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.ending.subtitle)
          : this.resolvePosition(undefined, {
              x: 0.5,
              y: titlePos.y + titlePos.h + 0.3,
              w: '90%',
              h: 0.8
            })
      : undefined
    const bodyPos = isCoverSlide
      ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.body)
      : undefined

    // 添加主标题
    slide.addText(title, {
      x: titlePos.x,
      y: titlePos.y,
      w: titlePos.w,
      h: titlePos.h,
      fontSize: this.style.titleSize + 8,
      bold: true,
      color: this.style.primaryColor,
      fontFace: this.style.titleFont,
      align: 'center',
      valign: 'middle',
      fit: options?.singlePage ? 'shrink' : 'none'
    })

    // 添加副标题
    if (subtitle && subtitlePos) {
      slide.addText(subtitle, {
        x: subtitlePos.x,
        y: subtitlePos.y,
        w: subtitlePos.w,
        h: subtitlePos.h,
        fontSize: this.style.bodySize + 4,
        color: '666666',
        fontFace: this.style.bodyFont,
        align: 'center',
        valign: 'middle',
        fit: options?.singlePage ? 'shrink' : 'none'
      })
    }

    if (isCoverSlide && bodyPos && options?.blocks?.length) {
      const metrics = this.resolveContentMetrics(options.blocks, bodyPos.w, bodyPos.h, options)
      let currentY = bodyPos.y

      for (const block of options.blocks) {
        const result = this.addContentBlock(
          slide,
          block,
          {
            x: bodyPos.x,
            y: currentY,
            w: bodyPos.w,
            h: Math.max(bodyPos.y + bodyPos.h - currentY, 0.4)
          },
          metrics
        )
        currentY = result.nextY
      }
    }

    logger.debug('创建标题幻灯片', 'main', { title, hasSubtitle: !!subtitle })
  }

  /**
   * 创建内容幻灯片
   * @param title - 幻灯片标题
   * @param blocks - 内容块数组
   * @param style - 幻灯片样式（可选）
   */
  createContentSlide(
    title: string,
    blocks: SlideContentBlock[],
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const titlePos = options?.templateSlide
      ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.title)
      : this.resolvePosition(style?.titlePosition, {
          x: 0.5,
          y: 0.5,
          w: '90%',
          h: 0.8
        })

    const contentPos = options?.templateSlide
      ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.body)
      : this.resolvePosition(style?.contentPosition, {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 5.5
        })

    const metrics = this.resolveContentMetrics(blocks, contentPos.w, contentPos.h, options)

    const createSlideWithHeader = (): { slide: PptxGenJS.Slide; startY: number } => {
      const slide = this.createSlideShell(style, options)

      slide.addText(title, {
        x: titlePos.x,
        y: titlePos.y,
        w: titlePos.w,
        h: titlePos.h,
        fontSize: this.style.titleSize,
        bold: true,
        color: this.style.primaryColor,
        fontFace: this.style.titleFont,
        fit: options?.singlePage ? 'shrink' : 'none'
      })

      let startY = contentPos.y
      if (options?.subtitle) {
        const subtitleY = titlePos.y + titlePos.h + 0.12
        const subtitleHeight = Math.min(0.6, Math.max(0.35, contentPos.y - subtitleY - 0.12))

        slide.addText(options.subtitle, {
          x: titlePos.x,
          y: subtitleY,
          w: titlePos.w,
          h: subtitleHeight,
          fontSize: Math.max(metrics.bodyFontSize, this.style.bodySize),
          color: '666666',
          fontFace: this.style.bodyFont,
          fit: options?.singlePage ? 'shrink' : 'none'
        })
        startY = Math.max(contentPos.y, subtitleY + subtitleHeight + 0.12)
      }

      return { slide, startY }
    }

    const initial = createSlideWithHeader()
    let slide = initial.slide
    let currentY = initial.startY
    const maxY = contentPos.y + contentPos.h

    for (const block of blocks) {
      const estimatedHeight = this.estimateBlockHeight(block, contentPos.w, metrics.bodyFontSize)
      if (!options?.singlePage && currentY > contentPos.y && currentY + estimatedHeight > maxY) {
        const nextSlide = createSlideWithHeader()
        slide = nextSlide.slide
        currentY = nextSlide.startY
      }

      const result = this.addContentBlock(slide, block, {
        x: contentPos.x,
        y: currentY,
        w: contentPos.w,
        h: Math.max(maxY - currentY, 0.5)
      }, metrics)
      currentY = result.nextY
    }

    logger.debug('创建内容幻灯片', 'main', {
      title,
      blockCount: blocks.length,
      singlePage: options?.singlePage === true
    })
  }

  /**
   * 添加内容块到幻灯片
   * @param slide - 幻灯片对象
   * @param block - 内容块
   * @param position - 位置信息
   * @returns 下一个内容的 Y 坐标
   */
  private addContentBlock(
    slide: PptxGenJS.Slide,
    block: SlideContentBlock,
    position: { x: number; y: number; w: number; h: number },
    metrics: SlideContentMetrics
  ): { nextY: number } {
    const { x, y, w, h } = position

    switch (block.type) {
      case 'paragraph':
        this.addParagraph(slide, block.text, { x, y, w, h }, metrics.bodyFontSize)
        return { nextY: y + this.calculateParagraphHeight(block.text, w, metrics.bodyFontSize) + 0.22 }

      case 'list':
        this.addList(slide, block.items, block.ordered, { x, y, w, h }, metrics)
        return { nextY: y + this.calculateListHeight(block.items, w, metrics.bodyFontSize) + 0.22 }

      case 'table':
        this.addTable(slide, block.headers, block.rows, { x, y, w }, metrics)
        return {
          nextY:
            y + this.calculateTableHeight(block.headers, block.rows.length, metrics.bodyFontSize) + 0.22
        }

      case 'image':
        // 图片暂时不支持嵌入，添加占位文本
        this.addParagraph(
          slide,
          `[图片: ${block.alt || '未命名'}]`,
          { x, y, w, h: 0.5 },
          metrics.bodyFontSize
        )
        return { nextY: y + 0.8 }

      default:
        return { nextY: y }
    }
  }

  /**
   * 估算内容块高度，用于控制内容区自动续页
   * @param block - 内容块
   * @param width - 可用宽度
   * @returns 估算高度
   */
  private estimateBlockHeight(
    block: SlideContentBlock,
    width: number,
    bodyFontSize: number
  ): number {
    switch (block.type) {
      case 'paragraph':
        return this.calculateParagraphHeight(block.text, width, bodyFontSize) + 0.22
      case 'list':
        return this.calculateListHeight(block.items, width, bodyFontSize) + 0.22
      case 'table':
        return this.calculateTableHeight(block.headers, block.rows.length, bodyFontSize) + 0.22
      case 'image':
        return 0.8
      default:
        return 0.5
    }
  }

  /**
   * 获取当前页面尺寸下的模板固定位置
   * @param position - 默认 16:9 页面下的位置
   * @returns 当前尺寸下的位置
   */
  private getTemplatePosition(position: {
    x: number
    y: number
    w: number
    h: number
  }): { x: number; y: number; w: number; h: number } {
    return scaleTemplateLayoutPosition(this.getCurrentSlideSize(), position)
  }

  /**
   * 将模板/默认位置转换为具体数值坐标
   * @param position - 位置配置
   * @param fallback - 默认值
   * @returns 解析后的坐标
   */
  private resolvePosition(
    position: SlideStyle['titlePosition'] | SlideStyle['contentPosition'] | undefined,
    fallback: { x: number; y: number; w: number | string; h: number | string }
  ): { x: number; y: number; w: number; h: number } {
    return {
      x: this.resolveLength(position?.x, this.slideWidth, fallback.x),
      y: this.resolveLength(position?.y, this.slideHeight, fallback.y),
      w: this.resolveLength(position?.w, this.slideWidth, fallback.w),
      h: this.resolveLength(position?.h, this.slideHeight, fallback.h)
    }
  }

  /**
   * 解析英寸/百分比值为数值坐标
   * @param value - 原始值
   * @param total - 参考总长度
   * @param fallback - 默认值
   * @returns 解析结果
   */
  private resolveLength(
    value: number | string | undefined,
    total: number,
    fallback: number | string
  ): number {
    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'string') {
      const matched = value.match(/^(\d+(?:\.\d+)?)%$/)
      if (matched) {
        return (total * Number.parseFloat(matched[1])) / 100
      }
    }

    if (typeof fallback === 'number') {
      return fallback
    }

    const fallbackMatched = fallback.match(/^(\d+(?:\.\d+)?)%$/)
    if (fallbackMatched) {
      return (total * Number.parseFloat(fallbackMatched[1])) / 100
    }

    return 0
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
   * 添加段落文本
   * @param slide - 幻灯片对象
   * @param text - 文本内容
   * @param position - 位置信息
   */
  private addParagraph(
    slide: PptxGenJS.Slide,
    text: string,
    position: { x: number; y: number; w: number; h: number },
    fontSize: number
  ): void {
    slide.addText(text, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize,
      color: '333333',
      fontFace: this.style.bodyFont,
      align: 'left',
      valign: 'top',
      fit: 'shrink'
    })
  }

  /**
   * 添加列表
   * @param slide - 幻灯片对象
   * @param items - 列表项
   * @param ordered - 是否有序列表
   * @param position - 位置信息
   */
  private addList(
    slide: PptxGenJS.Slide,
    items: string[],
    ordered: boolean,
    position: { x: number; y: number; w: number; h: number },
    metrics: SlideContentMetrics
  ): void {
    const listItems = items.map(item => ({
      text: item,
      options: {
        bullet: !ordered,
        numbered: ordered
      }
    }))

    slide.addText(listItems, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: metrics.bodyFontSize,
      color: '333333',
      fontFace: this.style.bodyFont,
      align: 'left',
      valign: 'top',
      lineSpacing: metrics.listLineSpacing,
      fit: 'shrink'
    })
  }

  /**
   * 添加表格
   * @param slide - 幻灯片对象
   * @param headers - 表头
   * @param rows - 行数据
   * @param position - 位置信息
   */
  private addTable(
    slide: PptxGenJS.Slide,
    headers: string[],
    rows: string[][],
    position: { x: number; y: number; w: number },
    metrics: SlideContentMetrics
  ): void {
    const colWidth = position.w / headers.length

    // 构建表格数据
    const tableData = [
      headers.map(h => ({
        text: h,
        options: {
          bold: true,
          fontSize: metrics.tableHeaderFontSize,
          color: 'FFFFFF',
          fill: { color: this.style.primaryColor }
        }
      })),
      ...rows.map(row =>
        row.map(cell => ({
          text: cell,
          options: {
            fontSize: metrics.tableBodyFontSize,
            color: '333333',
            border: { pt: 1, color: 'CCCCCC' }
          }
        }))
      )
    ]

    slide.addTable(tableData, {
      x: position.x,
      y: position.y,
      w: position.w,
      border: { pt: 1, color: 'CCCCCC' },
      colW: headers.map(() => colWidth)
    })
  }

  /**
   * 计算段落高度（估算）
   * @param text - 文本内容
   * @param width - 宽度
   * @returns 估算的高度（英寸）
   */
  private calculateParagraphHeight(text: string, width: number, bodyFontSize: number): number {
    const scale = bodyFontSize / DEFAULT_STYLE.bodySize
    const charPerLine = Math.max(8, Math.floor(width / (0.15 * scale))) // 估算每行字符数
    const lines = Math.ceil(text.length / charPerLine)
    return Math.max(0.28, lines * 0.25 * scale)
  }

  /**
   * 计算列表高度（估算）
   * @param items - 列表项
   * @param width - 宽度
   * @returns 估算的高度（英寸）
   */
  private calculateListHeight(items: string[], width: number, bodyFontSize: number): number {
    const scale = bodyFontSize / DEFAULT_STYLE.bodySize
    const lineHeight = 0.35 * scale
    let totalHeight = 0
    for (const item of items) {
      const charPerLine = Math.max(8, Math.floor(width / (0.15 * scale)))
      const lines = Math.ceil(item.length / charPerLine)
      totalHeight += Math.max(lineHeight, lines * 0.2 * scale)
    }
    return totalHeight
  }

  /**
   * 计算表格高度（估算）
   * @param _headers - 表头
   * @param rowCount - 行数
   * @returns 估算的高度（英寸）
   */
  private calculateTableHeight(
    _headers: string[],
    rowCount: number,
    bodyFontSize: number
  ): number {
    const scale = bodyFontSize / DEFAULT_STYLE.bodySize
    const headerHeight = 0.5 * scale
    const rowHeight = 0.4 * scale
    return headerHeight + rowCount * rowHeight
  }

  /**
   * 创建表格幻灯片
   * @param title - 幻灯片标题
   * @param tableData - 表格数据
   * @param style - 幻灯片样式（可选）
   */
  createTableSlide(
    title: string,
    tableData: { headers: string[]; rows: string[][] },
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const slide = this.createSlideShell(style, options)

    // 标题位置配置
    const titlePos = options?.templateSlide
      ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.title)
      : this.resolvePosition(style?.titlePosition, {
          x: 0.5,
          y: 0.5,
          w: '90%',
          h: 0.8
        })

    const contentPos = options?.templateSlide
      ? this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.body)
      : this.resolvePosition(style?.contentPosition, {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 5.5
        })
    const metrics = this.resolveContentMetrics(
      [{ type: 'table', headers: tableData.headers, rows: tableData.rows }],
      contentPos.w,
      contentPos.h,
      options
    )

    // 添加标题
    slide.addText(title, {
      x: titlePos.x,
      y: titlePos.y,
      w: titlePos.w,
      h: titlePos.h,
      fontSize: this.style.titleSize,
      bold: true,
      color: this.style.primaryColor,
      fontFace: this.style.titleFont,
      fit: options?.singlePage ? 'shrink' : 'none'
    })

    this.addTable(
      slide,
      tableData.headers,
      tableData.rows,
      {
        x: contentPos.x,
        y: contentPos.y,
        w: contentPos.w
      },
      metrics
    )

    logger.debug('创建表格幻灯片', 'main', {
      title,
      colCount: tableData.headers.length,
      rowCount: tableData.rows.length
    })
  }

  /**
   * 创建幻灯片骨架并绘制模板静态元素
   * @param style - 当前页面样式
   * @param options - 渲染选项
   * @returns 幻灯片实例
   */
  private createSlideShell(style?: SlideStyle, options?: SlideRenderOptions): PptxGenJS.Slide {
    const slide = this.addSlide()
    const bgColor = style?.backgroundColor || this.style.backgroundColor
    slide.background = { color: bgColor }

    if (options?.templateSlide) {
      const backgroundImagePath = options.templateSlide.background?.imagePath
      const backgroundImageData = backgroundImagePath ? options.mediaData?.get(backgroundImagePath) : undefined
      if (backgroundImageData) {
        slide.addImage({
          data: backgroundImageData,
          x: 0,
          y: 0,
          w: this.slideWidth,
          h: this.slideHeight
        })
      }

      this.renderTemplateDecorations(slide, options.templateSlide, style, options.mediaData)
    }

    return slide
  }

  /**
   * 获取当前页面尺寸
   * @returns 页面尺寸
   */
  private getCurrentSlideSize(): PptSlideSize {
    return {
      width: this.slideWidth,
      height: this.slideHeight
    }
  }

  /**
   * 计算当前页的排版参数
   * 单页模式下会根据内容量缩小字号，避免额外分页
   * @param blocks - 内容块
   * @param contentWidth - 内容区宽度
   * @param contentHeight - 内容区高度
   * @param options - 渲染选项
   * @returns 排版参数
   */
  private resolveContentMetrics(
    blocks: SlideContentBlock[],
    contentWidth: number,
    contentHeight: number,
    options?: SlideRenderOptions
  ): SlideContentMetrics {
    const baseFontSize = this.style.bodySize

    if (!options?.singlePage || blocks.length === 0) {
      return {
        bodyFontSize: baseFontSize,
        listLineSpacing: 28,
        tableHeaderFontSize: baseFontSize,
        tableBodyFontSize: Math.max(baseFontSize - 2, MIN_BODY_FONT_SIZE)
      }
    }

    const estimatedHeight = blocks.reduce(
      (total, block) => total + this.estimateBlockHeight(block, contentWidth, baseFontSize),
      0
    )

    const scale =
      estimatedHeight > contentHeight && estimatedHeight > 0
        ? Math.max(contentHeight / estimatedHeight, MIN_BODY_FONT_SIZE / baseFontSize)
        : 1

    const bodyFontSize = Math.max(MIN_BODY_FONT_SIZE, Math.floor(baseFontSize * scale))
    return {
      bodyFontSize,
      listLineSpacing: Math.max(18, Math.round(28 * (bodyFontSize / baseFontSize))),
      tableHeaderFontSize: Math.max(bodyFontSize, Math.floor(bodyFontSize + 1)),
      tableBodyFontSize: Math.max(MIN_BODY_FONT_SIZE - 1, bodyFontSize - 1)
    }
  }

  /**
   * 绘制模板中的静态装饰元素
   * 只复用非正文区域的图形/图片/文本，避免把模板示例内容直接带入导出结果
   * @param slide - 当前幻灯片
   * @param templateSlide - 模板页分析结果
   * @param style - 当前页面样式
   * @param mediaData - 模板媒体资源
   */
  private renderTemplateDecorations(
    slide: PptxGenJS.Slide,
    templateSlide: PptTemplateSlideAnalysis,
    style: SlideStyle | undefined,
    mediaData?: Map<string, string>
  ): void {
    const titleZone = style?.titlePosition
    const contentZone = style?.contentPosition
    const elements = [...templateSlide.elements].sort((left, right) => left.zIndex - right.zIndex)

    for (const element of elements) {
      if (!this.shouldRenderTemplateElement(element, titleZone, contentZone)) {
        continue
      }

      switch (element.kind) {
        case 'shape':
          this.renderTemplateShape(slide, element)
          break
        case 'image':
          this.renderTemplateImage(slide, element, mediaData)
          break
      }
    }
  }

  /**
   * 判断模板元素是否应该复用
   * @param element - 模板元素
   * @param titleZone - 标题区域
   * @param contentZone - 内容区域
   * @returns 是否复用
   */
  private shouldRenderTemplateElement(
    element: PptTemplateElementAnalysis,
    titleZone?: SlideStyle['titlePosition'],
    contentZone?: SlideStyle['contentPosition']
  ): boolean {
    if (element.kind === 'placeholder' || element.kind === 'table' || element.kind === 'chart') {
      return false
    }

    if (!['shape', 'image'].includes(element.kind)) {
      return false
    }

    if (!titleZone && !contentZone) {
      return true
    }

    return !this.isElementOverlappingContentZone(element, titleZone, contentZone)
  }

  /**
   * 判断元素是否与动态内容区域重叠
   * @param element - 模板元素
   * @param titleZone - 标题区域
   * @param contentZone - 内容区域
   * @returns 是否重叠
   */
  private isElementOverlappingContentZone(
    element: PptTemplateElementAnalysis,
    titleZone?: SlideStyle['titlePosition'],
    contentZone?: SlideStyle['contentPosition']
  ): boolean {
    const elementRect = {
      x: element.x / 914400,
      y: element.y / 914400,
      w: element.cx / 914400,
      h: element.cy / 914400
    }

    const zones = [titleZone, contentZone].filter(
      (zone): zone is NonNullable<typeof zone> => Boolean(zone)
    )

    return zones.some((zone) => {
      const zoneRect = {
        x: this.resolveLength(zone.x, this.slideWidth, 0),
        y: this.resolveLength(zone.y, this.slideHeight, 0),
        w: this.resolveLength(zone.w, this.slideWidth, 0),
        h: this.resolveLength(zone.h, this.slideHeight, 0)
      }
      const overlapX =
        Math.max(
          0,
          Math.min(elementRect.x + elementRect.w, zoneRect.x + zoneRect.w) -
            Math.max(elementRect.x, zoneRect.x)
        )
      const overlapY =
        Math.max(
          0,
          Math.min(elementRect.y + elementRect.h, zoneRect.y + zoneRect.h) -
            Math.max(elementRect.y, zoneRect.y)
        )

      const overlapArea = overlapX * overlapY
      const elementArea = elementRect.w * elementRect.h

      return elementArea > 0 && overlapArea / elementArea > 0.2
    })
  }

  /**
   * 绘制模板形状
   * @param slide - 当前幻灯片
   * @param element - 模板形状元素
   */
  private renderTemplateShape(slide: PptxGenJS.Slide, element: PptTemplateElementAnalysis): void {
    const shapePreset = element.shape?.preset
    if (!shapePreset) {
      return
    }

    slide.addShape(shapePreset as PptxGenJS.ShapeType, {
      x: element.x / 914400,
      y: element.y / 914400,
      w: element.cx / 914400,
      h: element.cy / 914400,
      fill: element.shape?.fillColor
        ? { color: this.resolveTemplateColor(element.shape.fillColor) }
        : { color: 'FFFFFF', transparency: 100 },
      line: element.shape?.strokeColor
        ? {
            color: this.resolveTemplateColor(element.shape.strokeColor),
            width: element.shape.strokeWidth ? element.shape.strokeWidth / 12700 : 1
          }
        : { color: 'FFFFFF', transparency: 100 }
    })
  }

  /**
   * 绘制模板图片
   * @param slide - 当前幻灯片
   * @param element - 模板图片元素
   * @param mediaData - 模板媒体资源
   */
  private renderTemplateImage(
    slide: PptxGenJS.Slide,
    element: PptTemplateElementAnalysis,
    mediaData?: Map<string, string>
  ): void {
    const imagePath = element.image?.relationshipTarget
    const imageData = imagePath ? mediaData?.get(imagePath) : undefined

    if (!imageData) {
      return
    }

    slide.addImage({
      data: imageData,
      x: element.x / 914400,
      y: element.y / 914400,
      w: element.cx / 914400,
      h: element.cy / 914400
    })
  }

  /**
   * 解析模板颜色
   * 支持常见主题色占位符
   * @param color - 模板颜色
   * @returns 十六进制颜色
   */
  private resolveTemplateColor(color: string): string {
    const normalized = color.replace(/^#/, '').toUpperCase()

    switch (normalized) {
      case 'ACCENT1':
        return this.style.primaryColor
      case 'BG1':
        return this.style.backgroundColor
      case 'TX1':
        return '333333'
      case 'BG2':
        return 'F7F8FA'
      default:
        return /^[0-9A-F]{6}$/.test(normalized) ? normalized : this.style.primaryColor
    }
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
