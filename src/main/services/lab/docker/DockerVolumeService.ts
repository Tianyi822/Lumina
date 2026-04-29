import { logger } from '@main/services/logger'
import type { LabResult } from '@shared/types/lab'
import type {
  DockerServiceContext,
  DockerVolumeCreateOptions,
  DockerVolumeInfo,
  DockerVolumeRemoveOptions
} from './types'

/**
 * Docker volume 管理服务
 */
export class DockerVolumeService {
  constructor(private readonly context: DockerServiceContext) {}

  /**
   * 创建 named volume
   */
  async createVolume(options: DockerVolumeCreateOptions): Promise<DockerVolumeInfo> {
    await this.context.getDocker().createVolume({
      Name: options.name,
      Driver: options.driver,
      Labels: options.labels
    })

    const info = await this.context.getDocker().getVolume(options.name).inspect()
    const mapped = this.mapVolumeInfo(info)

    logger.info('Docker volume 创建成功', 'main', {
      volumeName: mapped.name,
      driver: mapped.driver
    })

    return mapped
  }

  /**
   * 获取 volume 详情
   */
  async getVolume(name: string): Promise<DockerVolumeInfo | null> {
    try {
      const info = await this.context.getDocker().getVolume(name).inspect()
      return this.mapVolumeInfo(info)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('404') || errorMessage.includes('No such volume')) {
        return null
      }

      logger.error('获取 Docker volume 失败', 'main', {
        volumeName: name,
        error: errorMessage
      })
      return null
    }
  }

  /**
   * 列出 volumes
   */
  async listVolumes(): Promise<DockerVolumeInfo[]> {
    try {
      const result = await this.context.getDocker().listVolumes()
      const volumes = result.Volumes || []
      return volumes.map((volume) => this.mapVolumeInfo(volume))
    } catch (error) {
      logger.error('列出 Docker volume 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * 删除 volume
   */
  async removeVolume(name: string, options?: DockerVolumeRemoveOptions): Promise<LabResult> {
    try {
      await this.context
        .getDocker()
        .getVolume(name)
        .remove({
          force: options?.force || false
        })

      logger.info('Docker volume 删除成功', 'main', { volumeName: name })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除 Docker volume 失败', 'main', {
        volumeName: name,
        error: errorMessage
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 检查 volume 是否存在
   */
  async volumeExists(name: string): Promise<boolean> {
    return (await this.getVolume(name)) !== null
  }

  /**
   * 校验 volume 是否属于指定实验室
   */
  async isVolumeOwnedByLab(name: string, labId: string): Promise<boolean> {
    const volume = await this.getVolume(name)
    return volume?.labels?.['lumina.lab-id'] === labId
  }

  private mapVolumeInfo(volume: {
    Name?: string
    Driver?: string
    Labels?: Record<string, string>
    Mountpoint?: string
    CreatedAt?: string
    Scope?: string
  }): DockerVolumeInfo {
    return {
      name: volume.Name || '',
      driver: volume.Driver,
      labels: volume.Labels || {},
      mountpoint: volume.Mountpoint,
      createdAt: volume.CreatedAt,
      scope: volume.Scope
    }
  }
}
