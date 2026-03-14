import { ipcMain } from 'electron'
import { getPptExportService } from '@main/services/presentation/PptExportService'
import { logger } from '@main/services/logger'
import { z } from 'zod'

/**
 * 预览 PPT 导出请求参数验证
 */
const previewPptExportSchema = z.object({
  content: z.string().trim().min(1, '导出内容不能为空'),
  templateId: z.string().optional()
})

/**
 * 生成 PPT 请求参数验证
 */
const generatePptSchema = z.object({
  content: z.string().trim().min(1, '导出内容不能为空'),
  config: z.object({
    slides: z.array(
      z.object({
        index: z.number(),
        title: z.string().optional(),
        contentType: z.enum(['title', 'content', 'table', 'list', 'mixed']),
        summary: z.string(),
        previewImageDataUrl: z.string().optional(),
        selected: z.boolean()
      })
    ),
    styleSource: z.object({ type: z.literal('template'), templateId: z.string() }),
    style: z.object({
      primaryColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      titleFont: z.string().optional(),
      bodyFont: z.string().optional(),
      titleSize: z.number().optional(),
      bodySize: z.number().optional()
    }),
    templateLayouts: z
      .array(
        z.object({
          name: z.string(),
          backgroundColor: z.string().optional(),
          titlePosition: z
            .object({
              x: z.number(),
              y: z.number(),
              w: z.union([z.number(), z.string()]),
              h: z.union([z.number(), z.string()])
            })
            .optional(),
          contentPosition: z
            .object({
              x: z.number(),
              y: z.number(),
              w: z.union([z.number(), z.string()]),
              h: z.union([z.number(), z.string()])
            })
            .optional()
        })
      )
      .optional(),
    slideSize: z
      .object({
        width: z.number().positive(),
        height: z.number().positive()
      })
      .optional()
  }),
  title: z.string().trim().max(120).optional()
})

/**
 * 注册 PPT 导出相关的 IPC 处理程序
 * 处理 PPT 预览、生成等操作
 */
export function registerPptExportHandlers(): void {
  /**
   * 预览 PPT 导出配置
   * @param _event IPC 事件
   * @param request 预览请求参数
   * @returns 预览结果
   */
  ipcMain.handle('ppt:preview', async (_event, request: unknown) => {
    try {
      const parsedRequest = previewPptExportSchema.parse(request)

      logger.info('接收到 PPT 导出预览请求', 'main', {
        contentLength: parsedRequest.content.length,
        templateId: parsedRequest.templateId
      })

      return await getPptExportService().previewExport(
        parsedRequest.content,
        parsedRequest.templateId
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 导出预览处理失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: `预览失败: ${errorMessage}`
      }
    }
  })

  /**
   * 生成 PPT 文件
   * @param _event IPC 事件
   * @param request 生成请求参数
   * @returns 生成结果
   */
  ipcMain.handle('ppt:generate', async (_event, request: unknown) => {
    try {
      const parsedRequest = generatePptSchema.parse(request)

      logger.info('接收到 PPT 生成请求', 'main', {
        title: parsedRequest.title,
        slideCount: parsedRequest.config.slides.filter((s) => s.selected).length
      })

      return await getPptExportService().generatePpt(parsedRequest)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPT 生成处理失败', 'main', { error: errorMessage })

      return {
        success: false,
        error: `生成失败: ${errorMessage}`
      }
    }
  })

  /**
   * 从模板提取样式
   * @param _event IPC 事件
   * @param templateId 模板 ID
   * @returns 提取的样式配置
   */
  ipcMain.handle('ppt:extractTemplateStyle', async (_event, templateId: string) => {
    try {
      logger.info('接收到模板样式提取请求', 'main', { templateId })

      const extraction = await getPptExportService().loadTemplateExtraction(templateId)

      return {
        success: true,
        data: extraction
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('模板样式提取失败', 'main', { templateId, error: errorMessage })

      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
