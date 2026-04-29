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
  /** 错误信息 */
  error?: string
}
