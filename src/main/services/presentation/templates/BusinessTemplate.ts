import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PresentationPageSize,
  PresentationSlideStyle,
  SlideLayout
} from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

const BUSINESS_THEME = {
  primaryColor: '0F172A',
  secondaryColor: 'D9E3F0',
  accentColor: '1D4ED8',
  backgroundColor: 'F8FAFC',
  textColor: '0F172A',
  mutedTextColor: '475569',
  fontFace: 'Aptos',
  headingFontFace: 'Aptos Display'
}

/**
 * 商务模板
 */
export class BusinessTemplate extends TemplateBase {
  constructor(pageSize?: PresentationPageSize) {
    super(pageSize)
  }

  readonly definition: PresentationTemplateDefinition = {
    id: 'business',
    selectionKey: 'business',
    source: 'builtin',
    name: '商务模板',
    description: '适合项目汇报、业务提案和数据总结',
    recommendedFor: ['项目汇报', '商业计划', '复盘总结'],
    previewColors: ['0F172A', '1D4ED8', 'F8FAFC'],
    theme: BUSINESS_THEME,
    defaultTheme: BUSINESS_THEME
  }

  override getSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    const style = super.getSlideStyle(layout, theme)

    return {
      ...style,
      decorativeShapes: [
        ...(style.decorativeShapes || []),
        {
          shape: 'rect',
          x: this.scaleWidth(0),
          y: this.scaleHeight(0),
          w: this.scaleWidth(3.55),
          h: this.scaleHeight(7.5),
          fillColor: theme.primaryColor,
          lineColor: theme.primaryColor,
          fillTransparency: 94,
          lineTransparency: 100
        },
        {
          shape: 'line',
          x: this.scaleWidth(0.8),
          y: this.scaleHeight(6.72),
          w: this.scaleWidth(4.1),
          h: 0,
          lineColor: theme.accentColor,
          lineWidth: 1.2
        }
      ]
    }
  }
}
