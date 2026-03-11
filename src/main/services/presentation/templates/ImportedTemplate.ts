import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PresentationThemeConfig,
  SlideLayout,
  UserPresentationTemplate
} from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

/**
 * 用户导入模板
 * 复用内置布局装饰，并覆盖为导入的主题样式
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
}
