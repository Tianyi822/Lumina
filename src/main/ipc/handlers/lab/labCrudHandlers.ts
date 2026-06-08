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
    async (_event, labId: string): Promise<DeleteLabResult> => {
      return labService.deleteLab(labId)
    }
  )
}
