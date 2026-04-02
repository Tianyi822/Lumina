import { ipcRenderer } from 'electron'
import type { FileItem, FilePreviewData } from '@shared/types/knowledge'

/**
 * 选中的附件文件信息
 */
export interface AttachmentFile {
  /** 文件路径 */
  path: string
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
}

/**
 * API 响应的通用格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 文件上传的结果
 */
export interface FileUploadResult {
  success: boolean
  file?: FileItem
  error?: string
  /** 是否是重复的文件 */
  isDuplicate?: boolean
}

/**
 * 文件上传的参数
 */
export interface FileUploadParams {
  /** 文件数据 */
  data: Uint8Array
  /** 文件名 */
  name: string
}

/**
 * 文件管理相关的 API
 */
export const fileApi = {
  /**
   * 获取所有文件列表
   */
  list: (): Promise<ApiResponse<FileItem[]>> => {
    return ipcRenderer.invoke('file:list')
  },

  /**
   * 根据 ID 获取文件
   */
  getById: (id: string): Promise<ApiResponse<FileItem>> => {
    return ipcRenderer.invoke('file:getById', id)
  },

  /**
   * 搜索文件
   */
  search: (query: string): Promise<ApiResponse<FileItem[]>> => {
    return ipcRenderer.invoke('file:search', query)
  },

  /**
   * 上传文件
   */
  upload: (params: FileUploadParams): Promise<FileUploadResult> => {
    const dataArray = Array.from(params.data)
    return ipcRenderer.invoke('file:upload', { data: dataArray, name: params.name })
  },

  /**
   * 删除文件
   */
  delete: (fileId: string, forceDelete?: boolean): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:delete', fileId, forceDelete)
  },

  /**
   * 将文件关联到知识库
   */
  linkToKB: (fileId: string, kbId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:linkToKB', fileId, kbId)
  },

  /**
   * 从知识库取消文件关联
   */
  unlinkFromKB: (fileId: string, kbId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:unlinkFromKB', fileId, kbId)
  },

  /**
   * 获取知识库关联的文件列表
   */
  getByKBId: (kbId: string): Promise<ApiResponse<FileItem[]>> => {
    return ipcRenderer.invoke('file:getByKBId', kbId)
  },

  /**
   * 获取文件的使用情况，即哪些知识库正在使用
   */
  getUsage: (fileId: string): Promise<ApiResponse<string[]>> => {
    return ipcRenderer.invoke('file:getUsage', fileId)
  },

  /**
   * 打开文件选择对话框
   * @returns 选中的文件列表，如果取消则返回空数组
   */
  selectFiles: (): Promise<AttachmentFile[]> => {
    return ipcRenderer.invoke('file:selectFiles')
  },

  /**
   * 获取文件预览内容
   */
  preview: (fileId: string): Promise<ApiResponse<FilePreviewData>> => {
    return ipcRenderer.invoke('file:preview', fileId)
  },

  /**
   * 使用系统默认程序打开文件
   */
  openExternal: (fileId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:openExternal', fileId)
  }
}
