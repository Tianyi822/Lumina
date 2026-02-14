/**
 * 沙箱相关的类型定义
 */

/**
 * 沙箱状态
 */
export type SandboxStatus = 'creating' | 'running' | 'stopped' | 'error'

/**
 * 沙箱元数据
 */
export interface SandboxData {
  /** 沙箱唯一标识，格式: box-{timestamp}-{random} */
  sandboxId: string
  /** 沙箱名称 */
  name: string
  /** 沙箱描述 */
  description?: string
  /** Docker 镜像（预留） */
  image?: string
  /** 沙箱状态 */
  status: SandboxStatus
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 沙箱列表项
 */
export interface SandboxListItem {
  /** 沙箱唯一标识 */
  sandboxId: string
  /** 沙箱名称 */
  name: string
  /** 沙箱状态 */
  status: SandboxStatus
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 沙箱操作结果
 */
export interface SandboxResult {
  /** 操作是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 操作日志条目
 */
export interface SandboxLogEntry {
  /** 时间戳 */
  timestamp: string
  /** 日志级别 */
  level: 'info' | 'warn' | 'error'
  /** 日志内容 */
  message: string
}
