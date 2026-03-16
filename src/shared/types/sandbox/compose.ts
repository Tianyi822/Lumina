import type { ExecResult, ContainerState, PortMapping } from './container'

/**
 * Compose 与模板相关类型
 */

/**
 * 沙箱模板分类
 */
export type TemplateCategory = 'database' | 'cache' | 'message-queue' | 'web' | 'devops' | 'other'

/**
 * 模板变量
 */
export interface TemplateVariable {
  name: string
  description: string
  default: string
  required: boolean
}

/**
 * 模板配置
 */
export interface TemplateConfig {
  type: 'docker-compose' | 'dockerfile' | 'image'
  content: string
  variables?: TemplateVariable[]
}

/**
 * 沙箱模板
 */
export interface SandboxTemplate {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
  /** 描述 */
  description: string
  /** 分类 */
  category: TemplateCategory
  /** 图标 */
  icon?: string
  /** 官方/社区 */
  official: boolean
  /** 镜像/配置 */
  config: TemplateConfig
}

/**
 * docker-compose 创建选项
 */
export interface ComposeOptions {
  /** 项目名称 */
  projectName?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 是否移除旧容器 */
  removeOld?: boolean
  /** 要使用的 Dockerfile 配置（用于 build 指令） */
  dockerfiles?: ComposeDockerfileConfig[]
}

/**
 * Compose 中使用的 Dockerfile 配置
 */
export interface ComposeDockerfileConfig {
  /** Dockerfile 配置 ID */
  dockerfileId: string
  /** 在 compose 中的目标路径（相对于 compose 文件所在目录） */
  targetContext?: string
  /** 目标 Dockerfile 文件名（默认为 Dockerfile） */
  targetFilename?: string
}

/**
 * docker-compose 创建结果
 */
export interface ComposeResult {
  /** 是否成功 */
  success: boolean
  /** 成功的容器 ID */
  containerIds: string[]
  /** 失败的服务 */
  failedServices: string[]
  /** 错误信息 */
  error?: string
}

/**
 * Compose 启动选项
 */
export interface ComposeStartOptions {
  /** 环境变量 */
  env?: Record<string, string>
  /** 是否构建镜像 */
  build?: boolean
  /** 是否在后台运行 */
  detach?: boolean
  /** 是否移除旧容器 */
  removeOld?: boolean
}

/**
 * Compose 启动结果
 */
export interface ComposeStartResult {
  success: boolean
  containerIds?: string[]
  error?: string
}

/**
 * Compose 停止选项
 */
export interface ComposeStopOptions {
  /** 超时时间（秒） */
  timeout?: number
  /** 是否删除卷 */
  removeVolumes?: boolean
}

/**
 * Compose 服务状态
 */
export interface ComposeServiceStatus {
  /** 服务名称 */
  name: string
  /** 服务状态 */
  state: ContainerState
  /** 容器 ID（如果已创建） */
  containerId?: string
  /** 端口映射 */
  ports?: PortMapping[]
}

/**
 * Compose 项目状态
 */
export interface ComposeProjectStatus {
  /** 项目名称 */
  projectName: string
  /** 服务状态列表 */
  services: ComposeServiceStatus[]
}

/**
 * Compose 状态结果
 */
export interface ComposeStatusResult {
  success: boolean
  status?: ComposeProjectStatus
  error?: string
}

/**
 * Compose 停止结果
 */
export interface ComposeStopResult {
  /** 是否成功 */
  success: boolean
  /** 停止的容器 ID 列表 */
  stoppedContainerIds?: string[]
  /** 错误信息 */
  error?: string
}

/**
 * Compose 重启结果
 */
export interface ComposeRestartResult {
  /** 是否成功 */
  success: boolean
  /** 重启的容器 ID 列表 */
  restartedContainerIds?: string[]
  /** 错误信息 */
  error?: string
}

/**
 * Compose 执行命令选项
 */
export interface ComposeExecOptions {
  /** 工作目录 */
  workdir?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 超时时间（秒） */
  timeout?: number
  /** 是否分配伪终端 */
  tty?: boolean
}

/**
 * Compose 执行命令结果
 */
export interface ComposeExecResult {
  /** 是否成功 */
  success: boolean
  /** 执行结果 */
  result?: ExecResult
  /** 错误信息 */
  error?: string
}

/**
 * Compose 日志选项
 */
export interface ComposeLogOptions {
  /** 获取最后 N 行 */
  tail?: number
  /** 是否跟随日志 */
  follow?: boolean
  /** 要查看的服务名称（可选） */
  service?: string
  /** 起始时间 */
  since?: number
  /** 结束时间 */
  until?: number
}

/**
 * Compose 日志结果
 */
export interface ComposeLogResult {
  /** 是否成功 */
  success: boolean
  /** 日志内容 */
  logs?: string
  /** 错误信息 */
  error?: string
}

/**
 * Compose down 选项
 */
export interface ComposeDownOptions {
  /** 是否删除卷 */
  removeVolumes?: boolean
  /** 是否删除孤立容器 */
  removeOrphans?: boolean
  /** 是否强制删除 */
  force?: boolean
}

/**
 * Compose down 结果
 */
export interface ComposeDownResult {
  /** 是否成功 */
  success: boolean
  /** 删除的容器 ID 列表 */
  removedContainerIds?: string[]
  /** 删除的卷名称 */
  removedVolumes?: string[]
  /** 错误信息 */
  error?: string
}
