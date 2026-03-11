import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PositionOptions,
  PresentationDecorativeShape,
  PresentationLayoutRegions,
  PresentationSlideStyle,
  PresentationThemeConfig,
  SlideLayout,
  TextStyle,
  UserPresentationTemplate
} from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

/**
 * 用户导入模板
 * 优先复用导入模板中提取出的版式和排版信息，缺失部分回退到内置模板规则
 */
export class ImportedTemplate extends TemplateBase {
  readonly definition: PresentationTemplateDefinition

  constructor(
    private readonly template: UserPresentationTemplate,
    defaultTheme: Required<PresentationThemeConfig>
  ) {
    super()

    this.definition = {
      id: 'custom',
      selectionKey: `custom:${template.id}`,
      source: 'user',
      name: template.name,
      description: template.description,
      userTemplateId: template.id,
      baseTemplate: template.baseTemplate,
      previewColors: template.previewColors,
      theme: defaultTheme,
      pageSize: template.pageSize,
      originalFileName: template.originalFileName,
      defaultTheme
    }
  }

  /**
   * 应用单页样式
   */
  override applySlideTheme(
    slide: PptxGenJS.Slide,
    layout: SlideLayout,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number
  ): void {
    if (!this.hasExtractedLayout(layout)) {
      super.applySlideTheme(slide, layout, theme, slideIndex, totalSlides)
      return
    }

    const slideStyle = this.getSlideStyle(layout, theme)

    slide.background = {
      color: this.normalizeColor(slideStyle.backgroundColor, theme.backgroundColor)
    }

    slideStyle.decorativeShapes?.forEach((shape) => {
      this.addDecorativeShape(slide, shape, theme)
    })

    this.addPageNumber(slide, slideStyle.pageNumber, theme, slideIndex, totalSlides)
  }

  /**
   * 获取布局区域
   */
  override getRegions(layout: SlideLayout): PresentationLayoutRegions {
    const fallbackRegions = super.getRegions(layout)
    const extractedRegions = this.template.layoutSpec?.regions?.[layout]

    if (!extractedRegions) {
      return fallbackRegions
    }

    const requiredContentCount = this.getRequiredContentCount(layout)
    const contentRegions =
      extractedRegions.content.length >= requiredContentCount
        ? extractedRegions.content
            .map((item) => this.clonePosition(item))
            .filter((item): item is PositionOptions => !!item)
        : fallbackRegions.content
            .map((item) => this.clonePosition(item))
            .filter((item): item is PositionOptions => !!item)

    return {
      title: this.clonePosition(extractedRegions.title || fallbackRegions.title),
      subtitle: this.clonePosition(extractedRegions.subtitle || fallbackRegions.subtitle),
      content: contentRegions
    }
  }

  /**
   * 获取排版样式
   */
  override getSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    const fallbackStyle = super.getSlideStyle(layout, theme)
    const extractedStyle = this.resolveExtractedSlideStyle(layout, theme)

    if (!extractedStyle) {
      return fallbackStyle
    }

    return {
      ...fallbackStyle,
      backgroundColor: extractedStyle.backgroundColor || fallbackStyle.backgroundColor,
      titleStyle: this.mergeTextStyle(fallbackStyle.titleStyle, extractedStyle.titleStyle),
      subtitleStyle: this.mergeTextStyle(fallbackStyle.subtitleStyle, extractedStyle.subtitleStyle),
      bodyStyle: this.mergeTextStyle(fallbackStyle.bodyStyle, extractedStyle.bodyStyle),
      listStyle: this.mergeTextStyle(fallbackStyle.listStyle, extractedStyle.listStyle),
      pageNumber: extractedStyle.pageNumber
        ? {
            position: this.clonePosition(extractedStyle.pageNumber.position) || {
              x: 0,
              y: 0,
              w: 0,
              h: 0
            },
            style: this.mergeTextStyle(
              fallbackStyle.pageNumber?.style,
              extractedStyle.pageNumber.style
            )
          }
        : fallbackStyle.pageNumber,
      decorativeShapes: extractedStyle.decorativeShapes || fallbackStyle.decorativeShapes
    }
  }

  /**
   * 导入模板若已提取双栏结构，则不再额外插入默认分割线
   */
  override shouldRenderComparisonDivider(layout: SlideLayout): boolean {
    if (layout !== 'comparison') {
      return true
    }

    return (this.template.layoutSpec?.regions?.[layout]?.content.length || 0) < 2
  }

  /**
   * 回退装饰逻辑
   */
  protected decorateSlide(slide: PptxGenJS.Slide, layout: SlideLayout, theme: ResolvedTheme): void {
    switch (this.template.baseTemplate) {
      case 'business':
        slide.addShape('rect', {
          x: this.scaleWidth(0),
          y: this.scaleHeight(0),
          w: this.scaleWidth(3.55),
          h: this.scaleHeight(7.5),
          line: {
            color: theme.primaryColor,
            transparency: 100
          },
          fill: {
            color: theme.primaryColor,
            transparency: 94
          }
        })

        slide.addShape('line', {
          x: this.scaleWidth(0.8),
          y: this.scaleHeight(6.72),
          w: this.scaleWidth(4.1),
          h: this.scaleHeight(0),
          line: {
            color: theme.accentColor,
            pt: 1.2
          }
        })
        return
      case 'lessonPlan':
        slide.addShape('roundRect', {
          x: this.scaleWidth(10.95),
          y: this.scaleHeight(0.38),
          w: this.scaleWidth(1.58),
          h: this.scaleHeight(0.32),
          rectRadius: 0.08,
          line: {
            color: theme.secondaryColor,
            transparency: 100
          },
          fill: {
            color: theme.secondaryColor
          }
        })

        slide.addText(layout === 'title' ? '教学演示' : '教学页', {
          x: this.scaleWidth(11.12),
          y: this.scaleHeight(0.43),
          w: this.scaleWidth(1.18),
          h: this.scaleHeight(0.18),
          align: 'center',
          color: theme.primaryColor,
          fontFace: theme.fontFace,
          fontSize: this.scaleFontSize(10),
          bold: true,
          margin: 0
        })

        slide.addShape('arc', {
          x: this.scaleWidth(11.35),
          y: this.scaleHeight(5.9),
          w: this.scaleWidth(1.45),
          h: this.scaleHeight(1),
          line: {
            color: theme.secondaryColor,
            transparency: 30,
            pt: 1.2
          },
          fill: {
            color: theme.backgroundColor,
            transparency: 100
          }
        })
        return
      case 'minimal':
      default:
        slide.addShape('line', {
          x: this.scaleWidth(0.85),
          y: this.scaleHeight(1.18),
          w: this.scaleWidth(11.45),
          h: this.scaleHeight(0),
          line: {
            color: theme.secondaryColor,
            pt: 1
          }
        })
    }
  }

  /**
   * 判断是否已有提取布局
   */
  private hasExtractedLayout(layout: SlideLayout): boolean {
    return !!(
      this.template.layoutSpec?.regions?.[layout] || this.template.layoutSpec?.styles?.[layout]
    )
  }

  /**
   * 解析导入模板样式
   */
  private resolveExtractedSlideStyle(
    layout: SlideLayout,
    theme: ResolvedTheme
  ): PresentationSlideStyle | undefined {
    const extractedStyle = this.template.layoutSpec?.styles?.[layout]
    if (!extractedStyle) {
      return undefined
    }

    return {
      backgroundColor: this.resolveImportedColor(extractedStyle.backgroundColor, theme),
      titleStyle: this.resolveImportedTextStyle(extractedStyle.titleStyle, theme, 'heading'),
      subtitleStyle: this.resolveImportedTextStyle(extractedStyle.subtitleStyle, theme, 'body'),
      bodyStyle: this.resolveImportedTextStyle(extractedStyle.bodyStyle, theme, 'body'),
      listStyle: this.resolveImportedTextStyle(extractedStyle.listStyle, theme, 'body'),
      pageNumber: extractedStyle.pageNumber
        ? {
            position: this.clonePosition(extractedStyle.pageNumber.position) || {
              x: 0,
              y: 0,
              w: 0,
              h: 0
            },
            style: this.resolveImportedTextStyle(
              extractedStyle.pageNumber.style,
              theme,
              'body'
            )
          }
        : undefined,
      decorativeShapes: extractedStyle.decorativeShapes?.map((shape) =>
        this.resolveImportedShape(shape, theme)
      )
    }
  }

  /**
   * 合并文本样式
   */
  private mergeTextStyle(
    fallbackStyle: TextStyle | undefined,
    extractedStyle: TextStyle | undefined
  ): TextStyle | undefined {
    if (!fallbackStyle && !extractedStyle) {
      return undefined
    }

    return {
      ...(fallbackStyle || {}),
      ...(extractedStyle || {})
    }
  }

  /**
   * 解析导入文本样式的颜色和字体映射
   */
  private resolveImportedTextStyle(
    style: TextStyle | undefined,
    theme: ResolvedTheme,
    fontRole: 'heading' | 'body'
  ): TextStyle | undefined {
    if (!style) {
      return undefined
    }

    return {
      ...style,
      color: this.resolveImportedColor(style.color, theme),
      fontFace: this.resolveImportedFontFace(style.fontFace, theme, fontRole)
    }
  }

  /**
   * 解析导入图形的颜色映射
   */
  private resolveImportedShape(
    shape: PresentationDecorativeShape,
    theme: ResolvedTheme
  ): PresentationDecorativeShape {
    return {
      ...shape,
      fillColor: this.resolveImportedColor(shape.fillColor, theme),
      lineColor: this.resolveImportedColor(shape.lineColor, theme)
    }
  }

  /**
   * 解析导入颜色
   */
  private resolveImportedColor(color: string | undefined, theme: ResolvedTheme): string | undefined {
    const normalizedColor = this.normalizeOptionalColor(color)
    if (!normalizedColor) {
      return undefined
    }

    const sourceTheme = this.template.theme
    const colorMappings: Array<[string | undefined, string]> = [
      [sourceTheme.primaryColor, theme.primaryColor],
      [sourceTheme.secondaryColor, theme.secondaryColor],
      [sourceTheme.accentColor, theme.accentColor],
      [sourceTheme.backgroundColor, theme.backgroundColor],
      [sourceTheme.textColor, theme.textColor],
      [sourceTheme.mutedTextColor, theme.mutedTextColor]
    ]

    for (const [sourceColor, targetColor] of colorMappings) {
      if (this.normalizeOptionalColor(sourceColor) === normalizedColor) {
        return targetColor
      }
    }

    return normalizedColor
  }

  /**
   * 解析导入字体
   */
  private resolveImportedFontFace(
    fontFace: string | undefined,
    theme: ResolvedTheme,
    fontRole: 'heading' | 'body'
  ): string | undefined {
    const normalizedFontFace = fontFace?.trim()
    if (!normalizedFontFace) {
      return undefined
    }

    const sourceHeadingFont = this.template.theme.headingFontFace?.trim()
    const sourceBodyFont = this.template.theme.fontFace?.trim()

    if (fontRole === 'heading' && sourceHeadingFont && normalizedFontFace === sourceHeadingFont) {
      return theme.headingFontFace
    }

    if (fontRole === 'body' && sourceBodyFont && normalizedFontFace === sourceBodyFont) {
      return theme.fontFace
    }

    if (sourceHeadingFont && normalizedFontFace === sourceHeadingFont) {
      return theme.headingFontFace
    }

    if (sourceBodyFont && normalizedFontFace === sourceBodyFont) {
      return theme.fontFace
    }

    return normalizedFontFace
  }

  /**
   * 绘制装饰图形
   */
  private addDecorativeShape(
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
        shape.shape === 'line' || shape.lineColor || shape.lineWidth || shape.lineTransparency !== undefined
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
   * 获取布局所需最少内容区数量
   */
  private getRequiredContentCount(layout: SlideLayout): number {
    return layout === 'twoColumn' || layout === 'comparison' ? 2 : 1
  }

  /**
   * 复制位置信息
   */
  private clonePosition(position: PositionOptions | undefined): PositionOptions | undefined {
    if (!position) {
      return undefined
    }

    return {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h
    }
  }

  /**
   * 归一化可选颜色
   */
  private normalizeOptionalColor(color: string | undefined): string | undefined {
    const normalized = color?.trim().replace(/^#/, '').toUpperCase()
    return normalized && /^[0-9A-F]{6}$/.test(normalized) ? normalized : undefined
  }
}
