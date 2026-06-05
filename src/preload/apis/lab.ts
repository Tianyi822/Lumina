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

export const labApi = {
  ...createIpcInvoker<{
    getPlatform: () => Promise<PlatformType>
  }>('lab', ['getPlatform']),

  openExternal: (url: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:openExternal', url)
  },

  // ==================== Lab Management ====================

  saveLab: (data: LabData): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:save', data)
  },

  loadLab: (labId: string): Promise<LabData | null> => {
    return ipcRenderer.invoke('lab:load', labId)
  },

  listLabs: (): Promise<LabListItem[]> => {
    return ipcRenderer.invoke('lab:list')
  },

  renameLab: (labId: string, newName: string): Promise<LabResult> => {
    return ipcRenderer.invoke('lab:rename', labId, newName)
  },

  readLabLog: (labId: string): Promise<LabLogEntry[]> => {
    return ipcRenderer.invoke('lab:readLog', labId)
  },

  // ==================== 实验室创建/删除 ====================

  createLab: (request: CreateLabRequest): Promise<CreateLabResult> => {
    return ipcRenderer.invoke('lab:create', request)
  },

  deleteLab: (labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> => {
    return ipcRenderer.invoke('lab:delete', labId, options)
  }
}
