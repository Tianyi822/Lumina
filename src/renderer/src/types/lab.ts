export type {
  PlatformType,
  ExecCommand,
  ExecCommandResult,
  ExecResult,
  SshGpuDeviceStats,
  SshServerStats,
  SshServerStatsResult,
  SshAuthType,
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectResult,
  SshTerminalSize,
  SshTerminalOpenResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent
} from '@shared/types/lab'

export type {
  LabStatus as LabStatus,
  LabCreationType as LabCreationType,
  LabData as LabData,
  LabListItem as LabListItem,
  LabResult as LabResult,
  LabLogEntry as LabLogEntry,
  CreateLabRequest as CreateLabRequest,
  CreateLabResult as CreateLabResult,
  DeleteLabOptions as DeleteLabOptions,
  DeleteLabResult as DeleteLabResult,
  LabPermissionPolicy as LabPermissionPolicy
} from '@shared/types/lab'

export {
  LAB_TYPE_PERMISSIONS as LAB_TYPE_PERMISSIONS,
  isManagedLab as isManagedLab,
  isReadOnlyLab as isReadOnlyLab
} from '@shared/types/lab'
