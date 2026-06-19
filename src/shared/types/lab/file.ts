/**
 * 单个文件写入请求
 */
export interface FileWriteRequest {
  /** 容器内相对工作目录的路径，如 src/App.vue */
  path: string
  /** 文件内容 */
  content: string
}

/**
 * 批量文件写入选项
 */
export interface WriteProjectFilesOptions {
  /** 实验室 ID */
  labId: string
  /** 容器内项目根目录，默认 /app */
  projectRoot?: string
  /** 文件列表 */
  files: FileWriteRequest[]
  /** 进度回调，每完成一个文件写入或到达关键里程碑时调用 */
  onProgress?: (message: string) => void
}

/**
 * 批量文件写入结果
 */
export interface FileWriteResult {
  /** 是否成功 */
  success: boolean
  /** 成功写入数量 */
  writtenCount: number
  /** 失败的文件 */
  failedFiles?: string[]
  /** 逐文件错误详情 */
  failedFileDetails?: FileWriteEntryResult[]
  /** 错误信息 */
  error?: string
}

/**
 * 单文件写入结果
 */
export interface FileWriteEntryResult {
  /** 文件路径 */
  path: string
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 文件读取结果
 */
export interface FileReadResult {
  /** 是否成功 */
  success: boolean
  /** 文件路径 */
  path?: string
  /** 文件大小（字节） */
  size?: number
  /** 文件内容 */
  content?: string
  /** 是否被截断 */
  truncated?: boolean
  /** 截断前的总字节数 */
  totalBytes?: number
  /** 错误信息 */
  error?: string
}

/**
 * 文件列表条目
 */
export interface FileListEntry {
  /** 名称 */
  name: string
  /** 类型 */
  type: 'file' | 'dir'
  /** 大小（字节，文件才有） */
  size?: number
}

/**
 * 文件列表结果
 */
export interface FileListResult {
  /** 是否成功 */
  success: boolean
  /** 列表路径 */
  path?: string
  /** 条目列表 */
  entries?: FileListEntry[]
  /** 是否被截断（超过 max_entries） */
  truncated?: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 文件删除结果
 */
export interface FileDeleteResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}
