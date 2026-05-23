/**
 * 容器相关类型
 */

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
 * 端口映射输入
 */
export interface PortMappingInput {
  hostPort: number | null
  containerPort: number
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
  /** 是否为 Docker API 或执行基础设施错误 */
  systemError?: boolean
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

/**
 * 容器列表结果
 */
export interface ContainerListResult {
  success: boolean
  containers?: ContainerInfo[]
  error?: string
  reason?: DockerContainerErrorReason
}

/**
 * 容器详情结果
 */
export interface ContainerDetailsResult {
  success: boolean
  details?: ContainerDetails
  error?: string
  reason?: DockerContainerErrorReason
}

/**
 * Docker 容器 API 错误原因
 */
export type DockerContainerErrorReason =
  | 'not_found'
  | 'docker_unavailable'
  | 'docker_server_error'
  | 'unknown'

/**
 * 容器统计结果
 */
export interface ContainerStatsResult {
  success: boolean
  stats?: ContainerStats
  error?: string
}

/**
 * 容器日志结果
 */
export interface ContainerLogsResult {
  success: boolean
  logs?: string
  error?: string
}

/**
 * 命令执行结果
 */
export interface ExecCommandResult {
  success: boolean
  result?: ExecResult
  error?: string
}

/** Docker 终端尺寸 */
export interface DockerTerminalSize {
  cols: number
  rows: number
}

/** Docker 终端打开结果 */
export interface DockerTerminalOpenResult {
  success: boolean
  sessionId?: string
  error?: string
}

/** Docker 终端操作结果 */
export interface DockerTerminalActionResult {
  success: boolean
  error?: string
}

/** Docker 终端输出事件（通过 IPC 推送） */
export interface DockerTerminalDataEvent {
  containerId: string
  sessionId: string
  data: string
}

/** Docker 终端退出事件（通过 IPC 推送） */
export interface DockerTerminalExitEvent {
  containerId: string
  sessionId: string
  code?: number | null
  reason?: string
}
