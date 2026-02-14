import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'
import type {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry
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

  // ==================== 沙箱管理 ====================

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
  }
}
