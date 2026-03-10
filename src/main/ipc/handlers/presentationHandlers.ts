import { ipcMain } from 'electron'
import { getPresentationExportService } from '@main/services/presentation'
import { logger } from '@main/services/logger'
import { z } from 'zod'

const hexColorSchema = z.string().regex(/^#?[0-9A-Fa-f]{6}$/, '颜色必须为十六进制格式')

const positionOptionsSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional()
})

const themeSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  textColor: hexColorSchema.optional(),
  mutedTextColor: hexColorSchema.optional(),
  fontFace: z.string().trim().min(1).max(120).optional(),
  headingFontFace: z.string().trim().min(1).max(120).optional()
})

const textStyleSchema = z.object({
  fontSize: z.number().positive().max(72).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: hexColorSchema.optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  valign: z.enum(['top', 'middle', 'bottom']).optional(),
  bullet: z.boolean().optional(),
  margin: z.number().min(0).max(40).optional(),
  fontFace: z.string().trim().min(1).max(120).optional()
})

const listItemSchema = z.object({
  text: z.string().trim().min(1),
  level: z.number().int().min(0).max(5).optional()
})

const tableStyleSchema = z.object({
  headerFillColor: hexColorSchema.optional(),
  headerTextColor: hexColorSchema.optional(),
  bodyFillColor: hexColorSchema.optional(),
  bodyTextColor: hexColorSchema.optional(),
  borderColor: hexColorSchema.optional(),
  striped: z.boolean().optional()
})

const chartSeriesSchema = z.object({
  name: z.string().trim().min(1),
  values: z.array(z.number().finite()).min(1)
})

const chartOptionsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  showLegend: z.boolean().optional(),
  showValue: z.boolean().optional(),
  showCategoryAxis: z.boolean().optional(),
  showValueAxis: z.boolean().optional()
})

const slideContentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    data: z.object({
      text: z.string().min(1),
      style: textStyleSchema.optional()
    }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('list'),
    data: z.object({
      items: z.array(listItemSchema).min(1),
      ordered: z.boolean().optional(),
      style: textStyleSchema.optional()
    }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('table'),
    data: z.object({
      headers: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())).default([]),
      style: tableStyleSchema.optional()
    }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('chart'),
    data: z.object({
      type: z.enum(['bar', 'line', 'pie', 'doughnut']),
      data: z.object({
        labels: z.array(z.string()).min(1),
        series: z.array(chartSeriesSchema).min(1)
      }),
      options: chartOptionsSchema.optional()
    }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('image'),
    data: z
      .object({
        path: z.string().trim().min(1).optional(),
        data: z.string().trim().min(1).optional(),
        alt: z.string().trim().max(200).optional()
      })
      .refine((value) => !!value.path || !!value.data, {
        message: '图片内容必须提供 path 或 data'
      }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('shape'),
    data: z.object({
      shape: z.enum(['rect', 'roundRect', 'ellipse', 'chevron', 'line']),
      text: z.string().optional(),
      fillColor: hexColorSchema.optional(),
      lineColor: hexColorSchema.optional(),
      textColor: hexColorSchema.optional()
    }),
    options: positionOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('code'),
    data: z.object({
      code: z.string().min(1),
      language: z.string().trim().max(60).optional()
    }),
    options: positionOptionsSchema.optional()
  })
])

const slideConfigSchema = z.object({
  layout: z.enum(['title', 'titleContent', 'twoColumn', 'blank', 'comparison']),
  title: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(300).optional(),
  content: z.array(slideContentSchema),
  notes: z.string().optional()
})

const presentationConfigSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(200).optional(),
  template: z.enum(['lessonPlan', 'business', 'minimal', 'custom']),
  slides: z.array(slideConfigSchema).min(1),
  theme: themeSchema.optional()
})

const exportPresentationRequestSchema = z
  .object({
    content: z.string().trim().min(1).optional(),
    config: presentationConfigSchema.optional(),
    title: z.string().trim().max(200).optional(),
    author: z.string().trim().max(120).optional(),
    company: z.string().trim().max(120).optional(),
    subject: z.string().trim().max(200).optional(),
    template: z.enum(['lessonPlan', 'business', 'minimal', 'custom']).optional(),
    theme: themeSchema.optional(),
    timestamp: z.string().optional()
  })
  .refine((value) => !!value.content || !!value.config, {
    message: '必须提供 content 或 config'
  })

const buildDraftRequestSchema = z.object({
  content: z.string().trim().min(1, 'PPT 草稿内容不能为空'),
  title: z.string().trim().max(200).optional(),
  author: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(200).optional(),
  template: z.enum(['lessonPlan', 'business', 'minimal', 'custom']).optional(),
  theme: themeSchema.optional()
})

/**
 * 注册 PPT 相关的 IPC 处理程序
 */
export function registerPresentationHandlers(): void {
  ipcMain.handle('presentation:buildDraft', async (_event, request: unknown) => {
    try {
      const parsedRequest = buildDraftRequestSchema.parse(request)

      return getPresentationExportService().buildDraft(parsedRequest)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 草稿生成失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: `PPT 草稿生成失败: ${errorMessage}`
      }
    }
  })

  ipcMain.handle('presentation:exportFromChat', async (_event, request: unknown) => {
    try {
      const parsedRequest = exportPresentationRequestSchema.parse(request)

      logger.info('接收到 PPT 导出请求', 'main', {
        hasContent: !!parsedRequest.content,
        hasConfig: !!parsedRequest.config,
        template: parsedRequest.config?.template || parsedRequest.template
      })

      return await getPresentationExportService().exportFromChat(parsedRequest)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 导出处理失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: `PPT 导出失败: ${errorMessage}`
      }
    }
  })

  ipcMain.handle('presentation:preview', async (_event, config: unknown) => {
    try {
      const parsedConfig = presentationConfigSchema.parse(config)
      return await getPresentationExportService().preview(parsedConfig)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 预览处理失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: `PPT 预览失败: ${errorMessage}`
      }
    }
  })

  ipcMain.handle('presentation:getTemplates', async () => {
    return getPresentationExportService().getTemplates()
  })

  ipcMain.handle('presentation:validate', async (_event, config: unknown) => {
    try {
      const parsedConfig = presentationConfigSchema.parse(config)
      return getPresentationExportService().validate(parsedConfig)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 配置校验失败', 'main', { error: errorMessage })

      return {
        valid: false,
        issues: [
          {
            path: 'config',
            message: errorMessage,
            severity: 'error'
          }
        ]
      }
    }
  })
}
