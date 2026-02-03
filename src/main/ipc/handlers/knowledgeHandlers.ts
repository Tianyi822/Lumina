import { ipcMain } from 'electron'
import { getKnowledgeService, type FileProcessingProgress } from '@main/services/knowledge'
import { getVectorDBService } from '@main/services/vector'
import { logger } from '@main/services/logger'
import { getMainWindow } from '@main/core/window'
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

  // 索引文件到知识库
  ipcMain.handle(
    'knowledge:indexFile',
    async (_event, kbId: string, fileId: string, filePath: string, fileName: string) => {
      try {
        const result = await getKnowledgeService().indexFile(
          kbId,
          fileId,
          filePath,
          fileName,
          (progress: FileProcessingProgress) => {
            const win = getMainWindow()
            if (win) {
              win.webContents.send('knowledge:file-progress', { kbId, progress })
            }
            logger.debug('文件索引进度', 'main', { kbId, fileId, progress })
          }
        )
        return result
      } catch (error) {
        const errorMessage = `索引文件失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 从知识库移除文件索引
  ipcMain.handle('knowledge:removeFileIndex', async (_event, kbId: string, fileId: string) => {
    try {
      const result = await getKnowledgeService().removeFileIndex(kbId, fileId)
      return result
    } catch (error) {
      const errorMessage = `移除文件索引失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 重新索引整个知识库
  ipcMain.handle(
    'knowledge:reindex',
    async (
      _event,
      kbId: string,
      files: Array<{ fileId: string; filePath: string; fileName: string }>
    ) => {
      try {
        const result = await getKnowledgeService().reindexKnowledgeBase(
          kbId,
          files,
          (progress) => {
            const win = getMainWindow()
            if (win) {
              win.webContents.send('knowledge:reindex-progress', { kbId, progress })
            }
            logger.debug('重新索引进度', 'main', { kbId, progress })
          },
          (fileProgress) => {
            const win = getMainWindow()
            if (win) {
              win.webContents.send('knowledge:file-progress', { kbId, progress: fileProgress })
            }
            logger.debug('文件索引进度', 'main', {
              kbId,
              fileId: fileProgress.fileId,
              progress: fileProgress
            })
          }
        )
        return {
          success: result.success,
          data: {
            indexedCount: result.indexedCount,
            failedFiles: result.failedFiles,
            failedErrors: result.failedErrors
          },
          error: result.error
        }
      } catch (error) {
        const errorMessage = `重新索引知识库失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 在知识库中搜索
  ipcMain.handle(
    'knowledge:search',
    async (_event, kbId: string, query: string, limit?: number) => {
      try {
        const result = await getKnowledgeService().search(kbId, query, limit)
        return result
      } catch (error) {
        const errorMessage = `搜索知识库失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 获取知识库统计信息
  ipcMain.handle('knowledge:getStats', async (_event, kbId: string) => {
    try {
      const result = await getKnowledgeService().getStats(kbId)
      return result
    } catch (error) {
      const errorMessage = `获取知识库统计失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 获取知识库向量数据库大小
  ipcMain.handle('knowledge:getDBSize', (_event, kbId: string) => {
    try {
      const size = getVectorDBService().getDatabaseSize(kbId)
      return {
        success: true,
        data: { size }
      }
    } catch (error) {
      const errorMessage = `获取数据库大小失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 获取索引状态
  ipcMain.handle('knowledge:getIndexingStatus', () => {
    try {
      const service = getKnowledgeService()
      return {
        success: true,
        data: {
          isIndexing: service.isIndexing(),
          indexingFiles: service.getIndexingFiles()
        }
      }
    } catch (error) {
      const errorMessage = `获取索引状态失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
