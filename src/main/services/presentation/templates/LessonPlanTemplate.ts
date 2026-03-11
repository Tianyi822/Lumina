import type { PresentationTemplateDefinition, ResolvedTheme } from '../types/presentation'
import type {
  PresentationPageSize,
  PresentationSlideStyle,
  SlideLayout
} from '@shared/types/presentation'
import { TemplateBase } from './TemplateBase'

const LESSON_PLAN_THEME = {
  primaryColor: '2F6BFF',
  secondaryColor: 'DCE7FF',
  accentColor: '63A4FF',
  backgroundColor: 'F7FAFF',
  textColor: '17324D',
  mutedTextColor: '5B6F84',
  fontFace: 'PingFang SC',
  headingFontFace: 'PingFang SC'
}

/**
 * 教案模板
 */
export class LessonPlanTemplate extends TemplateBase {
  constructor(pageSize?: PresentationPageSize) {
    super(pageSize)
  }

  readonly definition: PresentationTemplateDefinition = {
    id: 'lessonPlan',
    selectionKey: 'lessonPlan',
    source: 'builtin',
    name: '教案模板',
    description: '适合课程讲义、教学汇报和课堂演示',
    recommendedFor: ['教案', '课程介绍', '培训材料'],
    previewColors: ['2F6BFF', 'E8F0FF', 'F7FAFF'],
    theme: LESSON_PLAN_THEME,
    defaultTheme: LESSON_PLAN_THEME
  }

  override getSlideStyle(layout: SlideLayout, theme: ResolvedTheme): PresentationSlideStyle {
    const style = super.getSlideStyle(layout, theme)

    return {
      ...style,
      decorativeShapes: [
        ...(style.decorativeShapes || []),
        {
          shape: 'roundRect',
          x: this.scaleWidth(10.95),
          y: this.scaleHeight(0.38),
          w: this.scaleWidth(1.58),
          h: this.scaleHeight(0.32),
          fillColor: theme.secondaryColor,
          lineColor: theme.secondaryColor,
          lineTransparency: 100
        },
        {
          shape: 'arc',
          x: this.scaleWidth(11.35),
          y: this.scaleHeight(5.9),
          w: this.scaleWidth(1.45),
          h: this.scaleHeight(1.0),
          fillColor: theme.backgroundColor,
          fillTransparency: 100,
          lineColor: theme.secondaryColor,
          lineTransparency: 30,
          lineWidth: 1.2
        }
      ],
      decorativeTexts: [
        ...(style.decorativeTexts || []),
        {
          text: layout === 'title' ? '教学演示' : '教学页',
          position: {
            x: this.scaleWidth(11.12),
            y: this.scaleHeight(0.43),
            w: this.scaleWidth(1.18),
            h: this.scaleHeight(0.18)
          },
          style: {
            align: 'center',
            color: theme.primaryColor,
            fontFace: theme.fontFace,
            fontSize: this.scaleFontSize(10),
            bold: true,
            margin: 0
          }
        }
      ]
    }
  }
}
