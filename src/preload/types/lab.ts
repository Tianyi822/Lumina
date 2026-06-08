// 重导出 @shared/types/lab 中的 SSH 和通用类型
export type {
  PlatformType,
  LabStatus,
  LabCreationType,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabResult,
  DeleteLabOptions,
  ExecCommand,
  ExecResult,
  ExecCommandResult
} from '@shared/types/lab'

// SSH 相关类型
export type {
  SshAuthType,
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectResult,
  SshTerminalSize,
  SshTerminalOpenResult,
  SshTerminalActionResult,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshServerStats,
  SshServerStatsResult
} from '@shared/types/lab'

// 导入用于 LabApi 定义的类型
import type {
  PlatformType,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabResult,
  DeleteLabOptions
} from '@shared/types/lab'

/**
 * 实验室相关的 API
 */
export interface LabApi {
  getPlatform: () => Promise<PlatformType>
  openExternal: (url: string) => Promise<LabResult>

  // 实验室管理
  saveLab: (data: LabData) => Promise<LabResult>
  loadLab: (labId: string) => Promise<LabData | null>
  listLabs: () => Promise<LabListItem[]>
  renameLab: (labId: string, newName: string) => Promise<LabResult>
  readLabLog: (labId: string) => Promise<LabLogEntry[]>

  // 实验室创建/删除
  createLab: (request: CreateLabRequest) => Promise<CreateLabResult>
  deleteLab: (labId: string, options?: DeleteLabOptions) => Promise<DeleteLabResult>
}
