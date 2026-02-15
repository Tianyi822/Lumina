import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'
import type {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ContainerFilter,
  SandboxTemplate,
  ExecCommand,
  ExecResult,
  ComposeOptions,
  ComposeResult,
  SandboxSelection,
  LogOptions
} from '@shared/types/sandbox'

export type PlatformType = 'darwin' | 'win32' | 'linux'

export interface DockerCheckResult {
  installed: boolean
  version?: string
  error?: string
}

export const sandboxApi = {
  ...createIpcInvoker<{
    checkDocker: () => Promise<DockerCheckResult>
    getPlatform: () => Promise<PlatformType>
  }>('sandbox', ['checkDocker', 'getPlatform']),

  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke('sandbox:openExternal', url)
  },

  // ==================== Sandbox Management ====================

  createSandbox: (name?: string): Promise<SandboxData> => {
    return ipcRenderer.invoke('sandbox:create', name)
  },

  saveSandbox: (data: SandboxData): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:save', data)
  },

  loadSandbox: (sandboxId: string): Promise<SandboxData | null> => {
    return ipcRenderer.invoke('sandbox:load', sandboxId)
  },

  listSandboxs: (): Promise<SandboxListItem[]> => {
    return ipcRenderer.invoke('sandbox:list')
  },

  deleteSandbox: (sandboxId: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:delete', sandboxId)
  },

  renameSandbox: (sandboxId: string, newName: string): Promise<SandboxResult> => {
    return ipcRenderer.invoke('sandbox:rename', sandboxId, newName)
  },

  readSandboxLog: (sandboxId: string): Promise<SandboxLogEntry[]> => {
    return ipcRenderer.invoke('sandbox:readLog', sandboxId)
  },

  // ==================== Container Browser (Placeholder) ====================
  // TODO: Implement IPC handlers for these methods

  listContainers: (filter?: ContainerFilter): Promise<ContainerInfo[]> => {
    return ipcRenderer.invoke('sandbox:listContainers', filter)
  },

  getContainerDetails: (containerId: string): Promise<ContainerDetails> => {
    return ipcRenderer.invoke('sandbox:getContainerDetails', containerId)
  },

  getContainerStats: (containerId: string): Promise<ContainerStats> => {
    return ipcRenderer.invoke('sandbox:getContainerStats', containerId)
  },

  getContainerLogs: (containerId: string, options?: LogOptions): Promise<string> => {
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

  execCommand: (containerId: string, command: ExecCommand): Promise<ExecResult> => {
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

  createFromCompose: (content: string, options?: ComposeOptions): Promise<ComposeResult> => {
    return ipcRenderer.invoke('sandbox:createFromCompose', content, options)
  },

  createFromDockerfile: (dockerfile: string, context: string): Promise<string> => {
    return ipcRenderer.invoke('sandbox:createFromDockerfile', dockerfile, context)
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
  }
}
