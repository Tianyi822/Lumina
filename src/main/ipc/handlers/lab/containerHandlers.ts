import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { frontendLabService } from '@main/services/lab/frontend'
import { classifyDockerError } from '@main/services/lab/docker/dockerErrors'
import type {
  ContainerFilter,
  ContainerListResult,
  ContainerDetailsResult,
  ContainerStatsResult,
  LabResult,
  ExecCommand,
  ExecCommandResult,
  LogOptions,
  ContainerLogsResult
} from '@shared/types/lab'
import { getLabServices, normalizeLabError } from './shared'

/**
 * 注册容器处理器
 */
export function registerLabContainerHandlers(): void {
  const { dockerService } = getLabServices()

  ipcMain.handle(
    'lab:listContainers',
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
        const errorMessage = normalizeLabError(error, '加载容器列表失败')
        const reason = classifyDockerError(error)
        logger.error('[listContainers] 调用失败', 'main', {
          error: errorMessage,
          reason,
          stack: error instanceof Error ? error.stack : undefined
        })
        return {
          success: false,
          error: errorMessage,
          reason
        }
      }
    }
  )

  ipcMain.handle(
    'lab:getContainerDetails',
    async (_event, containerId: string): Promise<ContainerDetailsResult> => {
      try {
        const details = await dockerService.getContainerDetails(containerId)
        if (!details) {
          return {
            success: false,
            error: '未找到容器详情',
            reason: 'not_found'
          }
        }

        return {
          success: true,
          details
        }
      } catch (error) {
        const errorMessage = normalizeLabError(error, '加载容器详情失败')
        const reason = classifyDockerError(error)
        logger.error('获取容器详情失败', 'main', { containerId, error: errorMessage, reason })
        return {
          success: false,
          error: errorMessage,
          reason
        }
      }
    }
  )

  ipcMain.handle(
    'lab:getContainerStats',
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
        const errorMessage = normalizeLabError(error, '加载容器统计失败')
        logger.error('获取容器统计失败', 'main', { containerId, error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle('lab:startContainer', async (_event, containerId: string): Promise<LabResult> => {
    const result = await dockerService.startContainer(containerId)
    if (result.success) {
      const recoveryResult =
        await frontendLabService.recoverFrontendRuntimeByContainerId(containerId)
      if (recoveryResult.warning) {
        logger.warn('容器启动后前端服务未完全恢复', 'main', {
          containerId,
          warning: recoveryResult.warning
        })
      }
    }
    return result
  })

  ipcMain.handle(
    'lab:stopContainer',
    async (_event, containerId: string, timeout?: number): Promise<LabResult> => {
      return dockerService.stopContainer(containerId, timeout)
    }
  )

  ipcMain.handle(
    'lab:restartContainer',
    async (_event, containerId: string): Promise<LabResult> => {
      const result = await dockerService.restartContainer(containerId)
      if (result.success) {
        const recoveryResult =
          await frontendLabService.recoverFrontendRuntimeByContainerId(containerId)
        if (recoveryResult.warning) {
          logger.warn('容器重启后前端服务未完全恢复', 'main', {
            containerId,
            warning: recoveryResult.warning
          })
        }
      }
      return result
    }
  )

  ipcMain.handle(
    'lab:removeContainer',
    async (_event, containerId: string, force?: boolean): Promise<LabResult> => {
      return dockerService.removeContainer(containerId, force)
    }
  )

  ipcMain.handle(
    'lab:execCommand',
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
        const errorMessage = normalizeLabError(error, '命令执行失败')
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
    'lab:getContainerLogs',
    async (_event, containerId: string, options?: LogOptions): Promise<ContainerLogsResult> => {
      try {
        const logs = await dockerService.getContainerLogs(containerId, options)
        return {
          success: true,
          logs
        }
      } catch (error) {
        const errorMessage = normalizeLabError(error, '加载容器日志失败')
        logger.error('获取容器日志失败', 'main', { containerId, error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'lab:copyToContainer',
    async (_event, containerId: string, source: string, target: string): Promise<LabResult> => {
      return dockerService.copyToContainer(containerId, source, target)
    }
  )

  ipcMain.handle(
    'lab:copyFromContainer',
    async (_event, containerId: string, source: string, target: string): Promise<LabResult> => {
      return dockerService.copyFromContainer(containerId, source, target)
    }
  )
}
