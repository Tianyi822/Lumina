/**
 * 实验室基础类型
 */

/**
 * 平台类型
 */
export type PlatformType = 'darwin' | 'win32' | 'linux'

/**
 * 实验室后端类型
 */
export type LabBackendType = 'ssh'

/**
 * 实验室状态
 */
export type LabStatus = 'creating' | 'running' | 'stopped' | 'error'

/**
 * 实验室创建类型
 */
export type LabCreationType = 'ssh'

/**
 * SSH 实验室配置（LabData 中的 ssh 字段）
 */
export interface SshLabConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  keyName?: string
  connected?: boolean
  lastConnectedAt?: string
}

/**
 * 实验室元数据
 */
export interface LabData {
  /** 实验室唯一标识，格式: lab-{timestamp}-{random} */
  labId: string
  /** 实验室名称 */
  name: string
  /** 实验室描述 */
  description?: string
  /** 实验室状态 */
  status: LabStatus
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
  /** 实验室创建类型 */
  creationType: LabCreationType
  /** 关联的容器 ID 列表 */
  containerIds: string[]
  /** 后端类型 */
  backendType: LabBackendType
  /** SSH 专属配置 */
  ssh?: SshLabConfig
}

/**
 * 实验室列表项
 */
export interface LabListItem {
  /** 实验室唯一标识 */
  labId: string
  /** 实验室名称 */
  name: string
  /** 实验室状态 */
  status: LabStatus
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
  /** 实验室创建类型 */
  creationType: LabCreationType
}

/**
 * 实验室操作结果
 */
export interface LabResult {
  /** 操作是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 操作日志条目
 */
export interface LabLogEntry {
  /** 时间戳 */
  timestamp: string
  /** 日志级别 */
  level: 'info' | 'warn' | 'error'
  /** 日志内容 */
  message: string
}

/**
 * 创建实验室请求
 */
export interface CreateLabRequest {
  /** 实验室名称 */
  name: string
  /** 实验室描述（可选） */
  description?: string
  /** 创建类型 */
  creationType: LabCreationType
  /** SSH 主机地址 */
  sshHost?: string
  /** SSH 端口（默认 22） */
  sshPort?: number
  /** SSH 用户名 */
  sshUsername?: string
  /** SSH 认证类型 */
  sshAuthType?: 'password' | 'key'
  /** SSH 密钥名称 */
  sshKeyName?: string
}

/**
 * 创建实验室结果
 */
export interface CreateLabResult {
  /** 是否成功 */
  success: boolean
  /** 创建的实验室数据 */
  lab?: LabData
  /** 错误信息 */
  error?: string
}

/**
 * 删除实验室选项
 */
export interface DeleteLabOptions {
  /** 是否强制删除 */
  force?: boolean
}

/**
 * 删除实验室结果
 */
export interface DeleteLabResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}
