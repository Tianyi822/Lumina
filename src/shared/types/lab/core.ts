/**
 * 实验室基础类型
 */
import type { ContainerState, PortMapping } from './container'
import type { FrontendWorkspaceMetadata } from './frontend'

/**
 * 平台类型
 */
export type PlatformType = 'darwin' | 'win32' | 'linux'

/**
 * 实验室后端类型
 */
export type LabBackendType = 'docker' | 'ssh'

/**
 * 实验室状态
 */
export type LabStatus = 'creating' | 'running' | 'stopped' | 'error'

/**
 * 实验室创建类型
 */
export type LabCreationType = 'existing' | 'compose' | 'dockerfile' | 'ssh'

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
  /** Docker 镜像（预留） */
  image?: string
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
  /** 主容器 ID（用于多容器场景） */
  primaryContainerId?: string
  /** Compose 项目名称 */
  composeProjectName?: string
  /** Compose 配置文件路径 */
  composeFilePath?: string
  /** Dockerfile 配置 ID */
  dockerfileConfigId?: string
  /** 前端项目元数据 */
  frontend?: FrontendWorkspaceMetadata
  /** 端口映射配置（用于 dockerfile/compose 类型实验室） */
  portMappings?: PortMapping[]
  /** 是否为孤立实验室（容器已丢失） */
  isOrphan?: boolean
  /** 后端类型，默认 'docker' */
  backendType: LabBackendType
  /** SSH 专属配置（仅 backendType === 'ssh' 时有效） */
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
  /** 是否为孤立实验室（容器已丢失） */
  isOrphan?: boolean
  /** 关联的容器数量 */
  containerCount: number
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
 * 创建实验室配置
 */
export interface CreateLabConfig {
  type: 'compose' | 'dockerfile' | 'template'
  name: string
  content: string
  templateId?: string
  variables?: Record<string, string>
}

/**
 * Docker 可用性状态
 */
export interface DockerStatus {
  /** Docker 是否可用 */
  available: boolean
  /** Docker CLI 是否已安装（daemon 不可用时通过 CLI 回退检测） */
  installed: boolean
  /** Docker 版本 */
  version?: string
  /** 错误信息 */
  error?: string
}

/**
 * 实验室选择
 */
export interface LabSelection {
  /** 容器 ID */
  containerId: string
  /** 容器名称 */
  containerName: string
  /** 镜像 */
  image: string
  /** 选择时间 */
  selectedAt: string
  /** 关联的会话 ID */
  sessionId?: string
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
  /** 后端类型，默认 'docker'（creationType === 'ssh' 时自动设为 'ssh'） */
  backendType?: LabBackendType
  /** Compose 配置 ID (creationType = 'compose' 时使用) */
  composeConfigId?: string
  /** Dockerfile 配置 ID (creationType = 'dockerfile' 时使用) */
  dockerfileConfigId?: string
  /** 已有容器 ID (creationType = 'existing' 时使用) */
  existingContainerId?: string
  /** 项目名称 (可选，用于 compose) */
  projectName?: string
  /** 上下文路径 (可选，用于 dockerfile) */
  context?: string
  /** SSH 主机地址 (creationType = 'ssh' 时使用) */
  sshHost?: string
  /** SSH 端口 (creationType = 'ssh' 时使用，默认 22) */
  sshPort?: number
  /** SSH 用户名 (creationType = 'ssh' 时使用) */
  sshUsername?: string
  /** SSH 认证类型 (creationType = 'ssh' 时使用) */
  sshAuthType?: 'password' | 'key'
  /** SSH 密码 (creationType = 'ssh' 且 authType === 'password' 时使用) */
  sshPassword?: string
  /** SSH 密钥名称 (creationType = 'ssh' 且 authType === 'key' 时使用) */
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
  /** 关联的容器 ID 列表 */
  containerIds?: string[]
  /** 错误信息 */
  error?: string
}

/**
 * Dockerfile 创建结果
 */
export interface CreateFromDockerfileResult {
  success: boolean
  containerId?: string
  error?: string
}

/**
 * 删除实验室选项
 */
export interface DeleteLabOptions {
  /** 是否强制删除 */
  force?: boolean
  /**
   * 是否删除关联容器
   * 注意：实际行为受实验室类型限制
   * - existing 类型：强制为 false，不删除容器（保护用户原有容器）
   * - dockerfile/compose 类型：由用户选择，默认 true
   */
  deleteContainers?: boolean
  /** 是否删除关联工作区（如 Docker volume），默认 false */
  deleteWorkspace?: boolean
}

/**
 * 删除实验室结果
 */
export interface DeleteLabResult {
  /** 是否成功 */
  success: boolean
  /** 已删除的容器 ID 列表 */
  removedContainers?: string[]
  /** 是否已删除工作区 */
  removedWorkspace?: boolean
  /** 是否保留了工作区 */
  keptWorkspace?: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 容器状态检测结果
 */
export interface LabContainerStatus {
  /** 实验室 ID */
  labId: string
  /** 实验室创建类型 */
  creationType: LabCreationType
  /** 关联的容器 ID 列表 */
  containerIds: string[]
  /** 容器是否丢失 */
  isOrphan: boolean
  /** 容器状态列表 */
  containerStates: Array<{
    containerId: string
    exists: boolean
    state?: ContainerState
    status: 'running' | 'stopped' | 'not_found'
  }>
  /** 检测时间 */
  checkedAt: string
}
