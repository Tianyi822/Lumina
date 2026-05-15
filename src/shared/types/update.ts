/**
 * 自动更新相关类型定义
 * 跨进程共享：主进程服务 → IPC Handler → Preload → 渲染进程
 */

/** 更新状态 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

/** 下载进度 */
export interface DownloadProgress {
  /** 下载百分比 0-100 */
  percent: number
  /** 下载速度（bytes/s） */
  bytesPerSecond: number
  /** 已下载字节数 */
  transferred: number
  /** 总字节数 */
  total: number
}

/** 版本发布信息 */
export interface ReleaseInfo {
  /** 版本号（去掉 v 前缀，如 "1.2.0"） */
  version: string
  /** Git tag（如 "v1.2.0"） */
  tagName: string
  /** Release 标题 */
  name: string
  /** Release body 原始 Markdown */
  body: string
  /** GitHub release 页面链接 */
  htmlUrl: string
  /** 发布时间（ISO 8601） */
  publishedAt: string
  /** 是否为预发布 */
  isPrerelease: boolean
}

/** 更新诊断代码 */
export type UpdateDiagnosticCode =
  | 'metadata-missing'
  | 'asset-missing'
  | 'signature-invalid'
  | 'network-error'
  | 'unknown'

/** 检查更新结果 */
export interface CheckUpdateResult {
  success: boolean
  hasUpdate?: boolean
  version?: string
  releaseNotes?: string
  error?: string
  message?: string
  diagnosticCode?: UpdateDiagnosticCode
  manualDownloadUrl?: string
}

/** 状态变更事件 */
export interface UpdateStatusEvent {
  status: UpdateStatus
  version?: string
  releaseNotes?: string
  message?: string
  diagnosticCode?: UpdateDiagnosticCode
  manualDownloadUrl?: string
}
