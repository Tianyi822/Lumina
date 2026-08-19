import { ipcMain } from 'electron'
import { getDocumentManagerService } from '@main/services/document/DocumentManagerService'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'

/**
 * 注册文档处理相关的 IPC 处理程序
 * 处理文档的上传、解析等操作
 */
export function registerDocumentHandlers(): void {
  /**
   * 上传并解析单个文档
   * @param _event IPC 事件
   * @param fileData 文件数据（number[] 数组）
   * @returns 解析结果
   */
  ipcMain.handle(
    'document:uploadAndParse',
    async (_event, fileData: { data: number[]; name: string }) => {
      try {
        // 将 number[] 转换回 Buffer
        const buffer = Buffer.from(fileData.data)

        logger.info('接收到文档上传请求', 'main', {
          fileName: fileData.name,
          size: buffer.length
        })

        const result = await getDocumentManagerService().uploadAndParseDocument(
          buffer,
          fileData.name
        )

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('文档上传处理失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: t('notifications.document.processFailed', { reason: errorMessage })
        }
      }
    }
  )

  /**
   * 批量上传并解析文档
   * @param _event IPC 事件
   * @param files 文件列表
   * @returns 批量解析结果
   */
  ipcMain.handle(
    'document:uploadAndParseMultiple',
    async (_event, files: Array<{ data: number[]; name: string }>) => {
      try {
        logger.info('接收到批量文档上传请求', 'main', { fileCount: files.length })

        // 转换所有文件为 Buffer
        const fileBuffers = files.map((file) => ({
          data: Buffer.from(file.data),
          name: file.name
        }))

        const results = await getDocumentManagerService().uploadAndParseMultiple(fileBuffers)

        return {
          success: true,
          data: results
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('批量文档上传处理失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: t('notifications.document.batchProcessFailed', { reason: errorMessage })
        }
      }
    }
  )
}
