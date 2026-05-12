import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'
import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  TestSshConnectionResult,
  ExecCommand,
  ExecCommandResult,
  SshConnectResult,
  SshServerStatsResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

export const sshApi = {
  connect: (
    labId: string,
    config: SshConnectionConfig,
    password?: string
  ): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:connect', labId, config, password),

  disconnect: (labId: string) => ipcRenderer.invoke('ssh:disconnect', labId),

  getStatus: (labId: string) => ipcRenderer.invoke('ssh:status', labId),

  getServerStats: (labId: string): Promise<SshServerStatsResult> =>
    ipcRenderer.invoke('ssh:stats', labId),

  exec: (labId: string, command: ExecCommand): Promise<ExecCommandResult> =>
    ipcRenderer.invoke('ssh:exec', labId, command),

  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void): (() => void) => {
    return createIpcListener<SshConnectionStatusEvent>('ssh:connection-status', callback)
  },

  terminal: {
    open: (labId: string, size?: SshTerminalSize): Promise<SshTerminalOpenResult> =>
      ipcRenderer.invoke('ssh:terminal:open', labId, size),
    write: (sessionId: string, data: string): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:write', sessionId, data),
    resize: (sessionId: string, size: SshTerminalSize): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:resize', sessionId, size),
    close: (sessionId: string): Promise<SshTerminalActionResult> =>
      ipcRenderer.invoke('ssh:terminal:close', sessionId),
    onData: (callback: (event: SshTerminalDataEvent) => void): (() => void) =>
      createIpcListener<SshTerminalDataEvent>('ssh:terminal:data', callback),
    onExit: (callback: (event: SshTerminalExitEvent) => void): (() => void) =>
      createIpcListener<SshTerminalExitEvent>('ssh:terminal:exit', callback)
  },

  config: {
    test: (config: SshConnectionConfig, password?: string): Promise<TestSshConnectionResult> =>
      ipcRenderer.invoke('ssh-config:test', config, password)
  }
}
