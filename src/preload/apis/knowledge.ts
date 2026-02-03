import { ipcRenderer } from 'electron'
import type { SearchResult } from '@main/services/vector'

/**
 * 嵌入模型配置
 */
export interface KnowledgeBaseEmbeddingConfig {
  baseUrl: string
  apiKey?: string
  model: string
  dimensions: number
}

/**
 * 知识库配置
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingConfig: KnowledgeBaseEmbeddingConfig
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount?: number
  linkedFileIds: string[]
}

/**
 * API 响应基础类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 搜索结果响应
 */
export interface SearchResponse {
  results?: SearchResult[]
}

/**
 * 重新索引响应
 */
export interface ReindexResponse {
  indexedCount: number
  failedFiles: string[]
  failedErrors?: string[]
}

/**
 * 知识库统计信息
 */
export interface KnowledgeBaseStats {
  fileCount: number
  chunkCount: number
  dbSize: number
}

/**
 * 知识库相关的 API
 */
export const knowledgeApi = {
  /**
   * 获取所有知识库
   */
  getAll: (): Promise<ApiResponse<KnowledgeBase[]>> => {
    return ipcRenderer.invoke('knowledge:getAll')
  },

  /**
   * 根据ID获取知识库
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
   * 索引文件到知识库
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
   * 从知识库移除文件索引
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
  ): Promise<ApiResponse<ReindexResponse>> => {
    return ipcRenderer.invoke('knowledge:reindex', kbId, files)
  },

  /**
   * 在知识库中搜索
   */
  search: (kbId: string, query: string, limit?: number): Promise<ApiResponse<SearchResponse>> => {
    return ipcRenderer.invoke('knowledge:search', kbId, query, limit)
  },

  /**
   * 获取知识库统计信息
   */
  getStats: (kbId: string): Promise<ApiResponse<KnowledgeBaseStats>> => {
    return ipcRenderer.invoke('knowledge:getStats', kbId)
  },

  /**
   * 获取知识库数据库大小
   */
  getDBSize: (kbId: string): Promise<ApiResponse<{ size: number }>> => {
    return ipcRenderer.invoke('knowledge:getDBSize', kbId)
  }
}
