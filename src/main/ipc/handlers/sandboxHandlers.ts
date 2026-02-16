import { ipcMain, shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { sandboxService, getDockerConfigService, getDockerService } from '@main/services/sandbox'
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
  ComposeConfig,
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ContainerFilter,
  ExecCommand,
  ExecResult,
  LogOptions,
  SandboxSelection
} from '@shared/types/sandbox'

const execAsync = promisify(exec)

// ==================== 会话沙箱关联存储 ====================

/** 容器 ID 到沙箱选择的映射 */
const containerSelections = new Map<string, SandboxSelection>()

/** 会话 ID 到容器 ID 的映射 */
const sessionContainers = new Map<string, string>()

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
  getDockerService().initialize()
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

  // ==================== Docker 容器操作 ====================

  const dockerSvc = getDockerService()

  ipcMain.handle(
    'sandbox:listContainers',
    async (_event, filter?: ContainerFilter): Promise<ContainerInfo[]> => {
      logger.info('[listContainers] 开始调用', 'main', { filter })
      try {
        const result = await dockerSvc.listContainers(filter)
        logger.info('[listContainers] 调用成功', 'main', {
          count: result.length,
          firstContainer: result[0] ? JSON.stringify(result[0]).substring(0, 200) : null
        })
        return result
      } catch (error) {
        logger.error('[listContainers] 调用失败', 'main', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
        throw error
      }
    }
  )

  ipcMain.handle(
    'sandbox:getContainerDetails',
    async (_event, containerId: string): Promise<ContainerDetails | null> => {
      return dockerSvc.getContainerDetails(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:getContainerStats',
    async (_event, containerId: string): Promise<ContainerStats | null> => {
      return dockerSvc.getContainerStats(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:startContainer',
    async (_event, containerId: string): Promise<SandboxResult> => {
      return dockerSvc.startContainer(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:stopContainer',
    async (_event, containerId: string, timeout?: number): Promise<SandboxResult> => {
      return dockerSvc.stopContainer(containerId, timeout)
    }
  )

  ipcMain.handle(
    'sandbox:restartContainer',
    async (_event, containerId: string): Promise<SandboxResult> => {
      return dockerSvc.restartContainer(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:removeContainer',
    async (_event, containerId: string, force?: boolean): Promise<SandboxResult> => {
      return dockerSvc.removeContainer(containerId, force)
    }
  )

  ipcMain.handle(
    'sandbox:execCommand',
    async (_event, containerId: string, command: ExecCommand): Promise<ExecResult | null> => {
      return dockerSvc.execCommand(containerId, command)
    }
  )

  ipcMain.handle(
    'sandbox:getContainerLogs',
    async (_event, containerId: string, options?: LogOptions): Promise<string> => {
      return dockerSvc.getContainerLogs(containerId, options)
    }
  )

  ipcMain.handle(
    'sandbox:copyToContainer',
    async (_event, containerId: string, source: string, target: string): Promise<SandboxResult> => {
      return dockerSvc.copyToContainer(containerId, source, target)
    }
  )

  ipcMain.handle(
    'sandbox:copyFromContainer',
    async (_event, containerId: string, source: string, target: string): Promise<SandboxResult> => {
      return dockerSvc.copyFromContainer(containerId, source, target)
    }
  )

  // ==================== 会话沙箱关联 ====================

  ipcMain.handle(
    'sandbox:selectSandbox',
    async (_event, containerId: string, sessionId?: string): Promise<SandboxResult> => {
      try {
        // 获取容器信息
        const containers = await dockerSvc.listContainers()
        const container = containers.find((c) => c.id === containerId)

        if (!container) {
          return { success: false, error: '容器不存在' }
        }

        // 创建选择记录
        const selection: SandboxSelection = {
          containerId,
          containerName: container.names[0]?.replace(/^\//, '') || containerId.substring(0, 12),
          image: container.image,
          selectedAt: new Date().toISOString(),
          sessionId
        }

        // 保存映射关系
        containerSelections.set(containerId, selection)
        if (sessionId) {
          sessionContainers.set(sessionId, containerId)
        }

        logger.info('选择沙箱成功', 'main', {
          containerId: containerId.substring(0, 12),
          sessionId
        })

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('选择沙箱失败', 'main', { error: errorMessage, containerId })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'sandbox:deselectSandbox',
    async (_event, containerId: string): Promise<SandboxResult> => {
      try {
        const selection = containerSelections.get(containerId)

        if (selection?.sessionId) {
          sessionContainers.delete(selection.sessionId)
        }

        containerSelections.delete(containerId)

        logger.info('取消选择沙箱成功', 'main', {
          containerId: containerId.substring(0, 12)
        })

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('取消选择沙箱失败', 'main', { error: errorMessage, containerId })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'sandbox:getSessionSandbox',
    async (_event, sessionId: string): Promise<SandboxSelection | null> => {
      try {
        const containerId = sessionContainers.get(sessionId)
        if (!containerId) {
          return null
        }

        return containerSelections.get(containerId) || null
      } catch (error) {
        logger.error('获取会话沙箱失败', 'main', {
          error: error instanceof Error ? error.message : String(error),
          sessionId
        })
        return null
      }
    }
  )
}
