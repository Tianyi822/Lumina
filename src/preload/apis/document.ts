import { ipcRenderer } from 'electron'
import type { ExportMessageRequest, ExportMessageResult } from '@shared/types'

/**
 * 文档 API
 * 提供文档上传、解析等功能
 */
export const documentApi = {
  /**
   * 上传并解析单个文档
   * @param file 文件对象
   * @returns 解析结果
   */
  uploadAndParse: async (
    file: File
  ): Promise<{
    success: boolean
    data?: {
      fileName: string
      fileType: string
      fileSize: number
      parsedContent: string
    }
    error?: string
  }> => {
    // 将 File 对象转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const dataArray = Array.from(new Uint8Array(arrayBuffer))

    return ipcRenderer.invoke('document:uploadAndParse', {
      data: dataArray,
      name: file.name
    })
  },

  /**
   * 批量上传并解析文档
   * @param files 文件列表
   * @returns 批量解析结果
   */
  uploadAndParseMultiple: async (
    files: File[]
  ): Promise<{
    success: boolean
    data?: Array<{
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
    error?: string
  }> => {
    // 转换所有文件
    const fileDataArray = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer()
        return {
          data: Array.from(new Uint8Array(arrayBuffer)),
          name: file.name
        }
      })
    )

    return ipcRenderer.invoke('document:uploadAndParseMultiple', fileDataArray)
  },

  /**
   * 导出 AI 消息为目标格式
   * @param request 导出参数
   * @returns 导出结果
   */
  exportMessage: (request: ExportMessageRequest): Promise<ExportMessageResult> => {
    return ipcRenderer.invoke('document:exportMessage', request)
  }
}
