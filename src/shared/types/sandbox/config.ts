import type { SandboxCreationType, SandboxData } from './core'
import type { ContainerState } from './container'

/**
 * Docker 配置存储类型
 */

/**
 * Dockerfile 配置元数据
 */
export interface DockerfileConfigMeta {
  /** 配置 ID */
  id: string
  /** 用户定义名称 */
  name: string
  /** 文件名（不含路径） */
  filename: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * Docker Compose 配置元数据
 */
export interface ComposeConfigMeta {
  /** 配置 ID */
  id: string
  /** 用户定义名称 */
  name: string
  /** 文件名（含 .yaml 后缀） */
  filename: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * Dockerfile 配置（完整，含内容）
 */
export interface DockerfileConfig extends DockerfileConfigMeta {
  /** Dockerfile 内容 */
  content: string
}

/**
 * Docker Compose 配置（完整，含内容）
 */
export interface ComposeConfig extends ComposeConfigMeta {
  /** YAML 内容 */
  content: string
}

/**
 * 配置元数据存储结构
 */
export interface DockerConfigMetadata {
  dockerfiles: DockerfileConfigMeta[]
  composes: ComposeConfigMeta[]
}

/**
 * 保存配置请求
 */
export interface SaveConfigRequest {
  /** 配置名称 */
  name: string
  /** 配置内容 */
  content: string
  /** 更新时指定的 ID */
  id?: string
}

/**
 * 保存配置结果
 */
export interface SaveConfigResult<T extends DockerfileConfigMeta | ComposeConfigMeta> {
  success: boolean
  config?: T
  error?: string
}

/**
 * 加载配置结果
 */
export interface LoadConfigResult<T extends DockerfileConfig | ComposeConfig> {
  success: boolean
  config?: T
  error?: string
}

/**
 * 列表配置结果
 */
export interface ListConfigResult<T extends DockerfileConfigMeta | ComposeConfigMeta> {
  success: boolean
  configs?: T[]
  error?: string
}

/**
 * 删除配置结果
 */
export interface DeleteConfigResult {
  success: boolean
  error?: string
}

/**
 * 沙箱配置快照
 */
export interface SandboxConfigurationSnapshot {
  sandbox: SandboxData
  creationType: SandboxCreationType
  containerState?: ContainerState
}
