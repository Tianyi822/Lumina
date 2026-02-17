/**
 * 沙箱相关的类型定义
 */

// ==================== 基础沙箱类型 ====================

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

// ==================== Docker 容器相关类型 ====================

/**
 * 容器状态
 */
export type ContainerState =
  | 'created'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'

/**
 * 端口映射
 */
export interface PortMapping {
  /** 主机端口 */
  hostPort?: number
  /** 容器端口 */
  containerPort: number
  /** 协议 */
  protocol: 'tcp' | 'udp'
}

/**
 * 容器基本信息（来自 Docker）
 */
export interface ContainerInfo {
  /** 容器 ID (完整) */
  id: string
  /** 容器 ID (短) */
  shortId: string
  /** 容器名称 */
  names: string[]
  /** 镜像 */
  image: string
  /** 状态 */
  state: ContainerState
  /** 状态描述 */
  status: string
  /** 端口映射 */
  ports: PortMapping[]
  /** 创建时间 */
  created: number
  /** 标签 */
  labels: Record<string, string>
}

/**
 * 网络信息
 */
export interface NetworkInfo {
  networkId: string
  ipAddress: string
  gateway: string
  macAddress: string
}

/**
 * 端口绑定
 */
export interface PortBinding {
  hostIp: string
  hostPort: string
}

/**
 * 网络设置
 */
export interface NetworkSettings {
  networks: Record<string, NetworkInfo>
  ports: Record<string, PortBinding[]>
}

/**
 * 主机配置
 */
export interface HostConfig {
  memory: number
  cpuShares: number
  cpuQuota: number
  restartPolicy: string
  privileged: boolean
}

/**
 * 挂载点
 */
export interface MountPoint {
  type: 'bind' | 'volume' | 'tmpfs'
  source: string
  destination: string
  mode: 'rw' | 'ro'
}

/**
 * 容器详细信息
 */
export interface ContainerDetails extends ContainerInfo {
  /** 主机配置 */
  hostConfig: HostConfig
  /** 网络配置 */
  networkSettings: NetworkSettings
  /** 挂载点 */
  mounts: MountPoint[]
  /** 环境变量 */
  env: string[]
  /** 命令 */
  cmd: string[]
  /** 工作目录 */
  workingDir: string
  /** 入口点 */
  entrypoint: string[]
}

/**
 * 容器资源统计
 */
export interface ContainerStats {
  /** CPU 使用率 (%) */
  cpu: number
  /** 内存使用 */
  memory: {
    usage: number
    limit: number
    percent: number
  }
  /** 网络 I/O */
  network: {
    rxBytes: number
    txBytes: number
  }
  /** 块设备 I/O */
  blockIO: {
    readBytes: number
    writeBytes: number
  }
}

/**
 * 执行命令请求
 */
export interface ExecCommand {
  /** 命令 */
  command: string
  /** 工作目录 */
  workdir?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 超时时间 (秒) */
  timeout?: number
}

/**
 * 执行命令结果
 */
export interface ExecResult {
  /** 退出码 */
  exitCode: number
  /** 标准输出 */
  stdout: string
  /** 标准错误 */
  stderr: string
  /** 执行时间 (毫秒) */
  duration: number
}

/**
 * 终端日志条目
 */
export interface TerminalLog {
  timestamp: string
  type: 'input' | 'output' | 'error'
  content: string
}

/**
 * 容器过滤条件
 */
export interface ContainerFilter {
  /** 状态过滤 */
  state?: ContainerState | 'all' | 'running' | 'stopped'
  /** 是否显示所有容器（包括停止的） */
  all?: boolean
  /** 名称搜索 */
  name?: string
  /** 镜像过滤 */
  image?: string
}

/**
 * 日志选项
 */
export interface LogOptions {
  /** 获取最后 N 行 */
  tail?: number
  /** 是否跟随日志 */
  follow?: boolean
  /** 起始时间 */
  since?: number
  /** 结束时间 */
  until?: number
}

// ==================== 模板相关类型 ====================

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
}

/**
 * docker-compose 创建结果
 */
export interface ComposeResult {
  /** 成功的容器 ID */
  containerIds: string[]
  /** 失败的服务 */
  failedServices: string[]
  /** 错误信息 */
  error?: string
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

// ==================== Docker 状态 ====================

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

// ==================== Docker 配置存储类型 ====================

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

// ==================== 沙箱创建类型扩展 ====================

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
 * 删除沙箱选项
 */
export interface DeleteSandboxOptions {
  /** 是否强制删除 */
  force?: boolean
  /** 是否删除关联容器（默认根据创建类型决定） */
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
