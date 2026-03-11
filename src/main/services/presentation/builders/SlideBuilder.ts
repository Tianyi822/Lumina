import type PptxGenJS from 'pptxgenjs'
import type { ResolvedTheme } from '../types/presentation'
import type {
  CodeContent,
  ListContent,
  PresentationSlideStyle,
  PositionOptions,
  PresentationConfig,
  ShapeContent,
  SlideConfig,
  SlideContent,
  TextContent
} from '@shared/types/presentation'
import { ChartBuilder } from './ChartBuilder'
import { TableBuilder } from './TableBuilder'
import { TemplateBase } from '../templates/TemplateBase'

/**
 * 幻灯片构建器
 */
export class SlideBuilder {
  private readonly tableBuilder = new TableBuilder()
  private readonly chartBuilder = new ChartBuilder()

  /**
   * 构建单页幻灯片
   */
  buildSlide(
    pptx: PptxGenJS,
    slideConfig: SlideConfig,
    template: TemplateBase,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number,
    presentationConfig: PresentationConfig
  ): void {
    const slide = pptx.addSlide()
    const regions = template.getRegions(slideConfig.layout)
    const slideStyle = template.getSlideStyle(slideConfig.layout, theme)

    template.applySlideTheme(slide, slideConfig.layout, theme, slideIndex, totalSlides)

    if (slideConfig.layout !== 'blank' && regions.title) {
      const titleStyle = slideStyle.titleStyle
      slide.addText(slideConfig.title || presentationConfig.title, {
        ...regions.title,
        fontFace: titleStyle?.fontFace || theme.headingFontFace,
        fontSize:
          titleStyle?.fontSize || (slideConfig.layout === 'title' ? 28 : 24),
        bold: titleStyle?.bold ?? true,
        italic: titleStyle?.italic,
        color: this.normalizeColor(titleStyle?.color, theme.textColor),
        align: titleStyle?.align || 'left',
        valign: titleStyle?.valign || 'top',
        margin: titleStyle?.margin ?? 0
      })
    }

    if (slideConfig.subtitle && regions.subtitle) {
      const subtitleStyle = slideStyle.subtitleStyle
      slide.addText(slideConfig.subtitle, {
        ...regions.subtitle,
        fontFace: subtitleStyle?.fontFace || theme.fontFace,
        fontSize: subtitleStyle?.fontSize || 16,
        bold: subtitleStyle?.bold,
        italic: subtitleStyle?.italic,
        color: this.normalizeColor(subtitleStyle?.color, theme.mutedTextColor),
        align: subtitleStyle?.align || 'left',
        valign: subtitleStyle?.valign || 'top',
        margin: subtitleStyle?.margin ?? 0
      })
    }

    if (
      slideConfig.layout === 'comparison' &&
      regions.content.length === 2 &&
      template.shouldRenderComparisonDivider(slideConfig.layout)
    ) {
      const [leftRegion, rightRegion] = regions.content
      const dividerX = ((leftRegion.x ?? 0) + (leftRegion.w ?? 0) + (rightRegion.x ?? 0)) / 2

      slide.addShape('line', {
        x: dividerX,
        y: leftRegion.y ?? 0,
        w: 0,
        h: leftRegion.h ?? 0,
        line: {
          color: theme.secondaryColor,
          pt: 1
        }
      })
    }

    const contentGroups =
      regions.content.length === 2
        ? this.splitContentForColumns(slideConfig.content)
        : [slideConfig.content]

    contentGroups.forEach((group, groupIndex) => {
      const region = regions.content[groupIndex]
      if (!region) {
        return
      }

      let cursorY = region.y ?? 0
      const x = region.x ?? 0
      const w = region.w ?? 0
      const regionBottom = cursorY + (region.h ?? 0)

      group.forEach((content) => {
        const position = this.resolvePosition(content.options, {
          x,
          y: cursorY,
          w,
          h: regionBottom - cursorY
        })
        const usedHeight = this.renderContent(slide, content, position, theme, slideStyle)
        cursorY += usedHeight + 0.22
      })
    })

    if (slideConfig.notes?.trim()) {
      slide.addNotes(slideConfig.notes.trim())
    }
  }

  /**
   * 拆分双栏内容
   */
  private splitContentForColumns(content: SlideContent[]): [SlideContent[], SlideContent[]] {
    const midpoint = Math.ceil(content.length / 2)
    return [content.slice(0, midpoint), content.slice(midpoint)]
  }

  /**
   * 解析元素位置
   */
  private resolvePosition(
    options: PositionOptions | undefined,
    fallback: Required<PositionOptions>
  ): Required<PositionOptions> {
    return {
      x: options?.x ?? fallback.x,
      y: options?.y ?? fallback.y,
      w: options?.w ?? fallback.w,
      h: options?.h ?? fallback.h
    }
  }

  /**
   * 渲染内容块
   */
  private renderContent(
    slide: PptxGenJS.Slide,
    content: SlideContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme,
    slideStyle: PresentationSlideStyle
  ): number {
    switch (content.type) {
      case 'text':
        return this.addTextContent(slide, content.data as TextContent, position, theme, slideStyle)
      case 'list':
        return this.addListContent(slide, content.data as ListContent, position, theme, slideStyle)
      case 'table':
        return this.tableBuilder.addTable(
          slide,
          content.data,
          this.limitHeight(position, 2.8),
          theme
        )
      case 'chart':
        return this.chartBuilder.addChart(
          slide,
          content.data,
          this.limitHeight(position, 3.2),
          theme
        )
      case 'image':
        slide.addImage({
          x: position.x,
          y: position.y,
          w: position.w,
          h: Math.min(position.h, 3.2),
          path: content.data.path,
          data: content.data.data,
          altText: content.data.alt
        })
        return Math.min(position.h, 3.2)
      case 'shape':
        return this.addShapeContent(slide, content.data as ShapeContent, position, theme)
      case 'code':
        return this.addCodeContent(slide, content.data as CodeContent, position, theme)
      default:
        return 0
    }
  }

  /**
   * 添加文本内容
   */
  private addTextContent(
    slide: PptxGenJS.Slide,
    content: TextContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme,
    slideStyle: PresentationSlideStyle
  ): number {
    const bodyStyle = slideStyle.bodyStyle
    const lines = this.countLines(content.text, 28)
    const height = Math.min(Math.max(lines * 0.34, 0.48), position.h)

    slide.addText(content.text, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: height,
      fontFace: content.style?.fontFace || bodyStyle?.fontFace || theme.fontFace,
      fontSize: content.style?.fontSize || bodyStyle?.fontSize || 16,
      bold: content.style?.bold ?? bodyStyle?.bold,
      italic: content.style?.italic ?? bodyStyle?.italic,
      color: this.normalizeColor(content.style?.color || bodyStyle?.color, theme.textColor),
      align: content.style?.align || bodyStyle?.align || 'left',
      valign: content.style?.valign || bodyStyle?.valign || 'top',
      margin: content.style?.margin ?? bodyStyle?.margin ?? 0
    })

    return height
  }

  /**
   * 添加列表内容
   */
  private addListContent(
    slide: PptxGenJS.Slide,
    content: ListContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme,
    slideStyle: PresentationSlideStyle
  ): number {
    const listStyle = slideStyle.listStyle || slideStyle.bodyStyle
    const textRuns = content.items.map((item, index) => {
      const indentLevel = item.level || 0
      const indentation = '  '.repeat(indentLevel)
      const prefix = content.ordered ? `${index + 1}. ` : '• '

      return {
        text: `${indentation}${prefix}${item.text}`,
        options: {
          breakLine: true,
          bullet: false
        }
      }
    })
    const height = Math.min(Math.max(content.items.length * 0.38, 0.6), position.h)

    slide.addText(textRuns, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: height,
      fontFace: content.style?.fontFace || listStyle?.fontFace || theme.fontFace,
      fontSize: content.style?.fontSize || listStyle?.fontSize || 15,
      bold: content.style?.bold ?? listStyle?.bold,
      italic: content.style?.italic ?? listStyle?.italic,
      color: this.normalizeColor(content.style?.color || listStyle?.color, theme.textColor),
      align: content.style?.align || listStyle?.align,
      valign: content.style?.valign || listStyle?.valign,
      margin: content.style?.margin ?? listStyle?.margin ?? 0
    })

    return height
  }

  /**
   * 添加形状内容
   */
  private addShapeContent(
    slide: PptxGenJS.Slide,
    content: ShapeContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme
  ): number {
    const shapeHeight = Math.min(position.h, 1.35)
    const shapeName = this.resolveShapeType(content.shape)

    slide.addShape(shapeName, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: shapeHeight,
      line: {
        color: this.normalizeColor(content.lineColor, theme.primaryColor),
        pt: content.shape === 'line' ? 1.2 : 1
      },
      fill:
        content.shape === 'line'
          ? undefined
          : {
              color: this.normalizeColor(content.fillColor, theme.secondaryColor),
              transparency: 15
            }
    })

    if (content.text && content.shape !== 'line') {
      slide.addText(content.text, {
        x: position.x + 0.14,
        y: position.y + 0.14,
        w: Math.max(position.w - 0.28, 0.4),
        h: Math.max(shapeHeight - 0.28, 0.3),
        fontFace: theme.fontFace,
        fontSize: 14,
        bold: true,
        color: this.normalizeColor(content.textColor, theme.textColor),
        align: 'center',
        valign: 'middle',
        margin: 0
      })
    }

    return shapeHeight
  }

  /**
   * 添加代码块内容
   */
  private addCodeContent(
    slide: PptxGenJS.Slide,
    content: CodeContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme
  ): number {
    const lineCount = content.code.split('\n').length + (content.language ? 1 : 0)
    const height = Math.min(Math.max(lineCount * 0.28, 1.0), position.h)

    slide.addShape('roundRect', {
      x: position.x,
      y: position.y,
      w: position.w,
      h: height,
      rectRadius: 0.05,
      line: {
        color: theme.secondaryColor,
        pt: 1
      },
      fill: {
        color: 'F8FAFC'
      }
    })

    slide.addText(content.language ? `${content.language}\n${content.code}` : content.code, {
      x: position.x + 0.18,
      y: position.y + 0.16,
      w: Math.max(position.w - 0.36, 0.4),
      h: Math.max(height - 0.32, 0.3),
      fontFace: 'Menlo',
      fontSize: 11,
      color: theme.textColor,
      margin: 0
    })

    return height
  }

  /**
   * 限制默认高度
   */
  private limitHeight(
    position: Required<PositionOptions>,
    preferredHeight: number
  ): Required<PositionOptions> {
    return {
      ...position,
      h: Math.min(position.h, preferredHeight)
    }
  }

  /**
   * 统计文本行数
   */
  private countLines(text: string, lineWidth: number): number {
    return text.split('\n').reduce((count, line) => {
      const normalizedLength = Math.max(Math.ceil(line.length / lineWidth), 1)
      return count + normalizedLength
    }, 0)
  }

  /**
   * 归一化颜色
   */
  private normalizeColor(color: string | undefined, fallback: string): string {
    const normalized = color?.trim().replace(/^#/, '').toUpperCase()
    return normalized && /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback
  }

  /**
   * 映射形状类型
   */
  private resolveShapeType(shape: ShapeContent['shape']): PptxGenJS.SHAPE_NAME {
    switch (shape) {
      case 'roundRect':
        return 'roundRect'
      case 'ellipse':
        return 'ellipse'
      case 'chevron':
        return 'chevron'
      case 'line':
        return 'line'
      case 'rect':
      default:
        return 'rect'
    }
  }
}
