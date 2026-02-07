import { ipcMain } from 'electron'
import { getFileService } from '@main/services/file'
import { logger } from '@main/services/logger'
// FileItem type is not directly used in this file, but handlers return typed responses

// 初始化文件服务，在应用启动时加载文件数据
export function initializeFileService(): void {
  try {
    getFileService().initialize()
    logger.info('文件服务已初始化')
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
      const errorMessage = `获取文件列表失败: ${error instanceof Error ? error.message : String(error)}`
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
          error: '文件不存在'
        }
      }
      return {
        success: true,
        data: file
      }
    } catch (error) {
      const errorMessage = `获取文件失败: ${error instanceof Error ? error.message : String(error)}`
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
      const errorMessage = `搜索文件失败: ${error instanceof Error ? error.message : String(error)}`
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
      const errorMessage = `上传文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 删除文件，forceDelete 参数控制是否强制删除被知识库引用的文件
  ipcMain.handle('file:delete', (_event, fileId: string, forceDelete: boolean = false) => {
    try {
      const result = getFileService().deleteFile(fileId, forceDelete)
      return result
    } catch (error) {
      const errorMessage = `删除文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 将文件关联到指定知识库，建立文件和知识库之间的关系
  ipcMain.handle('file:linkToKB', (_event, fileId: string, kbId: string) => {
    try {
      const result = getFileService().linkFileToKB(fileId, kbId)
      return result
    } catch (error) {
      const errorMessage = `关联文件到知识库失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 从知识库取消文件关联，解除文件和知识库之间的关系
  ipcMain.handle('file:unlinkFromKB', (_event, fileId: string, kbId: string) => {
    try {
      const result = getFileService().unlinkFileFromKB(fileId, kbId)
      return result
    } catch (error) {
      const errorMessage = `取消文件关联失败: ${error instanceof Error ? error.message : String(error)}`
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
      const errorMessage = `获取知识库文件列表失败: ${error instanceof Error ? error.message : String(error)}`
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
      const errorMessage = `获取文件使用情况失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
