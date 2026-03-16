import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'
import type {
  DockerCheckResult,
  PlatformType,
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  ContainerLogsResult,
  SandboxTemplate,
  ExecCommand,
  ExecCommandResult,
  ComposeOptions,
  ComposeResult,
  CreateFromDockerfileResult,
  SandboxSelection,
  LogOptions,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest,
  CreateSandboxRequest,
  CreateSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus,
  ComposeStopOptions,
  ComposeStopResult,
  ComposeStartResult,
  ComposeRestartResult,
  ComposeStatusResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult,
  PortMappingInput
} from '@shared/types/sandbox'

export const sandboxApi = {
  ...createIpcInvoker<{
    checkDocker: () => Promise<DockerCheckResult>
    getPlatform: () => Promise<PlatformType>
  }>('sandbox', ['checkDocker', 'getPlatform']),

  openExternal: (url: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:openExternal', url)
  },

  // ==================== Sandbox Management ====================

  saveSandbox: (data: SandboxData): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:save', data)
  },

  loadSandbox: (sandboxId: string): Promise<SandboxData | null> => {
    return ipcRenderer.invoke('sandbox:load', sandboxId)
  },

  listSandboxs: (): Promise<SandboxListItem[]> => {
    return ipcRenderer.invoke('sandbox:list')
  },

  renameSandbox: (sandboxId: string, newName: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:rename', sandboxId, newName)
  },

  readSandboxLog: (sandboxId: string): Promise<SandboxLogEntry[]> => {
    return ipcRenderer.invoke('sandbox:readLog', sandboxId)
  },

  // ==================== Container Browser (Placeholder) ====================
  // TODO: Implement IPC handlers for these methods

  listContainers: (filter?: ContainerFilter): Promise<ContainerListResult> => {
    return ipcRenderer.invoke('sandbox:listContainers', filter)
  },

  getContainerDetails: (containerId: string): Promise<ContainerDetailsResult> => {
    return ipcRenderer.invoke('sandbox:getContainerDetails', containerId)
  },

  getContainerStats: (containerId: string): Promise<ContainerStatsResult> => {
    return ipcRenderer.invoke('sandbox:getContainerStats', containerId)
  },

  getContainerLogs: (containerId: string, options?: LogOptions): Promise<ContainerLogsResult> => {
    return ipcRenderer.invoke('sandbox:getContainerLogs', containerId, options)
  },

  // ==================== Container Operations (Placeholder) ====================

  startContainer: (containerId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:startContainer', containerId)
  },

  stopContainer: (containerId: string, timeout?: number): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:stopContainer', containerId, timeout)
  },

  restartContainer: (containerId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:restartContainer', containerId)
  },

  removeContainer: (containerId: string, force?: boolean): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:removeContainer', containerId, force)
  },

  // ==================== Command Execution (Placeholder) ====================

  execCommand: (containerId: string, command: ExecCommand): Promise<ExecCommandResult> => {
    return ipcRenderer.invoke('sandbox:execCommand', containerId, command)
  },

  // ==================== File Operations (Placeholder) ====================

  copyToContainer: (
    containerId: string,
    source: string,
    target: string
  ): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:copyToContainer', containerId, source, target)
  },

  copyFromContainer: (
    containerId: string,
    source: string,
    target: string
  ): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:copyFromContainer', containerId, source, target)
  },

  // ==================== Templates (Placeholder) ====================

  listTemplates: (): Promise<SandboxTemplate[]> => {
    return ipcRenderer.invoke('sandbox:listTemplates')
  },

  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult> => {
    return ipcRenderer.invoke('sandbox:createFromTemplate', templateId, variables)
  },

  // ==================== Sandbox Creation (Placeholder) ====================

  createFromCompose: (
    content: string,
    options?: ComposeOptions,
    sandboxId?: string,
    sandboxName?: string
  ): Promise<ComposeResult> => {
    return ipcRenderer.invoke('sandbox:createFromCompose', content, options, sandboxId, sandboxName)
  },

  createFromDockerfile: (
    dockerfile: string,
    context?: string,
    sandboxId?: string,
    sandboxName?: string,
    portMappings?: PortMappingInput[]
  ): Promise<CreateFromDockerfileResult> => {
    return ipcRenderer.invoke(
      'sandbox:createFromDockerfile',
      dockerfile,
      context,
      sandboxId,
      sandboxName,
      portMappings
    )
  },

  // ==================== Session Integration (Placeholder) ====================

  selectSandbox: (containerId: string, sessionId?: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:selectSandbox', containerId, sessionId)
  },

  deselectSandbox: (containerId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:deselectSandbox', containerId)
  },

  getSessionSandbox: (sessionId: string): Promise<SandboxSelection | null> => {
    return ipcRenderer.invoke('sandbox:getSessionSandbox', sessionId)
  },

  // ==================== Docker 配置管理 ====================

  dockerfile: {
    list: (): Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }> => {
      return ipcRenderer.invoke('sandbox:dockerfile:list')
    },
    load: (
      id: string
    ): Promise<{ success: boolean; config?: DockerfileConfig; error?: string }> => {
      return ipcRenderer.invoke('sandbox:dockerfile:load', id)
    },
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }> => {
      return ipcRenderer.invoke('sandbox:dockerfile:save', request)
    },
    delete: (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('sandbox:dockerfile:delete', id)
    }
  },

  compose: {
    list: (): Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }> => {
      return ipcRenderer.invoke('sandbox:compose:list')
    },
    load: (id: string): Promise<{ success: boolean; config?: ComposeConfig; error?: string }> => {
      return ipcRenderer.invoke('sandbox:compose:load', id)
    },
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }> => {
      return ipcRenderer.invoke('sandbox:compose:save', request)
    },
    delete: (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('sandbox:compose:delete', id)
    },
    // Compose 项目操作
    start: (projectName: string): Promise<ComposeStartResult> => {
      return ipcRenderer.invoke('sandbox:compose:start', projectName)
    },
    stop: (projectName: string, options?: ComposeStopOptions): Promise<ComposeStopResult> => {
      return ipcRenderer.invoke('sandbox:compose:stop', projectName, options)
    },
    restart: (projectName: string): Promise<ComposeRestartResult> => {
      return ipcRenderer.invoke('sandbox:compose:restart', projectName)
    },
    status: (projectName: string): Promise<ComposeStatusResult> => {
      return ipcRenderer.invoke('sandbox:compose:status', projectName)
    },
    exec: (
      projectName: string,
      serviceName: string,
      command: string,
      options?: ComposeExecOptions
    ): Promise<ComposeExecResult> => {
      return ipcRenderer.invoke('sandbox:compose:exec', projectName, serviceName, command, options)
    },
    logs: (projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> => {
      return ipcRenderer.invoke('sandbox:compose:logs', projectName, options)
    },
    downExtended: (
      projectName: string,
      options?: ComposeDownOptions
    ): Promise<ComposeDownResult> => {
      return ipcRenderer.invoke('sandbox:compose:downExtended', projectName, options)
    }
  },

  // ==================== 沙箱管理（带类型/选项） ====================

  createSandbox: (request: CreateSandboxRequest): Promise<CreateSandboxResult> => {
    return ipcRenderer.invoke('sandbox:create', request)
  },

  deleteSandbox: (
    sandboxId: string,
    options?: DeleteSandboxOptions
  ): Promise<{ success: boolean; removedContainers?: string[]; error?: string }> => {
    return ipcRenderer.invoke('sandbox:delete', sandboxId, options)
  },

  checkContainerStatus: (sandboxId: string): Promise<SandboxContainerStatus | null> => {
    return ipcRenderer.invoke('sandbox:checkContainerStatus', sandboxId)
  },

  checkAllContainerStatus: (): Promise<SandboxContainerStatus[]> => {
    return ipcRenderer.invoke('sandbox:checkAllContainerStatus')
  },

  cleanupOrphan: (sandboxId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:cleanupOrphan', sandboxId)
  },

  recoverOrphan: (sandboxId: string, newContainerId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:recoverOrphan', sandboxId, newContainerId)
  }
}
