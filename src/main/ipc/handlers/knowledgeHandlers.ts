import { ipcMain } from 'electron'
import { getKnowledgeService } from '@main/services/knowledge'
import { logger } from '@main/services/logger'
import type { KnowledgeBase } from '@shared/types/knowledge'

/**
 * 初始化知识库服务
 * 在应用启动时加载知识库数据
 */
export function initializeKnowledge(): void {
  try {
    getKnowledgeService().initialize()
    logger.info('知识库服务已初始化')
  } catch (error) {
    const errorMessage = `知识库服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
  }
}

/**
 * 注册知识库相关的 IPC 处理程序
 */
export function registerKnowledgeHandlers(): void {
  // 获取所有知识库
  ipcMain.handle('knowledge:getAll', () => {
    try {
      const knowledgeBases = getKnowledgeService().getAllKnowledgeBases()
      return {
        success: true,
        data: knowledgeBases
      }
    } catch (error) {
      const errorMessage = `获取知识库列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 根据ID获取知识库
  ipcMain.handle('knowledge:getById', (_event, id: string) => {
    try {
      const knowledgeBase = getKnowledgeService().getKnowledgeBaseById(id)
      if (!knowledgeBase) {
        return {
          success: false,
          error: '知识库不存在'
        }
      }
      return {
        success: true,
        data: knowledgeBase
      }
    } catch (error) {
      const errorMessage = `获取知识库失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 创建知识库
  ipcMain.handle(
    'knowledge:create',
    async (_event, data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        const newKB = getKnowledgeService().createKnowledgeBase(data)
        return {
          success: true,
          data: newKB
        }
      } catch (error) {
        const errorMessage = `创建知识库失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 更新知识库
  ipcMain.handle(
    'knowledge:update',
    async (_event, id: string, updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>) => {
      try {
        const updatedKB = getKnowledgeService().updateKnowledgeBase(id, updates)
        if (!updatedKB) {
          return {
            success: false,
            error: '知识库不存在'
          }
        }
        return {
          success: true,
          data: updatedKB
        }
      } catch (error) {
        const errorMessage = `更新知识库失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 删除知识库
  ipcMain.handle('knowledge:delete', async (_event, id: string) => {
    try {
      const success = getKnowledgeService().deleteKnowledgeBase(id)
      if (!success) {
        return {
          success: false,
          error: '知识库不存在'
        }
      }
      return {
        success: true
      }
    } catch (error) {
      const errorMessage = `删除知识库失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
