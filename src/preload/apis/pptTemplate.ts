import { ipcRenderer } from 'electron'
import type {
  PptTemplateListItem,
  PptTemplateListResponse,
  CreatePptTemplateResult,
  CreatePptTemplateRequest,
  PptTemplateAnalysis
} from '@shared/types/ppt-template'

/**
 * API 响应的通用格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PptTemplateSourceData {
  data: number[]
}

/**
 * PPT 模板 API
 * 提供模板列表查询、创建、删除和分析结果查询功能
 */
export const pptTemplateApi = {
  /**
   * 获取模板列表
   * @returns 模板列表响应
   */
  list: (): Promise<PptTemplateListResponse> => {
    return ipcRenderer.invoke('pptTemplate:list')
  },

  /**
   * 根据 ID 获取模板
   * @param id 模板 ID
   * @returns 模板信息
   */
  getById: (id: string): Promise<ApiResponse<PptTemplateListItem>> => {
    return ipcRenderer.invoke('pptTemplate:getById', id)
  },

  /**
   * 获取模板分析结果
   * @param id 模板 ID
   * @returns 分析结果
   */
  getAnalysis: (id: string): Promise<ApiResponse<PptTemplateAnalysis>> => {
    return ipcRenderer.invoke('pptTemplate:getAnalysis', id)
  },

  /**
   * 获取模板源文件
   * @param id 模板 ID
   * @returns 模板二进制数据
   */
  getSourceData: (id: string): Promise<ApiResponse<PptTemplateSourceData>> => {
    return ipcRenderer.invoke('pptTemplate:getSourceData', id)
  },

  /**
   * 上传并创建新模板
   * @param file 文件对象
   * @param name 模板名称（可选）
   * @returns 创建结果
   */
  create: async (file: File, name?: string): Promise<CreatePptTemplateResult> => {
    // 将 File 对象转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const dataArray = Array.from(new Uint8Array(arrayBuffer))
    const request: CreatePptTemplateRequest = name ? { name } : {}

    return ipcRenderer.invoke('pptTemplate:create', { data: dataArray, name: file.name }, request)
  },

  /**
   * 删除模板
   * @param templateId 模板 ID
   * @returns 删除结果
   */
  delete: (templateId: string): Promise<ApiResponse<void>> => {
    return ipcRenderer.invoke('pptTemplate:delete', templateId)
  }
}
