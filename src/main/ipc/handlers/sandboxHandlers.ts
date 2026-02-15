import { ipcMain, shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { sandboxService, getDockerConfigService } from '@main/services/sandbox'
import type {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry
} from '@main/types/sandbox'
import type {
  SaveConfigRequest,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig
} from '@shared/types/sandbox'

const execAsync = promisify(exec)

export interface DockerCheckResult {
  installed: boolean
  version?: string
  error?: string
}

export type PlatformType = 'darwin' | 'win32' | 'linux'

/**
 * 初始化沙箱服务
 */
export function initializeSandbox(): void {
  sandboxService.initialize()
  getDockerConfigService().initialize()
}

/**
 * 注册沙箱相关的 IPC 处理程序
 */
export function registerSandboxHandlers(): void {
  // ==================== Docker 检测相关 ====================

  ipcMain.handle('sandbox:checkDocker', async (): Promise<DockerCheckResult> => {
    try {
      const { stdout } = await execAsync('docker --version', { timeout: 5000 })
      const versionMatch = stdout.match(/Docker version ([\d.]+)/)
      const version = versionMatch ? versionMatch[1] : stdout.trim()

      logger.info('Docker 检测成功', 'main', { version })

      return {
        installed: true,
        version
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (
        errorMessage.includes('command not found') ||
        errorMessage.includes('not recognized') ||
        errorMessage.includes('ENOENT')
      ) {
        logger.info('Docker 未安装', 'main')
        return {
          installed: false,
          error: 'Docker 未安装'
        }
      }

      logger.warn('Docker 检测失败', 'main', { error: errorMessage })
      return {
        installed: false,
        error: errorMessage
      }
    }
  })

  ipcMain.handle('sandbox:getPlatform', (): PlatformType => {
    return process.platform as PlatformType
  })

  ipcMain.handle('sandbox:openExternal', async (_event, url: string): Promise<void> => {
    try {
      await shell.openExternal(url)
      logger.info('打开外部链接', 'main', { url })
    } catch (error) {
      logger.error('打开外部链接失败', 'main', { url, error })
      throw error
    }
  })

  // ==================== 沙箱管理相关 ====================

  ipcMain.handle('sandbox:create', async (_event, name?: string): Promise<SandboxData> => {
    return sandboxService.createSandbox(name)
  })

  ipcMain.handle('sandbox:save', async (_event, data: SandboxData): Promise<SandboxResult> => {
    return sandboxService.saveSandbox(data)
  })

  ipcMain.handle('sandbox:load', async (_event, sandboxId: string): Promise<SandboxData | null> => {
    return sandboxService.loadSandbox(sandboxId)
  })

  ipcMain.handle('sandbox:list', async (): Promise<SandboxListItem[]> => {
    return sandboxService.listSandboxs()
  })

  ipcMain.handle('sandbox:delete', async (_event, sandboxId: string): Promise<SandboxResult> => {
    return sandboxService.deleteSandbox(sandboxId)
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

  // ==================== Docker 配置管理 ====================

  const configService = getDockerConfigService()

  // Dockerfile 操作
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

  // Compose 操作
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
