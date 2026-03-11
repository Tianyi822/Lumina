import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PresentationDecorativeShape,
  PresentationDecorativeText,
  PresentationLayoutRegions,
  PresentationPageSize,
  PresentationSlideStyle,
  PresentationPositionedTextStyle,
  PositionOptions,
  PresentationThemeConfig,
  SlideLayout
} from '@shared/types/presentation'

/**
 * PPT 模板基类
 */
export abstract class TemplateBase {
  private static readonly DEFAULT_PAGE_SIZE: PresentationPageSize = {
    width: 13.33,
    height: 7.5
  }

  constructor(private readonly pageSizeOverride?: PresentationPageSize) {}

  abstract readonly definition: PresentationTemplateDefinition

  /**
   * 应用演示文稿级别主题
   */
  applyPresentation(pptx: PptxGenJS, theme?: PresentationThemeConfig): ResolvedTheme {
    const resolvedTheme = this.resolveTheme(theme)
    const pageSize = this.getPageSize()

    if (
      Math.abs(pageSize.width - TemplateBase.DEFAULT_PAGE_SIZE.width) < 0.01 &&
      Math.abs(pageSize.height - TemplateBase.DEFAULT_PAGE_SIZE.height) < 0.01
    ) {
      pptx.layout = 'LAYOUT_WIDE'
    } else {
      pptx.defineLayout({
        name: 'SPARROW_CUSTOM_TEMPLATE',
        width: pageSize.width,
        height: pageSize.height
      })
      pptx.layout = 'SPARROW_CUSTOM_TEMPLATE'
    }

    pptx.theme = {
      headFontFace: resolvedTheme.headingFontFace,
      bodyFontFace: resolvedTheme.fontFace
    }

    return resolvedTheme
  }

  /**
   * 应用单页模板装饰
   */
  applySlideTheme(
    slide: PptxGenJS.Slide,
    layout: SlideLayout,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number
  ): void {
    const slideStyle = this.getSlideStyle(layout, theme)

    slide.background = {
      color: this.normalizeColor(slideStyle.backgroundColor, theme.backgroundColor)
    }

    slideStyle.decorativeShapes?.forEach((shape) => {
      this.addDecorativeShape(slide, shape, theme)
    })

    slideStyle.decorativeTexts?.forEach((text) => {
      this.addDecorativeText(slide, text, theme)
    })

    this.addPageNumber(slide, slideStyle.pageNumber, theme, slideIndex, totalSlides)
  }

  /**
   * 获取布局区域
   */
  getRegions(layout: SlideLayout): PresentationLayoutRegions {
    let regions: PresentationLayoutRegions

    switch (layout) {
      case 'title':
        regions = {
          title: { x: 0.9, y: 1.3, w: 11.5, h: 0.9 },
          subtitle: { x: 1.1, y: 2.35, w: 10.8, h: 0.6 },
          content: [{ x: 1.1, y: 3.25, w: 10.8, h: 2.4 }]
        }
        break
      case 'twoColumn':
      case 'comparison':
        regions = {
          title: { x: 0.8, y: 0.55, w: 11.6, h: 0.55 },
          content: [
            { x: 0.85, y: 1.45, w: 5.65, h: 5.2 },
            { x: 6.85, y: 1.45, w: 5.65, h: 5.2 }
          ]
        }
        break
      case 'blank':
        regions = {
          content: [{ x: 0.75, y: 0.65, w: 11.85, h: 5.95 }]
        }
        break
      case 'titleContent':
      default:
        regions = {
          title: { x: 0.8, y: 0.55, w: 11.6, h: 0.55 },
          content: [{ x: 0.85, y: 1.45, w: 11.55, h: 5.2 }]
        }
        break
    }

    return {
      title: regions.title ? this.scalePosition(regions.title) : undefined,
      subtitle: regions.subtitle ? this.scalePosition(regions.subtitle) : undefined,
      content: regions.content.map((item) => this.scalePosition(item))
    }
  }

  /**
   * 获取单页排版样式
   */
  getSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    return {
      ...this.buildBaseSlideStyle(layout, theme),
      decorativeShapes: [
        {
          shape: 'rect',
          x: 0,
          y: 0,
          w: this.getPageSize().width,
          h: this.scaleHeight(0.18),
          fillColor: theme.primaryColor,
          lineColor: theme.primaryColor,
          lineTransparency: 100
        }
      ]
    }
  }

  /**
   * 是否绘制对比布局分割线
   */
  shouldRenderComparisonDivider(_layout: SlideLayout): boolean {
    return true
  }

  /**
   * 合并主题配置
   */
  resolveTheme(theme?: PresentationThemeConfig): ResolvedTheme {
    const defaultTheme = this.definition.defaultTheme

    return {
      primaryColor: this.normalizeColor(theme?.primaryColor, defaultTheme.primaryColor),
      secondaryColor: this.normalizeColor(theme?.secondaryColor, defaultTheme.secondaryColor),
      accentColor: this.normalizeColor(theme?.accentColor, defaultTheme.accentColor),
      backgroundColor: this.normalizeColor(theme?.backgroundColor, defaultTheme.backgroundColor),
      textColor: this.normalizeColor(theme?.textColor, defaultTheme.textColor),
      mutedTextColor: this.normalizeColor(theme?.mutedTextColor, defaultTheme.mutedTextColor),
      fontFace: theme?.fontFace?.trim() || defaultTheme.fontFace,
      headingFontFace: theme?.headingFontFace?.trim() || defaultTheme.headingFontFace
    }
  }

  /**
   * 构建基础排版样式
   */
  protected buildBaseSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    return {
      backgroundColor: theme.backgroundColor,
      titleStyle: {
        fontFace: theme.headingFontFace,
        fontSize: layout === 'title' ? this.scaleFontSize(28) : this.scaleFontSize(24),
        bold: true,
        color: theme.textColor,
        margin: 0
      },
      subtitleStyle: {
        fontFace: theme.fontFace,
        fontSize: this.scaleFontSize(16),
        color: theme.mutedTextColor,
        margin: 0
      },
      bodyStyle: {
        fontFace: theme.fontFace,
        fontSize: this.scaleFontSize(16),
        color: theme.textColor,
        margin: 0
      },
      listStyle: {
        fontFace: theme.fontFace,
        fontSize: this.scaleFontSize(15),
        color: theme.textColor,
        margin: 0
      },
      pageNumber: {
        position: {
          x: this.scaleWidth(12.1),
          y: this.scaleHeight(7.05),
          w: this.scaleWidth(0.8),
          h: this.scaleHeight(0.18)
        },
        style: {
          align: 'right',
          color: theme.mutedTextColor,
          fontFace: theme.fontFace,
          fontSize: this.scaleFontSize(10),
          margin: 0
        }
      }
    }
  }

  /**
   * 归一化颜色值
   */
  protected normalizeColor(color: string | undefined, fallback: string): string {
    const normalized = color?.trim().replace(/^#/, '').toUpperCase()
    return normalized && /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback
  }

  /**
   * 获取当前模板页尺寸
   */
  protected getPageSize(): PresentationPageSize {
    return this.pageSizeOverride || this.definition.pageSize || TemplateBase.DEFAULT_PAGE_SIZE
  }

  /**
   * 绘制装饰图形
   */
  protected addDecorativeShape(
    slide: PptxGenJS.Slide,
    shape: PresentationDecorativeShape,
    theme: ResolvedTheme
  ): void {
    slide.addShape(shape.shape, {
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      rectRadius: shape.shape === 'roundRect' ? 0.08 : undefined,
      line:
        shape.shape === 'line' ||
        shape.lineColor ||
        shape.lineWidth ||
        shape.lineTransparency !== undefined
          ? {
              color: this.normalizeColor(shape.lineColor, theme.primaryColor),
              pt: shape.lineWidth || (shape.shape === 'line' ? 1.2 : 1),
              transparency: shape.lineTransparency
            }
          : undefined,
      fill:
        shape.shape === 'line' ||
        (!shape.fillColor && shape.fillTransparency === undefined && shape.shape !== 'arc')
          ? undefined
          : {
              color: this.normalizeColor(shape.fillColor, theme.backgroundColor),
              transparency: shape.fillTransparency ?? (shape.shape === 'arc' ? 100 : 0)
            }
    })
  }

  /**
   * 绘制装饰文本
   */
  protected addDecorativeText(
    slide: PptxGenJS.Slide,
    text: PresentationDecorativeText,
    theme: ResolvedTheme
  ): void {
    const content = text.text.trim()
    if (!content) {
      return
    }

    slide.addText(content, {
      ...text.position,
      align: text.style?.align || 'left',
      valign: text.style?.valign || 'top',
      color: this.normalizeColor(text.style?.color, theme.textColor),
      fontFace: text.style?.fontFace || theme.fontFace,
      fontSize: text.style?.fontSize || this.scaleFontSize(12),
      bold: text.style?.bold,
      italic: text.style?.italic,
      margin: text.style?.margin ?? 0
    })
  }

  /**
   * 缩放位置参数
   */
  protected scalePosition(position: PositionOptions): PositionOptions {
    return {
      x: position.x === undefined ? undefined : this.scaleWidth(position.x),
      y: position.y === undefined ? undefined : this.scaleHeight(position.y),
      w: position.w === undefined ? undefined : this.scaleWidth(position.w),
      h: position.h === undefined ? undefined : this.scaleHeight(position.h)
    }
  }

  /**
   * 缩放宽度
   */
  protected scaleWidth(value: number): number {
    return Number(
      ((value * this.getPageSize().width) / TemplateBase.DEFAULT_PAGE_SIZE.width).toFixed(3)
    )
  }

  /**
   * 缩放高度
   */
  protected scaleHeight(value: number): number {
    return Number(
      ((value * this.getPageSize().height) / TemplateBase.DEFAULT_PAGE_SIZE.height).toFixed(3)
    )
  }

  /**
   * 缩放字号
   */
  protected scaleFontSize(value: number): number {
    const pageSize = this.getPageSize()
    const ratio =
      (pageSize.width / TemplateBase.DEFAULT_PAGE_SIZE.width +
        pageSize.height / TemplateBase.DEFAULT_PAGE_SIZE.height) /
      2

    return Number((value * ratio).toFixed(2))
  }

  /**
   * 添加页码
   */
  protected addPageNumber(
    slide: PptxGenJS.Slide,
    pageNumber: PresentationPositionedTextStyle | undefined,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number
  ): void {
    if (!pageNumber?.position) {
      return
    }

    slide.addText(`${slideIndex}/${totalSlides}`, {
      ...pageNumber.position,
      align: pageNumber.style?.align || 'right',
      color: this.normalizeColor(pageNumber.style?.color, theme.mutedTextColor),
      fontFace: pageNumber.style?.fontFace || theme.fontFace,
      fontSize: pageNumber.style?.fontSize || this.scaleFontSize(10),
      bold: pageNumber.style?.bold,
      italic: pageNumber.style?.italic,
      margin: pageNumber.style?.margin ?? 0
    })
  }
}
