import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'
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
export const labApi = {
  ...createIpcInvoker<{
    /** 获取当前运行平台的类型 */
    getPlatform: () => Promise<PlatformType>
  }>('lab', ['getPlatform']),

  /** 使用系统默认浏览器打开外部链接 */
  openExternal: (url: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:openExternal', url)
  },

  /** 保存实验室数据 */
  saveLab: (data: LabData): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:save', data)
  },

  /** 加载实验室数据，同步 SSH 运行状态 */
  loadLab: (labId: string): Promise<LabData | null> => {
    return ipcRenderer.invoke('lab:load', labId)
  },

  /** 获取实验室列表 */
  listLabs: (): Promise<LabListItem[]> => {
    return ipcRenderer.invoke('lab:list')
  },

  /** 重命名实验室 */
  renameLab: (labId: string, newName: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:rename', labId, newName)
  },

  /** 读取实验室操作日志 */
  readLabLog: (labId: string): Promise<LabLogEntry[]> => {
    return ipcRenderer.invoke('lab:readLog', labId)
  },

  /** 创建实验室（本地 Docker 或 SSH 远程） */
  createLab: (request: CreateLabRequest): Promise<CreateLabResult> => {
    return ipcRenderer.invoke('lab:create', request)
  },

  /** 删除实验室 */
  deleteLab: (labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> => {
    return ipcRenderer.invoke('lab:delete', labId, options)
  }
}
