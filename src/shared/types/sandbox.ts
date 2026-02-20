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

// ==================== Compose 操作相关类型 ====================

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

// ==================== 沙箱权限控制类型 ====================

/**
 * 沙箱权限策略
 * 定义每种沙箱类型的操作权限
 */
export interface SandboxPermissionPolicy {
  /** 允许启动容器 */
  canStart: boolean
  /** 允许停止容器 */
  canStop: boolean
  /** 允许重启容器 */
  canRestart: boolean
  /** 允许删除容器（删除沙箱时） */
  canDeleteContainer: boolean
  /** 删除沙箱时默认是否删除容器 */
  defaultDeleteContainer: boolean
  /** 删除沙箱时是否强制不删除容器（existing类型） */
  forceKeepContainer: boolean
  /** 描述 */
  description: string
}

/**
 * 沙箱类型权限映射
 * 集中管理三种沙箱类型的权限策略
 */
export const SANDBOX_TYPE_PERMISSIONS: Record<SandboxCreationType, SandboxPermissionPolicy> = {
  existing: {
    canStart: false,
    canStop: false,
    canRestart: false,
    canDeleteContainer: false,
    defaultDeleteContainer: false,
    forceKeepContainer: true,
    description: '已有容器类型：仅关联容器，不管理生命周期'
  },
  compose: {
    canStart: true,
    canStop: true,
    canRestart: true,
    canDeleteContainer: true,
    defaultDeleteContainer: true,
    forceKeepContainer: false,
    description: 'Compose类型：完整容器管理权限'
  },
  dockerfile: {
    canStart: true,
    canStop: true,
    canRestart: true,
    canDeleteContainer: true,
    defaultDeleteContainer: true,
    forceKeepContainer: false,
    description: 'Dockerfile类型：完整容器管理权限'
  }
}

/**
 * 沙箱类型守卫
 * 检查值是否为有效的沙箱创建类型
 */
export function isSandboxCreationType(value: unknown): value is SandboxCreationType {
  return typeof value === 'string' && ['existing', 'compose', 'dockerfile'].includes(value)
}

/**
 * 检查是否为受管沙箱类型（有完整容器管理权限）
 */
export function isManagedSandbox(type: SandboxCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

/**
 * 检查是否为只读沙箱类型（仅关联，不管理生命周期）
 */
export function isReadOnlySandbox(type: SandboxCreationType): boolean {
  return type === 'existing'
}
