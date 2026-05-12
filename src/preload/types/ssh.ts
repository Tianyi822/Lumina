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

export type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SshConnectResult,
  SshServerStats,
  SshServerStatsResult,
  SshGpuDeviceStats,
  TestSshConnectionResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

export interface SshConfigApi {
  test: (config: SshConnectionConfig, password?: string) => Promise<TestSshConnectionResult>
}

export interface SshTerminalApi {
  open: (labId: string, size?: SshTerminalSize) => Promise<SshTerminalOpenResult>
  write: (sessionId: string, data: string) => Promise<SshTerminalActionResult>
  resize: (sessionId: string, size: SshTerminalSize) => Promise<SshTerminalActionResult>
  close: (sessionId: string) => Promise<SshTerminalActionResult>
  onData: (callback: (event: SshTerminalDataEvent) => void) => () => void
  onExit: (callback: (event: SshTerminalExitEvent) => void) => () => void
}

export interface SshApi {
  connect: (
    labId: string,
    config: SshConnectionConfig,
    password?: string
  ) => Promise<SshConnectResult>
  disconnect: (labId: string) => Promise<{ success: boolean; error?: string }>
  getStatus: (labId: string) => Promise<{ status: string }>
  getServerStats: (labId: string) => Promise<SshServerStatsResult>
  exec: (labId: string, command: ExecCommand) => Promise<ExecCommandResult>
  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void) => () => void
  terminal: SshTerminalApi
  config: SshConfigApi
}
