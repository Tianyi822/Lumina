import type { FileItem, FilePreviewData } from './knowledge'

/**
 * 文件上传的结果
 */
export interface FileUploadResult {
  success: boolean
  file?: FileItem
  error?: string
  isDuplicate?: boolean
}

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
 * 文件管理相关的 API
 */
export interface FileApi {
  /** 获取所有文件列表 */
  list: () => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  /** 根据 ID 获取文件 */
  getById: (id: string) => Promise<{ success: boolean; data?: FileItem; error?: string }>
  /** 搜索文件 */
  search: (query: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  /** 上传文件 */
  upload: (params: { data: Uint8Array; name: string }) => Promise<FileUploadResult>
  /** 删除文件 */
  delete: (fileId: string, forceDelete?: boolean) => Promise<{ success: boolean; error?: string }>
  /** 将文件关联到知识库 */
  linkToKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  /** 从知识库取消文件关联 */
  unlinkFromKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  /** 获取知识库关联的文件列表 */
  getByKBId: (kbId: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  /** 获取文件被引用的情况 */
  getUsage: (fileId: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
  /** 打开文件选择对话框，选择要上传的文件 */
  selectFiles: () => Promise<AttachmentFile[]>
  /** 获取文件预览内容 */
  preview: (fileId: string) => Promise<{ success: boolean; data?: FilePreviewData; error?: string }>
  /** 使用系统默认程序打开文件 */
  openExternal: (fileId: string) => Promise<{ success: boolean; error?: string }>
}
