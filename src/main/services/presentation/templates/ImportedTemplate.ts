import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  BuiltinPresentationTemplate,
  PresentationDecorativeShape,
  PresentationDecorativeText,
  PresentationPageSize,
  PresentationThemeConfig,
  PositionOptions,
  PresentationLayoutRegions,
  PresentationSlideStyle,
  SlideLayout,
  TextStyle,
  UserPresentationTemplate
} from '@shared/types/presentation'
import { BusinessTemplate } from './BusinessTemplate'
import { LessonPlanTemplate } from './LessonPlanTemplate'
import { MinimalTemplate } from './MinimalTemplate'
import { TemplateBase } from './TemplateBase'

function createBuiltinTemplate(
  template: BuiltinPresentationTemplate,
  pageSize?: PresentationPageSize
): TemplateBase {
  switch (template) {
    case 'business':
      return new BusinessTemplate(pageSize)
    case 'minimal':
      return new MinimalTemplate(pageSize)
    case 'lessonPlan':
    default:
      return new LessonPlanTemplate(pageSize)
  }
}

/**
 * 用户导入模板
 * 优先复用导入模板中提取出的版式和排版信息，缺失部分回退到内置模板规则
 */
export class ImportedTemplate extends TemplateBase {
  readonly definition: PresentationTemplateDefinition
  private readonly fallbackTemplate: TemplateBase

  constructor(
    private readonly template: UserPresentationTemplate,
    defaultTheme: Required<PresentationThemeConfig>
  ) {
    super()
    this.fallbackTemplate = createBuiltinTemplate(template.baseTemplate, template.pageSize)

    this.definition = {
      id: 'custom',
      selectionKey: `custom:${template.id}`,
      source: 'user',
      name: template.name,
      description: template.description,
      userTemplateId: template.id,
      baseTemplate: template.baseTemplate,
      previewColors: template.previewColors,
      previewImageDataUrl: template.previewImageDataUrl,
      theme: defaultTheme,
      pageSize: template.pageSize,
      originalFileName: template.originalFileName,
      defaultTheme
    }
  }

  /**
   * 获取布局区域
   */
  override getRegions(layout: SlideLayout): PresentationLayoutRegions {
    const fallbackRegions = this.fallbackTemplate.getRegions(layout)
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
    const extractedStyle = this.resolveExtractedSlideStyle(layout, theme)

    if (!extractedStyle) {
      return this.fallbackTemplate.getSlideStyle(layout, theme)
    }

    const fallbackStyle = this.buildBaseSlideStyle(layout, theme)

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
      decorativeShapes: extractedStyle.decorativeShapes,
      decorativeTexts: extractedStyle.decorativeTexts
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
            style: this.resolveImportedTextStyle(extractedStyle.pageNumber.style, theme, 'body')
          }
        : undefined,
      decorativeShapes: extractedStyle.decorativeShapes?.map((shape) =>
        this.resolveImportedShape(shape, theme)
      ),
      decorativeTexts: extractedStyle.decorativeTexts?.map((text) =>
        this.resolveImportedDecorativeText(text, theme)
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
   * 解析导入装饰文本
   */
  private resolveImportedDecorativeText(
    text: PresentationDecorativeText,
    theme: ResolvedTheme
  ): PresentationDecorativeText {
    return {
      ...text,
      position: this.clonePosition(text.position) || {
        x: 0,
        y: 0,
        w: 0,
        h: 0
      },
      style: this.resolveImportedTextStyle(text.style, theme, 'body')
    }
  }

  /**
   * 解析导入颜色
   */
  private resolveImportedColor(
    color: string | undefined,
    theme: ResolvedTheme
  ): string | undefined {
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
