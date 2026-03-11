import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import { TemplateBase } from './TemplateBase'

/**
 * 商务模板
 */
export class BusinessTemplate extends TemplateBase {
  readonly definition: PresentationTemplateDefinition = {
    id: 'business',
    selectionKey: 'business',
    source: 'builtin',
    name: '商务模板',
    description: '适合项目汇报、业务提案和数据总结',
    recommendedFor: ['项目汇报', '商业计划', '复盘总结'],
    previewColors: ['0F172A', '1D4ED8', 'F8FAFC'],
    theme: {
      primaryColor: '0F172A',
      secondaryColor: 'D9E3F0',
      accentColor: '1D4ED8',
      backgroundColor: 'F8FAFC',
      textColor: '0F172A',
      mutedTextColor: '475569',
      fontFace: 'Aptos',
      headingFontFace: 'Aptos Display'
    },
    defaultTheme: {
      primaryColor: '0F172A',
      secondaryColor: 'D9E3F0',
      accentColor: '1D4ED8',
      backgroundColor: 'F8FAFC',
      textColor: '0F172A',
      mutedTextColor: '475569',
      fontFace: 'Aptos',
      headingFontFace: 'Aptos Display'
    }
  }

  protected decorateSlide(slide: PptxGenJS.Slide, _layout: string, theme: ResolvedTheme): void {
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
  }
}
