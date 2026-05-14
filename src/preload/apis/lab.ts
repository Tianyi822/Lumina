import { createIpcInvoker, createIpcListener } from './base'
import { ipcRenderer } from 'electron'
import type {
  DockerStatus,
  PlatformType,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  ContainerLogsResult,
  LabTemplate,
  ExecCommand,
  ExecCommandResult,
  DockerTerminalActionResult,
  DockerTerminalDataEvent,
  DockerTerminalExitEvent,
  DockerTerminalOpenResult,
  DockerTerminalSize,
  ComposeOptions,
  ComposeResult,
  CreateFromDockerfileResult,
  LabSelection,
  LogOptions,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabResult,
  DeleteLabOptions,
  FrontendLabInfo,
  LabContainerStatus,
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
} from '@shared/types/lab'

export const labApi = {
  ...createIpcInvoker<{
    checkDocker: () => Promise<DockerStatus>
    getPlatform: () => Promise<PlatformType>
  }>('lab', ['checkDocker', 'getPlatform']),

  openExternal: (url: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:openExternal', url)
  },

  // ==================== Lab Management ====================

  saveLab: (data: LabData): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:save', data)
  },

  loadLab: (labId: string): Promise<LabData | null> => {
    return ipcRenderer.invoke('lab:load', labId)
  },

  loadLabResolved: (labId: string): Promise<LabData | null> => {
    return ipcRenderer.invoke('lab:frontend:loadResolved', labId)
  },

  listLabs: (): Promise<LabListItem[]> => {
    return ipcRenderer.invoke('lab:list')
  },

  renameLab: (labId: string, newName: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:rename', labId, newName)
  },

  readLabLog: (labId: string): Promise<LabLogEntry[]> => {
    return ipcRenderer.invoke('lab:readLog', labId)
  },

  // ==================== Container Browser (Placeholder) ====================
  // TODO: Implement IPC handlers for these methods

  listContainers: (filter?: ContainerFilter): Promise<ContainerListResult> => {
    return ipcRenderer.invoke('lab:listContainers', filter)
  },

  getContainerDetails: (containerId: string): Promise<ContainerDetailsResult> => {
    return ipcRenderer.invoke('lab:getContainerDetails', containerId)
  },

  getContainerStats: (containerId: string): Promise<ContainerStatsResult> => {
    return ipcRenderer.invoke('lab:getContainerStats', containerId)
  },

  getContainerLogs: (containerId: string, options?: LogOptions): Promise<ContainerLogsResult> => {
    return ipcRenderer.invoke('lab:getContainerLogs', containerId, options)
  },

  // ==================== Container Operations (Placeholder) ====================

  startContainer: (containerId: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:startContainer', containerId)
  },

  stopContainer: (containerId: string, timeout?: number): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:stopContainer', containerId, timeout)
  },

  restartContainer: (containerId: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:restartContainer', containerId)
  },

  removeContainer: (containerId: string, force?: boolean): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:removeContainer', containerId, force)
  },

  // ==================== Command Execution (Placeholder) ====================

  execCommand: (containerId: string, command: ExecCommand): Promise<ExecCommandResult> => {
    return ipcRenderer.invoke('lab:execCommand', containerId, command)
  },

  terminal: {
    open: (containerId: string, size?: DockerTerminalSize): Promise<DockerTerminalOpenResult> => {
      return ipcRenderer.invoke('lab:terminal:open', containerId, size)
    },
    write: (sessionId: string, data: string): Promise<DockerTerminalActionResult> => {
      return ipcRenderer.invoke('lab:terminal:write', sessionId, data)
    },
    resize: (sessionId: string, size: DockerTerminalSize): Promise<DockerTerminalActionResult> => {
      return ipcRenderer.invoke('lab:terminal:resize', sessionId, size)
    },
    close: (sessionId: string): Promise<DockerTerminalActionResult> => {
      return ipcRenderer.invoke('lab:terminal:close', sessionId)
    },
    onData: (callback: (event: DockerTerminalDataEvent) => void): (() => void) => {
      return createIpcListener<DockerTerminalDataEvent>('lab:terminal:data', callback)
    },
    onExit: (callback: (event: DockerTerminalExitEvent) => void): (() => void) => {
      return createIpcListener<DockerTerminalExitEvent>('lab:terminal:exit', callback)
    }
  },

  // ==================== File Operations (Placeholder) ====================

  copyToContainer: (containerId: string, source: string, target: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:copyToContainer', containerId, source, target)
  },

  copyFromContainer: (containerId: string, source: string, target: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:copyFromContainer', containerId, source, target)
  },

  // ==================== Templates (Placeholder) ====================

  listTemplates: (): Promise<LabTemplate[]> => {
    return ipcRenderer.invoke('lab:listTemplates')
  },

  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult> => {
    return ipcRenderer.invoke('lab:createFromTemplate', templateId, variables)
  },

  // ==================== Lab Creation (Placeholder) ====================

  createFromCompose: (
    content: string,
    options?: ComposeOptions,
    labId?: string,
    labName?: string
  ): Promise<ComposeResult> => {
    return ipcRenderer.invoke('lab:createFromCompose', content, options, labId, labName)
  },

  createFromDockerfile: (
    dockerfile: string,
    context?: string,
    labId?: string,
    labName?: string,
    portMappings?: PortMappingInput[]
  ): Promise<CreateFromDockerfileResult> => {
    return ipcRenderer.invoke(
      'lab:createFromDockerfile',
      dockerfile,
      context,
      labId,
      labName,
      portMappings
    )
  },

  // ==================== Session Integration (Placeholder) ====================

  selectLab: (containerId: string, sessionId?: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:selectLab', containerId, sessionId)
  },

  deselectLab: (containerId: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:deselectLab', containerId)
  },

  getSessionLab: (sessionId: string): Promise<LabSelection | null> => {
    return ipcRenderer.invoke('lab:getSessionLab', sessionId)
  },

  // ==================== Docker 配置管理 ====================

  dockerfile: {
    list: (): Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }> => {
      return ipcRenderer.invoke('lab:dockerfile:list')
    },
    load: (
      id: string
    ): Promise<{ success: boolean; config?: DockerfileConfig; error?: string }> => {
      return ipcRenderer.invoke('lab:dockerfile:load', id)
    },
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }> => {
      return ipcRenderer.invoke('lab:dockerfile:save', request)
    },
    delete: (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('lab:dockerfile:delete', id)
    }
  },

  compose: {
    list: (): Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }> => {
      return ipcRenderer.invoke('lab:compose:list')
    },
    load: (id: string): Promise<{ success: boolean; config?: ComposeConfig; error?: string }> => {
      return ipcRenderer.invoke('lab:compose:load', id)
    },
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }> => {
      return ipcRenderer.invoke('lab:compose:save', request)
    },
    delete: (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('lab:compose:delete', id)
    },
    // Compose 项目操作
    start: (projectName: string): Promise<ComposeStartResult> => {
      return ipcRenderer.invoke('lab:compose:start', projectName)
    },
    stop: (projectName: string, options?: ComposeStopOptions): Promise<ComposeStopResult> => {
      return ipcRenderer.invoke('lab:compose:stop', projectName, options)
    },
    restart: (projectName: string): Promise<ComposeRestartResult> => {
      return ipcRenderer.invoke('lab:compose:restart', projectName)
    },
    status: (projectName: string): Promise<ComposeStatusResult> => {
      return ipcRenderer.invoke('lab:compose:status', projectName)
    },
    exec: (
      projectName: string,
      serviceName: string,
      command: string,
      options?: ComposeExecOptions
    ): Promise<ComposeExecResult> => {
      return ipcRenderer.invoke('lab:compose:exec', projectName, serviceName, command, options)
    },
    logs: (projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> => {
      return ipcRenderer.invoke('lab:compose:logs', projectName, options)
    },
    downExtended: (
      projectName: string,
      options?: ComposeDownOptions
    ): Promise<ComposeDownResult> => {
      return ipcRenderer.invoke('lab:compose:downExtended', projectName, options)
    }
  },

  // ==================== 实验室管理（带类型/选项） ====================

  createLab: (request: CreateLabRequest): Promise<CreateLabResult> => {
    return ipcRenderer.invoke('lab:create', request)
  },

  deleteLab: (labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> => {
    return ipcRenderer.invoke('lab:delete', labId, options)
  },

  retryFrontendInitialization: (labId: string): Promise<FrontendLabInfo> => {
    return ipcRenderer.invoke('lab:frontend:retryInitialization', labId)
  },

  rebuildFrontendRuntime: (labId: string): Promise<FrontendLabInfo> => {
    return ipcRenderer.invoke('lab:frontend:rebuildRuntime', labId)
  },

  validateFrontendBuild: (labId: string): Promise<FrontendLabInfo> => {
    return ipcRenderer.invoke('lab:frontend:validateBuild', labId)
  },

  checkContainerStatus: (labId: string): Promise<LabContainerStatus | null> => {
    return ipcRenderer.invoke('lab:checkContainerStatus', labId)
  },

  checkAllContainerStatus: (): Promise<LabContainerStatus[]> => {
    return ipcRenderer.invoke('lab:checkAllContainerStatus')
  },

  cleanupOrphan: (labId: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:cleanupOrphan', labId)
  },

  recoverOrphan: (labId: string, newContainerId: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:recoverOrphan', labId, newContainerId)
  }
}
