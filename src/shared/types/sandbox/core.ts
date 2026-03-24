/**
 * 沙箱基础类型
 */
import type { ContainerState, PortMapping } from './container'
import type { FrontendSandboxMetadata } from './frontend'

/**
 * 平台类型
 */
export type PlatformType = 'darwin' | 'win32' | 'linux'

/**
 * Docker 检测结果
 */
export interface DockerCheckResult {
  installed: boolean
  version?: string
  error?: string
}

/**
 * 沙箱状态
 */
export type SandboxStatus = 'creating' | 'running' | 'stopped' | 'error'

/**
 * 沙箱创建类型
 */
export type SandboxCreationType = 'existing' | 'compose' | 'dockerfile'

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
  /** 沙箱创建类型 */
  creationType: SandboxCreationType
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
  frontend?: FrontendSandboxMetadata
  /** 端口映射配置（用于 dockerfile/compose 类型沙箱） */
  portMappings?: PortMapping[]
  /** 是否为孤立沙箱（容器已丢失） */
  isOrphan?: boolean
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
  /** 沙箱创建类型 */
  creationType: SandboxCreationType
  /** 是否为孤立沙箱（容器已丢失） */
  isOrphan?: boolean
  /** 关联的容器数量 */
  containerCount: number
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

/**
 * 创建沙箱配置
 */
export interface CreateSandboxConfig {
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
  /** Docker 版本 */
  version?: string
  /** 错误信息 */
  error?: string
}

/**
 * 沙箱选择
 */
export interface SandboxSelection {
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
 * 创建沙箱请求
 */
export interface CreateSandboxRequest {
  /** 沙箱名称 */
  name: string
  /** 沙箱描述（可选） */
  description?: string
  /** 创建类型 */
  creationType: SandboxCreationType
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
}

/**
 * 创建沙箱结果
 */
export interface CreateSandboxResult {
  /** 是否成功 */
  success: boolean
  /** 创建的沙箱数据 */
  sandbox?: SandboxData
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
 * 删除沙箱选项
 */
export interface DeleteSandboxOptions {
  /** 是否强制删除 */
  force?: boolean
  /**
   * 是否删除关联容器
   * 注意：实际行为受沙箱类型限制
   * - existing 类型：强制为 false，不删除容器（保护用户原有容器）
   * - dockerfile/compose 类型：由用户选择，默认 true
   */
  deleteContainers?: boolean
}

/**
 * 容器状态检测结果
 */
export interface SandboxContainerStatus {
  /** 沙箱 ID */
  sandboxId: string
  /** 沙箱创建类型 */
  creationType: SandboxCreationType
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
