import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import type {
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  SandboxResult,
  ExecCommand,
  ExecCommandResult,
  LogOptions,
  ContainerLogsResult
} from '@shared/types/sandbox'
import { getSandboxServices, normalizeSandboxError } from './shared'

/**
 * 注册容器处理器
 */
export function registerSandboxContainerHandlers(): void {
  const { dockerService } = getSandboxServices()

  ipcMain.handle(
    'sandbox:listContainers',
    async (_event, filter?: ContainerFilter): Promise<ContainerListResult> => {
      logger.info('[listContainers] 开始调用', 'main', { filter })

      try {
        const containers = await dockerService.listContainers(filter)
        logger.info('[listContainers] 调用成功', 'main', {
          count: containers.length,
          firstContainer: containers[0] ? JSON.stringify(containers[0]).substring(0, 200) : null
        })
        return {
          success: true,
          containers
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '加载容器列表失败')
        logger.error('[listContainers] 调用失败', 'main', {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:getContainerDetails',
    async (_event, containerId: string): Promise<ContainerDetailsResult> => {
      try {
        const details = await dockerService.getContainerDetails(containerId)
        if (!details) {
          return {
            success: false,
            error: '未找到容器详情'
          }
        }

        return {
          success: true,
          details
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '加载容器详情失败')
        logger.error('获取容器详情失败', 'main', { containerId, error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:getContainerStats',
    async (_event, containerId: string): Promise<ContainerStatsResult> => {
      try {
        const stats = await dockerService.getContainerStats(containerId)
        if (!stats) {
          return {
            success: false,
            error: '未获取到容器统计信息'
          }
        }

        return {
          success: true,
          stats
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '加载容器统计失败')
        logger.error('获取容器统计失败', 'main', { containerId, error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:startContainer',
    async (_event, containerId: string): Promise<SandboxResult> => {
      return dockerService.startContainer(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:stopContainer',
    async (_event, containerId: string, timeout?: number): Promise<SandboxResult> => {
      return dockerService.stopContainer(containerId, timeout)
    }
  )

  ipcMain.handle(
    'sandbox:restartContainer',
    async (_event, containerId: string): Promise<SandboxResult> => {
      return dockerService.restartContainer(containerId)
    }
  )

  ipcMain.handle(
    'sandbox:removeContainer',
    async (_event, containerId: string, force?: boolean): Promise<SandboxResult> => {
      return dockerService.removeContainer(containerId, force)
    }
  )

  ipcMain.handle(
    'sandbox:execCommand',
    async (_event, containerId: string, command: ExecCommand): Promise<ExecCommandResult> => {
      try {
        const result = await dockerService.execCommand(containerId, command)
        if (!result) {
          return {
            success: false,
            error: '命令执行失败'
          }
        }

        return {
          success: true,
          result
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '命令执行失败')
        logger.error('执行容器命令失败', 'main', {
          containerId,
          command: command.command,
          error: errorMessage
        })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:getContainerLogs',
    async (_event, containerId: string, options?: LogOptions): Promise<ContainerLogsResult> => {
      try {
        const logs = await dockerService.getContainerLogs(containerId, options)
        return {
          success: true,
          logs
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '加载容器日志失败')
        logger.error('获取容器日志失败', 'main', { containerId, error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:copyToContainer',
    async (_event, containerId: string, source: string, target: string): Promise<SandboxResult> => {
      return dockerService.copyToContainer(containerId, source, target)
    }
  )

  ipcMain.handle(
    'sandbox:copyFromContainer',
    async (_event, containerId: string, source: string, target: string): Promise<SandboxResult> => {
      return dockerService.copyFromContainer(containerId, source, target)
    }
  )
}
