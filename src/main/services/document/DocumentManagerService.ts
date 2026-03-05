import { logger } from '@main/services/logger'
import { getDocumentParserService, DocumentParserService } from './DocumentParserService'

/**
 * 文档管理服务
 * 提供文档上传、解析的完整流程
 * 所有文件都是临时处理，不保存到持久化存储
 */
export class DocumentManagerService {
  private parserService: DocumentParserService
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  constructor() {
    this.parserService = getDocumentParserService()
  }

  /**
   * 上传并解析文档
   * @param fileData 文件数据（Buffer）
   * @param fileName 文件名
   * @returns 解析结果
   */
  async uploadAndParseDocument(
    fileData: Buffer,
    fileName: string
  ): Promise<{
    success: boolean
    data?: {
      fileName: string
      fileType: string
      fileSize: number
      parsedContent: string
    }
    error?: string
  }> {
    // 获取文件扩展名（在 try 块外定义，以便在 catch 中访问）
    const ext = this.getFileExtension(fileName)

    try {
      // 1. 检查文件大小
      if (fileData.length > this.MAX_FILE_SIZE) {
        return {
          success: false,
          error: `文件过大（${this.formatFileSize(fileData.length)}），最大支持 10MB。建议使用知识库功能处理大文件。`
        }
      }

      // 2. 检查文件类型
      const supportedTypes = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv', '.pptx']
      if (!supportedTypes.includes(ext)) {
        return {
          success: false,
          error: `不支持的文件类型: ${ext}，仅支持 ${supportedTypes.join(', ')}`
        }
      }

      logger.info('开始上传并解析文档', 'main', {
        fileName,
        fileSize: fileData.length,
        fileType: ext
      })

      // 3. 解析文档内容
      const parsedContent = await this.parserService.parseDocument(fileData, fileName)

      // 4. 返回解析结果
      const result = {
        success: true,
        data: {
          fileName,
          fileType: ext.replace('.', ''),
          fileSize: fileData.length,
          parsedContent
        }
      }

      logger.info('文档上传并解析成功', 'main', {
        fileName,
        fileType: ext,
        contentLength: parsedContent.length
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error('文档上传或解析失败', 'main', {
        fileName,
        fileSize: fileData.length,
        fileType: ext,
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined
      })

      let userMessage = `文档处理失败: ${errorMessage}`

      if (errorMessage.includes('内存不足') || errorMessage.includes('memory')) {
        userMessage = '文件过大导致内存不足，请使用知识库功能处理大文件'
      } else if (errorMessage.includes('格式无效') || errorMessage.includes('已损坏')) {
        userMessage = '文件格式无效或已损坏，请检查文件是否正常'
      }

      return {
        success: false,
        error: userMessage
      }
    }
  }

  /**
   * 批量解析文档
   * @param files 文件列表
   * @returns 批量解析结果
   */
  async uploadAndParseMultiple(files: Array<{ data: Buffer; name: string }>): Promise<
    Array<{
      fileName: string
      success: boolean
      data?: {
        fileName: string
        fileType: string
        fileSize: number
        parsedContent: string
      }
      error?: string
    }>
  > {
    const results = await Promise.all(
      files.map(async (file) => {
        const result = await this.uploadAndParseDocument(file.data, file.name)
        return {
          fileName: file.name,
          ...result
        }
      })
    )

    const successCount = results.filter((r) => r.success).length
    logger.info('批量文档处理完成', 'main', {
      total: files.length,
      success: successCount,
      failed: files.length - successCount
    })

    return results
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.')
    return lastDotIndex === -1 ? '' : fileName.substring(lastDotIndex).toLowerCase()
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

// ==================== 单例实例 ====================
let documentManagerServiceInstance: DocumentManagerService | null = null

/**
 * 获取文档管理服务单例
 */
export function getDocumentManagerService(): DocumentManagerService {
  if (!documentManagerServiceInstance) {
    documentManagerServiceInstance = new DocumentManagerService()
  }
  return documentManagerServiceInstance
}
