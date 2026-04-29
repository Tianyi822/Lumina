import { ipcMain } from 'electron'
import type {
  SaveConfigRequest,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig
} from '@shared/types/lab'
import { getLabServices } from './shared'

/**
 * 注册配置管理处理器
 */
export function registerLabConfigHandlers(): void {
  const { configService } = getLabServices()

  ipcMain.handle(
    'lab:dockerfile:list',
    async (): Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }> => {
      return configService.listDockerfiles()
    }
  )

  ipcMain.handle(
    'lab:dockerfile:load',
    async (
      _event,
      id: string
    ): Promise<{ success: boolean; config?: DockerfileConfig; error?: string }> => {
      return configService.loadDockerfile(id)
    }
  )

  ipcMain.handle(
    'lab:dockerfile:save',
    async (
      _event,
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }> => {
      return configService.saveDockerfile(request)
    }
  )

  ipcMain.handle(
    'lab:dockerfile:delete',
    async (_event, id: string): Promise<{ success: boolean; error?: string }> => {
      return configService.deleteDockerfile(id)
    }
  )

  ipcMain.handle(
    'lab:compose:list',
    async (): Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }> => {
      return configService.listComposes()
    }
  )

  ipcMain.handle(
    'lab:compose:load',
    async (
      _event,
      id: string
    ): Promise<{ success: boolean; config?: ComposeConfig; error?: string }> => {
      return configService.loadCompose(id)
    }
  )

  ipcMain.handle(
    'lab:compose:save',
    async (
      _event,
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }> => {
      return configService.saveCompose(request)
    }
  )

  ipcMain.handle(
    'lab:compose:delete',
    async (_event, id: string): Promise<{ success: boolean; error?: string }> => {
      return configService.deleteCompose(id)
    }
  )
}
