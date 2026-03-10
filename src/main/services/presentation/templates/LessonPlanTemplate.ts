import type PptxGenJS from 'pptxgenjs'
import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type { SlideLayout } from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

/**
 * 教案模板
 */
export class LessonPlanTemplate extends TemplateBase {
  readonly definition: PresentationTemplateDefinition = {
    id: 'lessonPlan',
    name: '教案模板',
    description: '适合课程讲义、教学汇报和课堂演示',
    recommendedFor: ['教案', '课程介绍', '培训材料'],
    previewColors: ['2F6BFF', 'E8F0FF', 'F7FAFF'],
    defaultTheme: {
      primaryColor: '2F6BFF',
      secondaryColor: 'DCE7FF',
      accentColor: '63A4FF',
      backgroundColor: 'F7FAFF',
      textColor: '17324D',
      mutedTextColor: '5B6F84',
      fontFace: 'PingFang SC',
      headingFontFace: 'PingFang SC'
    }
  }

  protected decorateSlide(slide: PptxGenJS.Slide, layout: SlideLayout, theme: ResolvedTheme): void {
    slide.addShape('roundRect', {
      x: 10.95,
      y: 0.38,
      w: 1.58,
      h: 0.32,
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
      x: 11.12,
      y: 0.43,
      w: 1.18,
      h: 0.18,
      align: 'center',
      color: theme.primaryColor,
      fontFace: theme.fontFace,
      fontSize: 10,
      bold: true,
      margin: 0
    })

    slide.addShape('arc', {
      x: 11.35,
      y: 5.9,
      w: 1.45,
      h: 1.0,
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
  }
}
