import { ipcRenderer } from 'electron'

/**
 * 知识库配置
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingModel: string
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount?: number
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
  }
}
