import { ipcMain } from 'electron'
import type {
  DeleteLabResult,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult
} from '@shared/types/lab'
import { getLabServices } from './shared'

/**
 * 注册实验室 CRUD 相关的 IPC 处理程序
 * 处理实验室数据的增删改查和日志读取等操作
 */
export function registerLabCrudHandlers(): void {
  const { labService } = getLabServices()

  // 保存实验室数据
  ipcMain.handle('lab:save', async (_event, data: LabData): Promise<LabResult> => {
    return await labService.saveLab(data)
  })

  // 加载实验室数据，同时同步 SSH 运行状态
  ipcMain.handle('lab:load', async (_event, labId: string): Promise<LabData | null> => {
    const lab = await labService.loadLab(labId)
    return lab ? await labService.reconcileSshRuntimeState(lab, { silent: true }) : null
  })

  // 获取实验室列表
  ipcMain.handle('lab:list', async (): Promise<LabListItem[]> => {
    return labService.listLabs()
  })

  // 重命名实验室
  ipcMain.handle(
    'lab:rename',
    async (_event, labId: string, newName: string): Promise<LabResult> => {
      return await labService.renameLab(labId, newName)
    }
  )

  // 读取实验室操作日志
  ipcMain.handle('lab:readLog', async (_event, labId: string): Promise<LabLogEntry[]> => {
    return await labService.readOperationLog(labId)
  })

  // 创建实验室（本地 Docker 或 SSH 远程）
  ipcMain.handle(
    'lab:create',
    async (_event, request: CreateLabRequest): Promise<CreateLabResult> => {
      return labService.createLab(request)
    }
  )

  // 删除实验室
  ipcMain.handle(
    'lab:delete',
    async (_event, labId: string): Promise<DeleteLabResult> => {
      return labService.deleteLab(labId)
    }
  )
}
