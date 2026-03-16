import { logger } from '@main/services/logger'
import {
  DEFAULT_TEMPLATE_SLIDE_SIZE,
  TEMPLATE_LAYOUT_PRESETS,
  scaleTemplateLayoutPosition
} from './PptTemplateLayoutPresets'
import {
  PREVIEW_PIXELS_PER_INCH,
  DEFAULT_STYLE,
  DEFAULT_PREVIEW_SLIDE_SIZE_PX,
  OFFICE_THEME_COLORS
} from './constants'
import type {
  PptStyleConfig,
  PptSlideSize,
  ParsedSlide,
  PptExportConfig,
  SlideContentBlock
} from '@shared/types/ppt-export'
import type {
  PptTemplateSlideAnalysis,
  PptTemplateElementAnalysis
} from '@shared/types/ppt-template'
import type { PreviewCanvasSize, PreviewRect, TemplateRenderBundle } from './types'
import { resolveTemplateSlide, buildSlideStyle } from './utils'

/**
 * PPT 预览图生成器
 * 处理 SVG 预览图的生成逻辑
 */
export class PptPreviewGenerator {
  /**
   * 为页面预览补充 SVG 缩略图
   * @param previews - 预览数据
   * @param slides - 原始页面
   * @param config - 当前导出配置
   * @param templateBundle - 模板渲染上下文
   */
  attachSlidePreviewImages(
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
    const templateSlide = resolveTemplateSlide(templateBundle, slide, orderIndex)
    const slideStyle = buildSlideStyle(config, templateSlide)
    const zones = this.resolvePreviewZones(slide, slideSize)
    const backgroundColor = this.resolvePreviewColor(
      templateSlide?.background?.color ||
        slideStyle?.backgroundColor ||
        config.style.backgroundColor,
      '#ffffff',
      config.style
    )

    // 不显示模板背景图片，只使用纯色背景
    const decorations = templateSlide
      ? this.renderTemplatePreviewDecorations(
          templateSlide,
          config.style,
          zones.title,
          zones.content,
          canvas
        )
      : ''

    const contentMarkup = this.renderSlidePreviewContent(slide, config.style, zones, canvas)
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
      `<rect width="100%" height="100%" fill="${backgroundColor}" />`,
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

    const isGenericTitleSlide = slide.type === 'title' || slide.type === 'section'
    if (isGenericTitleSlide) {
      const titleHeight = slide.subtitle ? 1.2 : 1.5
      const titleY = slide.subtitle ? 2.5 : 3
      const titleRect = this.toPreviewRect(
        {
          x: 0.5,
          y: titleY,
          w: slideSize.width * 0.9,
          h: titleHeight
        },
        slideSize
      )

      return {
        title: titleRect,
        subtitle: slide.subtitle
          ? this.toPreviewRect(
              {
                x: 0.5,
                y: titleY + titleHeight + 0.3,
                w: slideSize.width * 0.9,
                h: 0.8
              },
              slideSize
            )
          : undefined
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
   * 只渲染形状，不渲染图片
   * @param templateSlide - 模板页
   * @param style - 当前样式
   * @param titleZone - 标题区域
   * @param contentZone - 内容区域
   * @param canvas - 画布尺寸
   * @returns SVG 片段
   */
  private renderTemplatePreviewDecorations(
    templateSlide: PptTemplateSlideAnalysis,
    style: PptStyleConfig,
    titleZone: PreviewRect,
    contentZone: PreviewRect | undefined,
    canvas: PreviewCanvasSize
  ): string {
    const elements = [...templateSlide.elements].sort((left, right) => left.zIndex - right.zIndex)

    return elements
      .filter((element) => this.shouldRenderPreviewTemplateElement(element, titleZone, contentZone))
      .map((element) => {
        // 只渲染形状，不渲染图片
        if (element.kind === 'shape') {
          return this.renderPreviewTemplateShape(element, style, canvas)
        }
        return ''
      })
      .join('')
  }

  /**
   * 判断模板元素是否应进入预览
   * 只保留形状元素，过滤掉图片
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
    // 只保留形状，过滤掉占位符、表格、图表和图片
    if (
      element.kind === 'placeholder' ||
      element.kind === 'table' ||
      element.kind === 'chart' ||
      element.kind === 'image'
    ) {
      return false
    }

    if (element.kind !== 'shape') {
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
        Math.min(elementRect.x + elementRect.w, zone.x + zone.w) - Math.max(elementRect.x, zone.x)
      )
      const overlapY = Math.max(
        0,
        Math.min(elementRect.y + elementRect.h, zone.y + zone.h) - Math.max(elementRect.y, zone.y)
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
    const isGenericTitleSlide =
      (slide.type === 'title' || slide.type === 'section') && !slide.layoutHint
    const titleFontSize =
      slide.layoutHint === 'cover'
        ? Math.round((style.titleSize || DEFAULT_STYLE.titleSize) * 1.24)
        : slide.layoutHint === 'ending'
          ? Math.round((style.titleSize || DEFAULT_STYLE.titleSize) * 1.16)
          : isGenericTitleSlide
            ? (style.titleSize || DEFAULT_STYLE.titleSize) + 8
            : style.titleSize || DEFAULT_STYLE.titleSize

    const titleMarkup = this.renderPreviewTextBlock(
      slide.title,
      zones.title,
      {
        fontSize: titleFontSize,
        fontFamily: style.titleFont || DEFAULT_STYLE.titleFont,
        fill: this.resolvePreviewColor(style.primaryColor, '#1e3a5f', style),
        fontWeight: 700,
        centered:
          slide.layoutHint === 'cover' || slide.layoutHint === 'ending' || isGenericTitleSlide,
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
                  : isGenericTitleSlide
                    ? (style.bodySize || DEFAULT_STYLE.bodySize) + 4
                    : Math.max((style.bodySize || DEFAULT_STYLE.bodySize) + 1, 16),
              fontFamily: style.bodyFont || DEFAULT_STYLE.bodyFont,
              fill: isGenericTitleSlide ? '#666666' : '#64748b',
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
      ? clippedRect.y +
        Math.max(options.fontSize, (clippedRect.h - totalHeight) / 2 + options.fontSize)
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
}
