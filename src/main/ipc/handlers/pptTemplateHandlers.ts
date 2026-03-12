/**
 * PPT 模板相关的 IPC 处理程序
 * 处理模板列表、创建、删除等操作
 */

import { ipcMain } from 'electron'
import { getPptTemplateService } from '@main/services/presentation'
import { logger } from '@main/services/logger'
import type { CreatePptTemplateRequest } from '@shared/types/ppt-template'

/**
 * 初始化 PPT 模板服务
 * 在应用启动时调用
 */
export function initializePptTemplateService(): void {
  try {
    getPptTemplateService().initialize()
    logger.info('PPT 模板服务已初始化')
  } catch (error) {
    const errorMessage = `PPT 模板服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
  }
}

/**
 * 注册 PPT 模板相关的 IPC 处理程序
 */
export function registerPptTemplateHandlers(): void {
  // 获取所有模板列表
  ipcMain.handle('pptTemplate:list', () => {
    try {
      const templates = getPptTemplateService().getAllTemplates()
      return {
        success: true,
        data: templates
      }
    } catch (error) {
      const errorMessage = `获取模板列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 根据 ID 获取模板
  ipcMain.handle('pptTemplate:getById', (_event, id: string) => {
    try {
      const template = getPptTemplateService().getTemplateById(id)
      if (!template) {
        return {
          success: false,
          error: '模板不存在'
        }
      }
      return {
        success: true,
        data: template
      }
    } catch (error) {
      const errorMessage = `获取模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 获取模板分析结果
  ipcMain.handle('pptTemplate:getAnalysis', (_event, id: string) => {
    try {
      const analysis = getPptTemplateService().getTemplateAnalysis(id)
      if (!analysis) {
        return {
          success: false,
          error: '模板分析结果不存在'
        }
      }
      return {
        success: true,
        data: analysis
      }
    } catch (error) {
      const errorMessage = `获取模板分析结果失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 创建模板
  ipcMain.handle(
    'pptTemplate:create',
    async (
      _event,
      fileData: { data: number[]; name: string },
      request: CreatePptTemplateRequest
    ) => {
      try {
        // 将 number[] 转换回 Buffer
        const buffer = Buffer.from(fileData.data)
        const result = await getPptTemplateService().createTemplate(buffer, fileData.name, request)
        return result
      } catch (error) {
        const errorMessage = `创建模板失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 删除模板
  ipcMain.handle('pptTemplate:delete', (_event, templateId: string) => {
    try {
      const result = getPptTemplateService().deleteTemplate(templateId)
      return result
    } catch (error) {
      const errorMessage = `删除模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
