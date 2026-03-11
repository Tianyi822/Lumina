import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PresentationPageSize,
  PresentationSlideStyle,
  SlideLayout
} from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

const MINIMAL_THEME = {
  primaryColor: '111827',
  secondaryColor: 'E5E7EB',
  accentColor: '9CA3AF',
  backgroundColor: 'FFFFFF',
  textColor: '111827',
  mutedTextColor: '6B7280',
  fontFace: 'PingFang SC',
  headingFontFace: 'PingFang SC'
}

/**
 * 极简模板
 */
export class MinimalTemplate extends TemplateBase {
  constructor(pageSize?: PresentationPageSize) {
    super(pageSize)
  }

  readonly definition: PresentationTemplateDefinition = {
    id: 'minimal',
    selectionKey: 'minimal',
    source: 'builtin',
    name: '极简模板',
    description: '适合简洁提纲、轻量分享和纯内容表达',
    recommendedFor: ['摘要', '提纲', '轻演示'],
    previewColors: ['111827', 'E5E7EB', 'FFFFFF'],
    theme: MINIMAL_THEME,
    defaultTheme: MINIMAL_THEME
  }

  override getSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    const style = super.getSlideStyle(layout, theme)

    return {
      ...style,
      decorativeShapes: [
        ...(style.decorativeShapes || []),
        {
          shape: 'line',
          x: this.scaleWidth(0.85),
          y: this.scaleHeight(1.18),
          w: this.scaleWidth(11.45),
          h: 0,
          lineColor: theme.secondaryColor,
          lineWidth: 1
        }
      ]
    }
  }
}
