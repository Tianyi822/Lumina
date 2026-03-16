import { ipcMain } from 'electron'
import type {
  SaveConfigRequest,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig
} from '@shared/types/sandbox'
import { getSandboxServices } from './shared'

/**
 * 注册配置管理处理器
 */
export function registerSandboxConfigHandlers(): void {
  const { configService } = getSandboxServices()

  ipcMain.handle(
    'sandbox:dockerfile:list',
    async (): Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }> => {
      return configService.listDockerfiles()
    }
  )

  ipcMain.handle(
    'sandbox:dockerfile:load',
    async (
      _event,
      id: string
    ): Promise<{ success: boolean; config?: DockerfileConfig; error?: string }> => {
      return configService.loadDockerfile(id)
    }
  )

  ipcMain.handle(
    'sandbox:dockerfile:save',
    async (
      _event,
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }> => {
      return configService.saveDockerfile(request)
    }
  )

  ipcMain.handle(
    'sandbox:dockerfile:delete',
    async (_event, id: string): Promise<{ success: boolean; error?: string }> => {
      return configService.deleteDockerfile(id)
    }
  )

  ipcMain.handle(
    'sandbox:compose:list',
    async (): Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }> => {
      return configService.listComposes()
    }
  )

  ipcMain.handle(
    'sandbox:compose:load',
    async (
      _event,
      id: string
    ): Promise<{ success: boolean; config?: ComposeConfig; error?: string }> => {
      return configService.loadCompose(id)
    }
  )

  ipcMain.handle(
    'sandbox:compose:save',
    async (
      _event,
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }> => {
      return configService.saveCompose(request)
    }
  )

  ipcMain.handle(
    'sandbox:compose:delete',
    async (_event, id: string): Promise<{ success: boolean; error?: string }> => {
      return configService.deleteCompose(id)
    }
  )
}
