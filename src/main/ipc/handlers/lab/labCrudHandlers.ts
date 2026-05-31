import { ipcMain } from 'electron'
import type {
  DeleteLabResult,
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabOptions,
  LabContainerStatus
} from '@shared/types/lab'
import { getLabServices } from './shared'

/**
 * 注册实验室 CRUD 处理器
 */
export function registerLabCrudHandlers(): void {
  const { labService } = getLabServices()

  ipcMain.handle('lab:save', async (_event, data: LabData): Promise<LabResult> => {
    return await labService.saveLab(data)
  })

  ipcMain.handle('lab:load', async (_event, labId: string): Promise<LabData | null> => {
    const lab = await labService.loadLab(labId)
    return lab ? await labService.reconcileSshRuntimeState(lab, { silent: true }) : null
  })

  ipcMain.handle('lab:list', async (): Promise<LabListItem[]> => {
    return labService.listLabs()
  })

  ipcMain.handle(
    'lab:rename',
    async (_event, labId: string, newName: string): Promise<LabResult> => {
      return await labService.renameLab(labId, newName)
    }
  )

  ipcMain.handle('lab:readLog', async (_event, labId: string): Promise<LabLogEntry[]> => {
    return await labService.readOperationLog(labId)
  })

  ipcMain.handle(
    'lab:create',
    async (_event, request: CreateLabRequest): Promise<CreateLabResult> => {
      return labService.createLab(request)
    }
  )

  ipcMain.handle(
    'lab:delete',
    async (_event, labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> => {
      return labService.deleteLab(labId, options)
    }
  )

  ipcMain.handle(
    'lab:checkContainerStatus',
    async (_event, labId: string): Promise<LabContainerStatus | null> => {
      return labService.checkContainerStatus(labId)
    }
  )

  ipcMain.handle('lab:checkAllContainerStatus', async (): Promise<LabContainerStatus[]> => {
    return labService.checkAllLabContainerStatus()
  })

  ipcMain.handle('lab:cleanupOrphan', async (_event, labId: string): Promise<LabResult> => {
    return labService.cleanupOrphanLab(labId)
  })

  ipcMain.handle(
    'lab:recoverOrphan',
    async (_event, labId: string, newContainerId: string): Promise<LabResult> => {
      return labService.recoverOrphanLab(labId, newContainerId)
    }
  )
}
