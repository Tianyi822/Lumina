import { ipcRenderer } from 'electron'
import type {
  KnowledgeApi,
  KnowledgeBase,
  KnowledgeBaseStats,
  KnowledgeFileProgressEvent,
  KnowledgeIndexingStatus,
  KnowledgeReindexProgressEvent,
  KnowledgeReindexSummary,
  KnowledgeSearchResponse
} from '../types/knowledge'
import { createIpcListener } from './base'

/**
 * API 响应的通用格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 知识库相关的 API
 */
export const knowledgeApi: KnowledgeApi = {
  /**
   * 获取所有知识库
   */
  getAll: (): Promise<ApiResponse<KnowledgeBase[]>> => {
    return ipcRenderer.invoke('knowledge:getAll')
  },

  /**
   * 根据 ID 获取知识库
   */
  getById: (id: string): Promise<ApiResponse<KnowledgeBase>> => {
    return ipcRenderer.invoke('knowledge:getById', id)
  },

  /**
   * 创建知识库
   */
  create: (
    data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ApiResponse<KnowledgeBase>> => {
    return ipcRenderer.invoke('knowledge:create', data)
  },

  /**
   * 更新知识库
   */
  update: (
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ): Promise<ApiResponse<KnowledgeBase>> => {
    return ipcRenderer.invoke('knowledge:update', id, updates)
  },

  /**
   * 删除知识库
   */
  delete: (id: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('knowledge:delete', id)
  },

  /**
   * 将文件索引到知识库
   */
  indexFile: (
    kbId: string,
    fileId: string,
    filePath: string,
    fileName: string
  ): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('knowledge:indexFile', kbId, fileId, filePath, fileName)
  },

  /**
   * 从知识库移除文件的索引
   */
  removeFileIndex: (kbId: string, fileId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('knowledge:removeFileIndex', kbId, fileId)
  },

  /**
   * 重新索引整个知识库
   */
  reindex: (
    kbId: string,
    files: Array<{ fileId: string; filePath: string; fileName: string }>
  ): Promise<ApiResponse<KnowledgeReindexSummary>> => {
    return ipcRenderer.invoke('knowledge:reindex', kbId, files)
  },

  /**
   * 在知识库中搜索
   */
  search: (
    kbId: string,
    query: string,
    limit?: number
  ): Promise<ApiResponse<KnowledgeSearchResponse>> => {
    return ipcRenderer.invoke('knowledge:search', kbId, query, limit)
  },

  /**
   * 获取知识库的统计信息
   */
  getStats: (kbId: string): Promise<ApiResponse<KnowledgeBaseStats>> => {
    return ipcRenderer.invoke('knowledge:getStats', kbId)
  },

  /**
   * 获取知识库数据库的大小
   */
  getDBSize: (kbId: string): Promise<ApiResponse<{ size: number }>> => {
    return ipcRenderer.invoke('knowledge:getDBSize', kbId)
  },

  /**
   * 获取索引的状态
   */
  getIndexingStatus: (): Promise<ApiResponse<KnowledgeIndexingStatus>> => {
    return ipcRenderer.invoke('knowledge:getIndexingStatus')
  },

  /**
   * 停止知识库的索引操作
   */
  stopIndexing: (kbId: string): Promise<ApiResponse<{ stopped: boolean }>> => {
    return ipcRenderer.invoke('knowledge:stopIndexing', kbId)
  }
}

/**
 * 监听文件索引的进度事件
 */
export function onFileProgress(callback: (data: KnowledgeFileProgressEvent) => void): () => void {
  return createIpcListener<KnowledgeFileProgressEvent>('knowledge:file-progress', callback)
}

/**
 * 监听重新索引的进度事件
 */
export function onReindexProgress(
  callback: (data: KnowledgeReindexProgressEvent) => void
): () => void {
  return createIpcListener<KnowledgeReindexProgressEvent>('knowledge:reindex-progress', callback)
}
