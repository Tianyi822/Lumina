import type {
  SshConnectionConfig,
  SshConnectionStatusEvent,
  SaveSshConfigRequest,
  SaveSshConfigResult,
  ListSshConfigsResult,
  TestSshConnectionResult,
  ExecCommand,
  ExecCommandResult,
  SshConnectResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

export type {
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectionStatusEvent,
  SshConnectResult,
  SaveSshConfigRequest,
  SaveSshConfigResult,
  ListSshConfigsResult,
  TestSshConnectionResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalSize
} from '@shared/types/lab'

export interface SshConfigApi {
  list: () => Promise<ListSshConfigsResult>
  save: (request: SaveSshConfigRequest) => Promise<SaveSshConfigResult>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  test: (config: SshConnectionConfig) => Promise<TestSshConnectionResult>
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
  connect: (labId: string, config: SshConnectionConfig) => Promise<SshConnectResult>
  disconnect: (labId: string) => Promise<{ success: boolean; error?: string }>
  getStatus: (labId: string) => Promise<{ status: string }>
  exec: (labId: string, command: ExecCommand) => Promise<ExecCommandResult>
  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void) => () => void
  terminal: SshTerminalApi
  config: SshConfigApi
}
