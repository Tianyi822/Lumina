import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'
import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SaveSshConfigRequest,
  SaveSshConfigResult,
  ListSshConfigsResult,
  TestSshConnectionResult,
  ExecCommand,
  ExecCommandResult,
  SshConnectResult
} from '@shared/types/lab'

export const sshApi = {
  connect: (labId: string, config: SshConnectionConfig): Promise<SshConnectResult> =>
    ipcRenderer.invoke('ssh:connect', labId, config),

  disconnect: (labId: string) => ipcRenderer.invoke('ssh:disconnect', labId),

  getStatus: (labId: string) => ipcRenderer.invoke('ssh:status', labId),

  exec: (labId: string, command: ExecCommand): Promise<ExecCommandResult> =>
    ipcRenderer.invoke('ssh:exec', labId, command),

  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void): (() => void) => {
    return createIpcListener<SshConnectionStatusEvent>('ssh:connection-status', callback)
  },

  config: {
    list: (): Promise<ListSshConfigsResult> => ipcRenderer.invoke('ssh-config:list'),
    save: (request: SaveSshConfigRequest): Promise<SaveSshConfigResult> =>
      ipcRenderer.invoke('ssh-config:save', request),
    delete: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ssh-config:delete', id),
    test: (config: SshConnectionConfig): Promise<TestSshConnectionResult> =>
      ipcRenderer.invoke('ssh-config:test', config)
  }
}
