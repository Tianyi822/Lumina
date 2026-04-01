// 重导出 @shared/types/sandbox 中的所有类型
export type {
  PlatformType,
  DockerCheckResult,
  SandboxStatus,
  SandboxCreationType,
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  CreateSandboxConfig,
  DockerStatus,
  SandboxSelection,
  CreateSandboxRequest,
  CreateSandboxResult,
  CreateFromDockerfileResult,
  DeleteSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus
} from '@shared/types/sandbox'

export type {
  ContainerState,
  PortMapping,
  PortMappingInput,
  ContainerInfo,
  NetworkInfo,
  PortBinding,
  NetworkSettings,
  HostConfig,
  MountPoint,
  ContainerDetails,
  ContainerStats,
  ExecCommand,
  ExecResult,
  TerminalLog,
  ContainerFilter,
  LogOptions,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  ContainerLogsResult,
  ExecCommandResult
} from '@shared/types/sandbox'

export type {
  TemplateCategory,
  TemplateVariable,
  TemplateConfig,
  SandboxTemplate,
  ComposeOptions,
  ComposeDockerfileConfig,
  ComposeResult,
  ComposeStartOptions,
  ComposeStartResult,
  ComposeStopOptions,
  ComposeServiceStatus,
  ComposeProjectStatus,
  ComposeStatusResult,
  ComposeStopResult,
  ComposeRestartResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult
} from '@shared/types/sandbox'

export type {
  FrontendFramework,
  FrontendBootstrapStatus,
  FrontendBootstrapState,
  FrontendWorkspaceMetadata,
  CreateFrontendSandboxOptions,
  FrontendSandboxInfo,
  FrontendSandboxMetadata
} from '@shared/types/sandbox'

export type {
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  DockerConfigMetadata,
  SaveConfigRequest,
  SaveConfigResult,
  LoadConfigResult,
  ListConfigResult,
  DeleteConfigResult,
  SandboxConfigurationSnapshot
} from '@shared/types/sandbox'

// 导入用于 SandboxApi 定义的类型
import type {
  DockerCheckResult,
  PlatformType,
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  SandboxSelection,
  CreateSandboxRequest,
  CreateSandboxResult,
  CreateFromDockerfileResult,
  DeleteSandboxResult,
  DeleteSandboxOptions,
  FrontendSandboxInfo,
  SandboxContainerStatus,
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  ContainerLogsResult,
  LogOptions,
  ExecCommand,
  ExecCommandResult,
  SandboxTemplate,
  ComposeResult,
  ComposeOptions,
  PortMappingInput,
  DockerfileConfigMeta,
  DockerfileConfig,
  ComposeConfigMeta,
  ComposeConfig,
  SaveConfigRequest,
  ComposeStartResult,
  ComposeStopOptions,
  ComposeStopResult,
  ComposeRestartResult,
  ComposeStatusResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult
} from '@shared/types/sandbox'

/**
 * Dockerfile 配置 API
 */
export interface DockerfileConfigApi {
  list: () => Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }>
  load: (id: string) => Promise<{ success: boolean; config?: DockerfileConfig; error?: string }>
  save: (
    request: SaveConfigRequest
  ) => Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * Compose 配置 API
 */
export interface ComposeConfigApi {
  list: () => Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }>
  load: (id: string) => Promise<{ success: boolean; config?: ComposeConfig; error?: string }>
  save: (
    request: SaveConfigRequest
  ) => Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  // Compose 项目操作
  start: (projectName: string) => Promise<ComposeStartResult>
  stop: (projectName: string, options?: ComposeStopOptions) => Promise<ComposeStopResult>
  restart: (projectName: string) => Promise<ComposeRestartResult>
  status: (projectName: string) => Promise<ComposeStatusResult>
  exec: (
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ) => Promise<ComposeExecResult>
  logs: (projectName: string, options?: ComposeLogOptions) => Promise<ComposeLogResult>
  downExtended: (projectName: string, options?: ComposeDownOptions) => Promise<ComposeDownResult>
}

/**
 * 沙箱相关的 API
 */
export interface SandboxApi {
  // Docker 检测
  checkDocker: () => Promise<DockerCheckResult>
  getPlatform: () => Promise<PlatformType>
  openExternal: (url: string) => Promise<SandboxResult>

  // 沙箱管理
  saveSandbox: (data: SandboxData) => Promise<SandboxResult>
  loadSandbox: (sandboxId: string) => Promise<SandboxData | null>
  loadSandboxResolved: (sandboxId: string) => Promise<SandboxData | null>
  listSandboxs: () => Promise<SandboxListItem[]>
  renameSandbox: (sandboxId: string, newName: string) => Promise<SandboxResult>
  readSandboxLog: (sandboxId: string) => Promise<SandboxLogEntry[]>

  // 容器浏览器
  listContainers: (filter?: ContainerFilter) => Promise<ContainerListResult>
  getContainerDetails: (containerId: string) => Promise<ContainerDetailsResult>
  getContainerStats: (containerId: string) => Promise<ContainerStatsResult>
  getContainerLogs: (containerId: string, options?: LogOptions) => Promise<ContainerLogsResult>

  // 容器操作
  startContainer: (containerId: string) => Promise<SandboxResult>
  stopContainer: (containerId: string, timeout?: number) => Promise<SandboxResult>
  restartContainer: (containerId: string) => Promise<SandboxResult>
  removeContainer: (containerId: string, force?: boolean) => Promise<SandboxResult>

  // 命令执行
  execCommand: (containerId: string, command: ExecCommand) => Promise<ExecCommandResult>

  // 文件操作
  copyToContainer: (containerId: string, source: string, target: string) => Promise<SandboxResult>
  copyFromContainer: (containerId: string, source: string, target: string) => Promise<SandboxResult>

  // 模板
  listTemplates: () => Promise<SandboxTemplate[]>
  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ) => Promise<ComposeResult>

  // 沙箱创建
  createFromCompose: (
    content: string,
    options?: ComposeOptions,
    sandboxId?: string,
    sandboxName?: string
  ) => Promise<ComposeResult>
  createFromDockerfile: (
    dockerfile: string,
    context?: string,
    sandboxId?: string,
    sandboxName?: string,
    portMappings?: PortMappingInput[]
  ) => Promise<CreateFromDockerfileResult>

  // 会话集成
  selectSandbox: (containerId: string, sessionId?: string) => Promise<SandboxResult>
  deselectSandbox: (containerId: string) => Promise<SandboxResult>
  getSessionSandbox: (sessionId: string) => Promise<SandboxSelection | null>

  // Docker 配置管理
  dockerfile: DockerfileConfigApi
  compose: ComposeConfigApi

  // 沙箱管理
  createSandbox: (request: CreateSandboxRequest) => Promise<CreateSandboxResult>
  deleteSandbox: (sandboxId: string, options?: DeleteSandboxOptions) => Promise<DeleteSandboxResult>
  retryFrontendInitialization: (sandboxId: string) => Promise<FrontendSandboxInfo>
  rebuildFrontendRuntime: (sandboxId: string) => Promise<FrontendSandboxInfo>
  validateFrontendBuild: (sandboxId: string) => Promise<FrontendSandboxInfo>
  checkContainerStatus: (sandboxId: string) => Promise<SandboxContainerStatus | null>
  checkAllContainerStatus: () => Promise<SandboxContainerStatus[]>
  cleanupOrphan: (sandboxId: string) => Promise<SandboxResult>
  recoverOrphan: (sandboxId: string, newContainerId: string) => Promise<SandboxResult>
}
