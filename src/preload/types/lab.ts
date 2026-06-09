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
  /** 获取当前运行平台的类型 */
  getPlatform: () => Promise<PlatformType>
  /** 使用系统默认浏览器打开外部链接 */
  openExternal: (url: string) => Promise<LabResult>

  /** 保存实验室数据 */
  saveLab: (data: LabData) => Promise<LabResult>
  /** 加载实验室数据，同步 SSH 运行状态 */
  loadLab: (labId: string) => Promise<LabData | null>
  /** 获取实验室列表 */
  listLabs: () => Promise<LabListItem[]>
  /** 重命名实验室 */
  renameLab: (labId: string, newName: string) => Promise<LabResult>
  /** 读取实验室操作日志 */
  readLabLog: (labId: string) => Promise<LabLogEntry[]>

  /** 创建实验室（本地 Docker 或 SSH 远程） */
  createLab: (request: CreateLabRequest) => Promise<CreateLabResult>
  /** 删除实验室 */
  deleteLab: (labId: string, options?: DeleteLabOptions) => Promise<DeleteLabResult>
}
