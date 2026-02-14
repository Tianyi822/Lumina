import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'

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
  }
}
