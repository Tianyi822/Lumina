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

export type {
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectionStatusEvent,
  SshConnectResult,
  SaveSshConfigRequest,
  SaveSshConfigResult,
  ListSshConfigsResult,
  TestSshConnectionResult
} from '@shared/types/lab'

export interface SshConfigApi {
  list: () => Promise<ListSshConfigsResult>
  save: (request: SaveSshConfigRequest) => Promise<SaveSshConfigResult>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  test: (config: SshConnectionConfig) => Promise<TestSshConnectionResult>
}

export interface SshApi {
  connect: (labId: string, config: SshConnectionConfig) => Promise<SshConnectResult>
  disconnect: (labId: string) => Promise<{ success: boolean; error?: string }>
  getStatus: (labId: string) => Promise<{ status: string }>
  exec: (labId: string, command: ExecCommand) => Promise<ExecCommandResult>
  onConnectionStatus: (callback: (event: SshConnectionStatusEvent) => void) => () => void
  config: SshConfigApi
}
