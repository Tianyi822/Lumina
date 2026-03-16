import type { FileItem } from './knowledge'

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
  list: () => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  getById: (id: string) => Promise<{ success: boolean; data?: FileItem; error?: string }>
  search: (query: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  upload: (params: { data: Uint8Array; name: string }) => Promise<FileUploadResult>
  delete: (fileId: string, forceDelete?: boolean) => Promise<{ success: boolean; error?: string }>
  linkToKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  unlinkFromKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  getByKBId: (kbId: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  getUsage: (fileId: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
  /** 打开文件选择对话框 */
  selectFiles: () => Promise<AttachmentFile[]>
}
