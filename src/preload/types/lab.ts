// 重导出 @shared/types/lab 中的所有类型
export type {
  PlatformType,
  DockerCheckResult,
  LabStatus,
  LabCreationType,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabConfig,
  DockerStatus,
  LabSelection,
  CreateLabRequest,
  CreateLabResult,
  CreateFromDockerfileResult,
  DeleteLabResult,
  DeleteLabOptions,
  LabContainerStatus
} from '@shared/types/lab'

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
  ExecCommandResult,
  DockerTerminalSize,
  DockerTerminalOpenResult,
  DockerTerminalActionResult,
  DockerTerminalDataEvent,
  DockerTerminalExitEvent
} from '@shared/types/lab'

export type {
  TemplateCategory,
  TemplateVariable,
  TemplateConfig,
  LabTemplate,
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
} from '@shared/types/lab'

export type {
  FrontendFramework,
  FrontendBootstrapStatus,
  FrontendBootstrapState,
  FrontendWorkspaceMetadata,
  CreateFrontendLabOptions,
  FrontendLabInfo,
  FrontendLabMetadata
} from '@shared/types/lab'

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
  LabConfigurationSnapshot
} from '@shared/types/lab'

// 导入用于 LabApi 定义的类型
import type {
  DockerCheckResult,
  PlatformType,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  LabSelection,
  CreateLabRequest,
  CreateLabResult,
  CreateFromDockerfileResult,
  DeleteLabResult,
  DeleteLabOptions,
  FrontendLabInfo,
  LabContainerStatus,
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  ContainerLogsResult,
  LogOptions,
  ExecCommand,
  ExecCommandResult,
  DockerTerminalSize,
  DockerTerminalOpenResult,
  DockerTerminalActionResult,
  DockerTerminalDataEvent,
  DockerTerminalExitEvent,
  LabTemplate,
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
} from '@shared/types/lab'

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

export interface DockerTerminalApi {
  open: (containerId: string, size?: DockerTerminalSize) => Promise<DockerTerminalOpenResult>
  write: (sessionId: string, data: string) => Promise<DockerTerminalActionResult>
  resize: (sessionId: string, size: DockerTerminalSize) => Promise<DockerTerminalActionResult>
  close: (sessionId: string) => Promise<DockerTerminalActionResult>
  onData: (callback: (event: DockerTerminalDataEvent) => void) => () => void
  onExit: (callback: (event: DockerTerminalExitEvent) => void) => () => void
}

/**
 * 实验室相关的 API
 */
export interface LabApi {
  // Docker 检测
  checkDocker: () => Promise<DockerCheckResult>
  getPlatform: () => Promise<PlatformType>
  openExternal: (url: string) => Promise<LabResult>

  // 实验室管理
  saveLab: (data: LabData) => Promise<LabResult>
  loadLab: (labId: string) => Promise<LabData | null>
  loadLabResolved: (labId: string) => Promise<LabData | null>
  listLabs: () => Promise<LabListItem[]>
  renameLab: (labId: string, newName: string) => Promise<LabResult>
  readLabLog: (labId: string) => Promise<LabLogEntry[]>

  // 容器浏览器
  listContainers: (filter?: ContainerFilter) => Promise<ContainerListResult>
  getContainerDetails: (containerId: string) => Promise<ContainerDetailsResult>
  getContainerStats: (containerId: string) => Promise<ContainerStatsResult>
  getContainerLogs: (containerId: string, options?: LogOptions) => Promise<ContainerLogsResult>

  // 容器操作
  startContainer: (containerId: string) => Promise<LabResult>
  stopContainer: (containerId: string, timeout?: number) => Promise<LabResult>
  restartContainer: (containerId: string) => Promise<LabResult>
  removeContainer: (containerId: string, force?: boolean) => Promise<LabResult>

  // 命令执行
  execCommand: (containerId: string, command: ExecCommand) => Promise<ExecCommandResult>
  terminal: DockerTerminalApi

  // 文件操作
  copyToContainer: (containerId: string, source: string, target: string) => Promise<LabResult>
  copyFromContainer: (containerId: string, source: string, target: string) => Promise<LabResult>

  // 模板
  listTemplates: () => Promise<LabTemplate[]>
  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ) => Promise<ComposeResult>

  // 实验室创建
  createFromCompose: (
    content: string,
    options?: ComposeOptions,
    labId?: string,
    labName?: string
  ) => Promise<ComposeResult>
  createFromDockerfile: (
    dockerfile: string,
    context?: string,
    labId?: string,
    labName?: string,
    portMappings?: PortMappingInput[]
  ) => Promise<CreateFromDockerfileResult>

  // 会话集成
  selectLab: (containerId: string, sessionId?: string) => Promise<LabResult>
  deselectLab: (containerId: string) => Promise<LabResult>
  getSessionLab: (sessionId: string) => Promise<LabSelection | null>

  // Docker 配置管理
  dockerfile: DockerfileConfigApi
  compose: ComposeConfigApi

  // 实验室管理
  createLab: (request: CreateLabRequest) => Promise<CreateLabResult>
  deleteLab: (labId: string, options?: DeleteLabOptions) => Promise<DeleteLabResult>
  retryFrontendInitialization: (labId: string) => Promise<FrontendLabInfo>
  rebuildFrontendRuntime: (labId: string) => Promise<FrontendLabInfo>
  validateFrontendBuild: (labId: string) => Promise<FrontendLabInfo>
  checkContainerStatus: (labId: string) => Promise<LabContainerStatus | null>
  checkAllContainerStatus: () => Promise<LabContainerStatus[]>
  cleanupOrphan: (labId: string) => Promise<LabResult>
  recoverOrphan: (labId: string, newContainerId: string) => Promise<LabResult>
}
