import { ipcMain } from 'electron'
import { getKnowledgeServiceManager, type FileProcessingProgress } from '@main/services/knowledge'
import { getVectorDBService } from '@main/services/vector'
import { logger } from '@main/services/logger'
import { getMainWindow } from '@main/core/window'
import { getFileService } from '@main/services/file/FileService'
import type { KnowledgeBase } from '@shared/types/knowledge'

// 初始化知识库服务，在应用启动时加载知识库数据
export function initializeKnowledge(): void {
  try {
    getKnowledgeServiceManager().initialize()
    logger.info('知识库服务已初始化')
  } catch (error) {
    const errorMessage = `知识库服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
  }
}

// 注册知识库相关的 IPC 处理程序，处理知识库的增删改查、文件索引和搜索等操作
export function registerKnowledgeHandlers(): void {
  // 获取所有知识库列表
  ipcMain.handle('knowledge:getAll', () => {
    try {
      const knowledgeBases = getKnowledgeServiceManager().getAllKnowledgeBases()
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

  // 根据知识库 ID 获取知识库详情
  ipcMain.handle('knowledge:getById', (_event, id: string) => {
    try {
      const knowledgeBase = getKnowledgeServiceManager().getKnowledgeBaseById(id)
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

  // 创建新的知识库
  ipcMain.handle(
    'knowledge:create',
    async (_event, data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        const newKB = getKnowledgeServiceManager().createKnowledgeBase(data)
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

  // 更新知识库信息
  ipcMain.handle(
    'knowledge:update',
    async (_event, id: string, updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>) => {
      try {
        const updatedKB = getKnowledgeServiceManager().updateKnowledgeBase(id, updates)
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
      const result = getKnowledgeServiceManager().deleteKnowledgeBase(id)
      return result
    } catch (error) {
      const errorMessage = `删除知识库失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 停止知识库的索引任务
  ipcMain.handle('knowledge:stopIndexing', async (_event, kbId: string) => {
    try {
      const success = getKnowledgeServiceManager().stopKnowledgeBaseIndexing(kbId)
      return {
        success,
        data: { stopped: success }
      }
    } catch (error) {
      const errorMessage = `停止知识库索引失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 索引文件到知识库，使用队列控制并发以避免多个知识库同时索引导致阻塞
  ipcMain.handle(
    'knowledge:indexFile',
    async (_event, kbId: string, fileId: string, filePath: string, fileName: string) => {
      try {
        const kb = getKnowledgeServiceManager().getKnowledgeBaseById(kbId)
        if (!kb) {
          return { success: false, error: '知识库不存在' }
        }

        const manager = getKnowledgeServiceManager()
        const service = manager.getOrCreateInstance(kbId, kb)

        // 使用队列执行索引任务，避免多个知识库同时索引导致阻塞
        const result = await manager.executeIndexingTask(kbId, () =>
          service.indexFile(
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
        )
        return result as { success: boolean; error?: string }
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
      const kb = getKnowledgeServiceManager().getKnowledgeBaseById(kbId)
      if (!kb) {
        return { success: false, error: '知识库不存在' }
      }

      const service = getKnowledgeServiceManager().getOrCreateInstance(kbId, kb)
      const result = await service.removeFileIndex(kbId, fileId)
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

  // 重新索引整个知识库，使用队列控制并发以避免多个知识库同时索引导致阻塞
  ipcMain.handle(
    'knowledge:reindex',
    async (
      _event,
      kbId: string,
      files: Array<{ fileId: string; filePath: string; fileName: string }>
    ) => {
      try {
        const kb = getKnowledgeServiceManager().getKnowledgeBaseById(kbId)
        if (!kb) {
          return { success: false, error: '知识库不存在' }
        }

        const manager = getKnowledgeServiceManager()
        const service = manager.getOrCreateInstance(kbId, kb)

        // 使用队列执行重新索引任务，避免多个知识库同时索引导致阻塞
        const result = await manager.executeIndexingTask(kbId, () =>
          service.reindexKnowledgeBase(
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
        )
        // result 直接是 reindexKnowledgeBase 的返回类型
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

  // 在知识库中搜索相关内容
  ipcMain.handle(
    'knowledge:search',
    async (_event, kbId: string, query: string, limit?: number) => {
      try {
        const kb = getKnowledgeServiceManager().getKnowledgeBaseById(kbId)
        if (!kb) {
          return { success: false, error: '知识库不存在' }
        }

        const service = getKnowledgeServiceManager().getOrCreateInstance(kbId, kb)
        const result = await service.search(kbId, query, limit)
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

  // 获取知识库的统计信息，包括文档数量、向量数量等
  ipcMain.handle('knowledge:getStats', async (_event, kbId: string) => {
    try {
      const kb = getKnowledgeServiceManager().getKnowledgeBaseById(kbId)
      if (!kb) {
        return { success: false, error: '知识库不存在' }
      }

      const service = getKnowledgeServiceManager().getOrCreateInstance(kbId, kb)
      const result = await service.getStats(kbId)
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

  // 获取知识库向量数据库的大小
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

  // 获取索引状态，包括正在索引的知识库、文件列表和进度信息
  ipcMain.handle('knowledge:getIndexingStatus', () => {
    try {
      const manager = getKnowledgeServiceManager()
      const activeStatusMap = manager.getAllActiveStatus()

      // 构建正在索引的文件列表（包含进度信息）
      const indexingFiles: Array<{
        kbId: string
        fileId: string
        fileName: string
        progress?: number
        status?: string
      }> = []
      for (const [kbId, status] of activeStatusMap) {
        for (const fileId of status.indexingFiles) {
          // 尝试获取文件名
          let fileName = fileId
          try {
            const fileService = getFileService()
            const file = fileService.getFileById(fileId)
            if (file) {
              fileName = file.name
            }
          } catch {
            // 忽略错误，使用 fileId 作为文件名
          }
          // 获取进度信息
          const progress = status.fileProgress.get(fileId)
          indexingFiles.push({
            kbId,
            fileId,
            fileName,
            progress: progress?.progress,
            status: progress?.status
          })
        }
      }

      return {
        success: true,
        data: {
          isIndexing: manager.getActiveIndexingKbId() !== null,
          indexingFiles,
          activeStatusMap: Array.from(activeStatusMap.entries()),
          activeIndexingKbId: manager.getActiveIndexingKbId(),
          queueLength: manager.getIndexingQueueLength()
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
