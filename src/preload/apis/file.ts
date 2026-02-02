import { ipcRenderer } from 'electron'
import type { FileItem } from '@shared/types/knowledge'

/**
 * API 响应基础类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 文件上传结果
 */
export interface FileUploadResult {
  success: boolean
  file?: FileItem
  error?: string
  /** 是否是重复文件 */
  isDuplicate?: boolean
}

/**
 * 文件上传参数
 */
export interface FileUploadParams {
  /** 文件数据（Uint8Array） */
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
   * 根据ID获取文件
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
   * @param params 上传参数
   */
  upload: (params: FileUploadParams): Promise<FileUploadResult> => {
    // 将 Uint8Array 转换为 number[] 以便 IPC 传输
    const dataArray = Array.from(params.data)
    return ipcRenderer.invoke('file:upload', { data: dataArray, name: params.name })
  },

  /**
   * 删除文件
   * @param fileId 文件ID
   * @param forceDelete 是否强制删除（即使被知识库使用）
   */
  delete: (fileId: string, forceDelete?: boolean): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:delete', fileId, forceDelete)
  },

  /**
   * 将文件关联到知识库
   * @param fileId 文件ID
   * @param kbId 知识库ID
   */
  linkToKB: (fileId: string, kbId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:linkToKB', fileId, kbId)
  },

  /**
   * 从知识库取消文件关联
   * @param fileId 文件ID
   * @param kbId 知识库ID
   */
  unlinkFromKB: (fileId: string, kbId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('file:unlinkFromKB', fileId, kbId)
  },

  /**
   * 获取知识库关联的文件列表
   * @param kbId 知识库ID
   */
  getByKBId: (kbId: string): Promise<ApiResponse<FileItem[]>> => {
    return ipcRenderer.invoke('file:getByKBId', kbId)
  },

  /**
   * 获取文件使用情况（哪些知识库正在使用）
   * @param fileId 文件ID
   */
  getUsage: (fileId: string): Promise<ApiResponse<string[]>> => {
    return ipcRenderer.invoke('file:getUsage', fileId)
  }
}
