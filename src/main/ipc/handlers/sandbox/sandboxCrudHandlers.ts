import { ipcMain } from 'electron'
import type {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  CreateSandboxRequest,
  CreateSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus
} from '@shared/types/sandbox'
import { getSandboxServices } from './shared'

/**
 * 注册沙箱 CRUD 处理器
 */
export function registerSandboxCrudHandlers(): void {
  const { sandboxService } = getSandboxServices()

  ipcMain.handle('sandbox:save', async (_event, data: SandboxData): Promise<SandboxResult> => {
    return sandboxService.saveSandbox(data)
  })

  ipcMain.handle('sandbox:load', async (_event, sandboxId: string): Promise<SandboxData | null> => {
    return sandboxService.loadSandbox(sandboxId)
  })

  ipcMain.handle('sandbox:list', async (): Promise<SandboxListItem[]> => {
    return sandboxService.listSandboxs()
  })

  ipcMain.handle(
    'sandbox:rename',
    async (_event, sandboxId: string, newName: string): Promise<SandboxResult> => {
      return sandboxService.renameSandbox(sandboxId, newName)
    }
  )

  ipcMain.handle(
    'sandbox:readLog',
    async (_event, sandboxId: string): Promise<SandboxLogEntry[]> => {
      return sandboxService.readOperationLog(sandboxId)
    }
  )

  ipcMain.handle(
    'sandbox:create',
    async (_event, request: CreateSandboxRequest): Promise<CreateSandboxResult> => {
      return sandboxService.createSandbox(request)
    }
  )

  ipcMain.handle(
    'sandbox:delete',
    async (
      _event,
      sandboxId: string,
      options?: DeleteSandboxOptions
    ): Promise<{ success: boolean; removedContainers?: string[]; error?: string }> => {
      return sandboxService.deleteSandbox(sandboxId, options)
    }
  )

  ipcMain.handle(
    'sandbox:checkContainerStatus',
    async (_event, sandboxId: string): Promise<SandboxContainerStatus | null> => {
      return sandboxService.checkContainerStatus(sandboxId)
    }
  )

  ipcMain.handle('sandbox:checkAllContainerStatus', async (): Promise<SandboxContainerStatus[]> => {
    return sandboxService.checkAllSandboxContainerStatus()
  })

  ipcMain.handle(
    'sandbox:cleanupOrphan',
    async (_event, sandboxId: string): Promise<SandboxResult> => {
      return sandboxService.cleanupOrphanSandbox(sandboxId)
    }
  )

  ipcMain.handle(
    'sandbox:recoverOrphan',
    async (_event, sandboxId: string, newContainerId: string): Promise<SandboxResult> => {
      return sandboxService.recoverOrphanSandbox(sandboxId, newContainerId)
    }
  )
}
