import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PositionOptions,
  PresentationThemeConfig,
  SlideLayout
} from '@shared/types/presentation'

interface SlideRegions {
  title?: PositionOptions
  subtitle?: PositionOptions
  content: PositionOptions[]
}

/**
 * PPT 模板基类
 */
export abstract class TemplateBase {
  abstract readonly definition: PresentationTemplateDefinition

  /**
   * 应用演示文稿级别主题
   */
  applyPresentation(pptx: PptxGenJS, theme?: PresentationThemeConfig): ResolvedTheme {
    const resolvedTheme = this.resolveTheme(theme)

    pptx.layout = 'LAYOUT_WIDE'
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
    slide.background = { color: theme.backgroundColor }

    slide.addShape('rect', {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.18,
      line: {
        color: theme.primaryColor,
        transparency: 100
      },
      fill: {
        color: theme.primaryColor
      }
    })

    this.decorateSlide(slide, layout, theme, slideIndex, totalSlides)

    slide.addText(`${slideIndex}/${totalSlides}`, {
      x: 12.1,
      y: 7.05,
      w: 0.8,
      h: 0.18,
      align: 'right',
      color: theme.mutedTextColor,
      fontFace: theme.fontFace,
      fontSize: 10,
      margin: 0
    })
  }

  /**
   * 获取布局区域
   */
  getRegions(layout: SlideLayout): SlideRegions {
    switch (layout) {
      case 'title':
        return {
          title: { x: 0.9, y: 1.3, w: 11.5, h: 0.9 },
          subtitle: { x: 1.1, y: 2.35, w: 10.8, h: 0.6 },
          content: [{ x: 1.1, y: 3.25, w: 10.8, h: 2.4 }]
        }
      case 'twoColumn':
      case 'comparison':
        return {
          title: { x: 0.8, y: 0.55, w: 11.6, h: 0.55 },
          content: [
            { x: 0.85, y: 1.45, w: 5.65, h: 5.2 },
            { x: 6.85, y: 1.45, w: 5.65, h: 5.2 }
          ]
        }
      case 'blank':
        return {
          content: [{ x: 0.75, y: 0.65, w: 11.85, h: 5.95 }]
        }
      case 'titleContent':
      default:
        return {
          title: { x: 0.8, y: 0.55, w: 11.6, h: 0.55 },
          content: [{ x: 0.85, y: 1.45, w: 11.55, h: 5.2 }]
        }
    }
  }

  /**
   * 获取预览样式
   */
  getPreviewStyle(theme?: PresentationThemeConfig): {
    backgroundColor: string
    primaryColor: string
    secondaryColor: string
    textColor: string
    mutedTextColor: string
  } {
    const resolvedTheme = this.resolveTheme(theme)
    return {
      backgroundColor: resolvedTheme.backgroundColor,
      primaryColor: resolvedTheme.primaryColor,
      secondaryColor: resolvedTheme.secondaryColor,
      textColor: resolvedTheme.textColor,
      mutedTextColor: resolvedTheme.mutedTextColor
    }
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
   * 子类可覆盖的附加装饰
   */
  protected abstract decorateSlide(
    slide: PptxGenJS.Slide,
    layout: SlideLayout,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number
  ): void

  /**
   * 归一化颜色值
   */
  protected normalizeColor(color: string | undefined, fallback: string): string {
    const normalized = color?.trim().replace(/^#/, '').toUpperCase()
    return normalized && /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback
  }
}
