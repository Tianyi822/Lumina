import { ipcMain, shell } from 'electron'
import { getFileService } from '@main/services/file'
import { t } from '@main/services/i18n'
import { getPaperService } from '@main/services/paper'
import { logger } from '@main/services/logger'
// FileItem type is not directly used in this file, but handlers return typed responses

// 初始化文件服务，在应用启动时加载文件数据
export async function initializeFileService(): Promise<void> {
  try {
    await getFileService().initialize()
    logger.info('文件服务已初始化')

    void getPaperService()
      .repairAllPaperResources()
      .then((repairResult) => {
        if (repairResult.success) {
          logger.info('论文资源池修复完成', 'main', {
            repairedPapers: repairResult.repairedPapers,
            paperFilesRepaired: repairResult.paperFilesRepaired,
            noteFilesRepaired: repairResult.noteFilesRepaired,
            affectedKnowledgeBaseCount: repairResult.affectedKnowledgeBaseCount
          })
        } else {
          logger.warn('论文资源池修复未完全完成', 'main', {
            failedPaperIds: repairResult.failedPaperIds,
            error: repairResult.error
          })
        }
      })
      .catch((error) => {
        logger.warn('论文资源池修复失败', 'main', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
  } catch (error) {
    const errorMessage = `文件服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
  }
}

// 注册文件管理相关的 IPC 处理程序，处理文件的上传、删除、搜索和知识库关联等操作
export function registerFileHandlers(): void {
  // 获取所有文件列表
  ipcMain.handle('file:list', () => {
    try {
      const files = getFileService().getAllFiles()
      return {
        success: true,
        data: files
      }
    } catch (error) {
      const errorMessage = t('notifications.file.fetchListFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 根据文件 ID 获取文件信息
  ipcMain.handle('file:getById', (_event, id: string) => {
    try {
      const file = getFileService().getFileById(id)
      if (!file) {
        return {
          success: false,
          error: t('notifications.file.fileNotFound')
        }
      }
      return {
        success: true,
        data: file
      }
    } catch (error) {
      const errorMessage = t('notifications.file.fetchOneFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 搜索文件，支持按文件名或其他属性匹配
  ipcMain.handle('file:search', (_event, query: string) => {
    try {
      const files = getFileService().searchFiles(query)
      return {
        success: true,
        data: files
      }
    } catch (error) {
      const errorMessage = t('notifications.file.searchFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 上传文件，接收文件数据和文件名，保存到文件系统
  ipcMain.handle('file:upload', async (_event, fileData: { data: number[]; name: string }) => {
    try {
      // 将 number[] 转换回 Buffer
      const buffer = Buffer.from(fileData.data)
      const result = await getFileService().uploadFile(buffer, fileData.name)
      return result
    } catch (error) {
      const errorMessage = t('notifications.file.uploadFileFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 删除文件，forceDelete 参数控制是否强制删除被知识库引用的文件
  ipcMain.handle('file:delete', async (_event, fileId: string, forceDelete: boolean = false) => {
    try {
      const result = await getFileService().deleteFile(fileId, forceDelete)
      return result
    } catch (error) {
      const errorMessage = t('notifications.file.deleteFileFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 将文件关联到指定知识库，建立文件和知识库之间的关系
  ipcMain.handle('file:linkToKB', async (_event, fileId: string, kbId: string) => {
    try {
      const result = await getFileService().linkFileToKB(fileId, kbId)
      return result
    } catch (error) {
      const errorMessage = t('notifications.file.linkToKbFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 从知识库取消文件关联，解除文件和知识库之间的关系
  ipcMain.handle('file:unlinkFromKB', async (_event, fileId: string, kbId: string) => {
    try {
      const result = await getFileService().unlinkFileFromKB(fileId, kbId)
      return result
    } catch (error) {
      const errorMessage = t('notifications.file.unlinkFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 获取知识库关联的所有文件列表
  ipcMain.handle('file:getByKBId', (_event, kbId: string) => {
    try {
      const files = getFileService().getFilesByKBId(kbId)
      return {
        success: true,
        data: files
      }
    } catch (error) {
      const errorMessage = t('notifications.file.fetchKbFilesFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 获取文件的使用情况，包括被哪些知识库引用等信息
  ipcMain.handle('file:getUsage', (_event, fileId: string) => {
    try {
      const usage = getFileService().getFileUsage(fileId)
      return {
        success: true,
        data: usage
      }
    } catch (error) {
      const errorMessage = t('notifications.file.fetchUsageFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 打开文件选择对话框，支持多选文件
  ipcMain.handle('file:selectFiles', async () => {
    try {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: t('notifications.file.fileTypeDocument'),
            extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv']
          },
          { name: t('notifications.file.fileTypeAll'), extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return []
      }
      // 获取文件信息
      const fs = await import('fs')
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const stats = await fs.promises.stat(filePath)
          return {
            path: filePath,
            name: filePath.split('/').pop() || filePath.split('\\').pop() || filePath,
            size: stats.size
          }
        })
      )
      return files
    } catch (error) {
      const errorMessage = `选择文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return []
    }
  })

  // 获取文件预览内容
  ipcMain.handle('file:preview', async (_event, fileId: string) => {
    try {
      const file = getFileService().getFileById(fileId)
      if (!file) {
        return { success: false, error: t('notifications.file.fileNotFound') }
      }

      const result = await getFileService().readFileResourcePreview(fileId)
      return result
    } catch (error) {
      const errorMessage = t('notifications.file.fetchPreviewFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // 使用系统默认程序打开文件
  ipcMain.handle('file:openExternal', async (_event, fileId: string) => {
    try {
      const file = getFileService().getFileById(fileId)
      if (!file) {
        return { success: false, error: t('notifications.file.fileNotFound') }
      }

      if (file.origin?.allowExternalOpen === false || !file.absolutePath) {
        return { success: false, error: t('notifications.file.externalOpenUnsupported') }
      }

      const result = await shell.openPath(file.absolutePath)
      if (result === '') {
        return { success: true }
      } else {
        return {
          success: false,
          error: t('notifications.file.openFailed', { error: result })
        }
      }
    } catch (error) {
      const errorMessage = t('notifications.file.openFailed', {
        error: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  })
}
