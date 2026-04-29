import { logger } from '@main/services/logger'
import type { ContainerStats, LogOptions } from '@shared/types/lab'
import type { DockerServiceContext } from './types'
import { serialize } from './types'

/**
 * Docker 统计与日志服务
 */
export class DockerStatsService {
  constructor(private readonly context: DockerServiceContext) {}

  /**
   * 获取容器资源统计
   * @param containerId 容器 ID
   * @returns 统计信息
   */
  async getContainerStats(containerId: string): Promise<ContainerStats | null> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      const rawStats = await container.stats({ stream: false })
      const stats = serialize(rawStats)

      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
      const cpuPercent =
        systemDelta > 0 && cpuDelta > 0
          ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100
          : 0

      const memoryUsage = stats.memory_stats.usage || 0
      const memoryLimit = stats.memory_stats.limit || 1
      const memoryPercent = (memoryUsage / memoryLimit) * 100

      let rxBytes = 0
      let txBytes = 0

      if (stats.networks) {
        for (const network of Object.values(stats.networks)) {
          rxBytes += (network as { rx_bytes?: number }).rx_bytes || 0
          txBytes += (network as { tx_bytes?: number }).tx_bytes || 0
        }
      }

      let readBytes = 0
      let writeBytes = 0

      if (stats.blkio_stats?.io_service_bytes_recursive) {
        for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
          if (entry?.op === 'read') readBytes += entry.value || 0
          if (entry?.op === 'write') writeBytes += entry.value || 0
        }
      }

      return serialize({
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: {
          usage: memoryUsage,
          limit: memoryLimit,
          percent: Math.round(memoryPercent * 100) / 100
        },
        network: {
          rxBytes,
          txBytes
        },
        blockIO: {
          readBytes,
          writeBytes
        }
      })
    } catch (error) {
      logger.error('获取容器统计失败', 'main', { error, containerId })
      return null
    }
  }

  /**
   * 获取容器日志
   * @param containerId 容器 ID
   * @param options 日志选项
   * @returns 日志内容
   */
  async getContainerLogs(containerId: string, options?: LogOptions): Promise<string> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail || 100,
        follow: false,
        since: options?.since,
        until: options?.until,
        timestamps: true
      })

      return logs.toString('utf-8')
    } catch (error) {
      logger.error('获取容器日志失败', 'main', { error, containerId })
      return ''
    }
  }
}
