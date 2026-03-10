import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import { TemplateBase } from './TemplateBase'

/**
 * 极简模板
 */
export class MinimalTemplate extends TemplateBase {
  readonly definition: PresentationTemplateDefinition = {
    id: 'minimal',
    name: '极简模板',
    description: '适合简洁提纲、轻量分享和纯内容表达',
    recommendedFor: ['摘要', '提纲', '轻演示'],
    previewColors: ['111827', 'E5E7EB', 'FFFFFF'],
    defaultTheme: {
      primaryColor: '111827',
      secondaryColor: 'E5E7EB',
      accentColor: '9CA3AF',
      backgroundColor: 'FFFFFF',
      textColor: '111827',
      mutedTextColor: '6B7280',
      fontFace: 'PingFang SC',
      headingFontFace: 'PingFang SC'
    }
  }

  protected decorateSlide(slide: PptxGenJS.Slide, _layout: string, theme: ResolvedTheme): void {
    slide.addShape('line', {
      x: 0.85,
      y: 1.18,
      w: 11.45,
      h: 0,
      line: {
        color: theme.secondaryColor,
        pt: 1
      }
    })
  }
}
