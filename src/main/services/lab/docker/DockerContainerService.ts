import Docker from 'dockerode'
import * as fs from 'fs'
import { logger } from '@main/services/logger'
import type { ContainerDetails, ContainerFilter, ContainerInfo, LabResult } from '@shared/types/lab'
import { DockerContainerMapper } from './DockerContainerMapper'
import type { DockerContainerInfo, DockerServiceContext } from './types'
import { serialize } from './types'

/**
 * Docker 容器管理服务
 */
export class DockerContainerService {
  private readonly context: DockerServiceContext
  private readonly mapper: DockerContainerMapper

  constructor(context: DockerServiceContext, mapper: DockerContainerMapper) {
    this.context = context
    this.mapper = mapper
  }

  /**
   * 获取容器列表
   * @param filter 过滤条件
   * @returns 容器列表
   */
  async listContainers(filter?: ContainerFilter): Promise<ContainerInfo[]> {
    try {
      const opts: Docker.ContainerListOptions = { all: true }

      if (filter?.state && filter.state !== 'all') {
        if (filter.state === 'running') {
          opts.filters = { status: ['running'] }
        } else if (filter.state === 'stopped') {
          opts.filters = { status: ['exited', 'dead'] }
        } else {
          opts.filters = { status: [filter.state] }
        }
      }

      logger.info('[DockerService] 调用 Docker API listContainers', 'main', { opts })
      const containers = await this.context.getDocker().listContainers(opts)
      logger.info('[DockerService] Docker API 返回原始数据', 'main', {
        count: containers.length,
        firstContainerType: containers[0] ? typeof containers[0] : null,
        firstContainerKeys: containers[0] ? Object.keys(containers[0]) : null
      })

      const serializedContainers: DockerContainerInfo[] = serialize(containers)
      logger.info('[DockerService] 序列化后数据', 'main', {
        count: serializedContainers.length,
        sample: serializedContainers[0]
          ? JSON.stringify(serializedContainers[0]).substring(0, 500)
          : '<empty>'
      })

      let result = serializedContainers.map((container) => this.mapper.mapContainerInfo(container))

      if (filter?.name) {
        const query = filter.name.toLowerCase()
        result = result.filter((container) =>
          container.names.some((name) => name.toLowerCase().includes(query))
        )
      }

      if (filter?.image) {
        const query = filter.image.toLowerCase()
        result = result.filter((container) => container.image.toLowerCase().includes(query))
      }

      const finalResult = serialize(result)
      logger.info('[DockerService] 最终结果', 'main', {
        count: finalResult.length,
        sample: finalResult[0]
          ? JSON.stringify(finalResult[0]).substring(0, 500)
          : '<empty>'
      })

      return finalResult
    } catch (error) {
      logger.error('[DockerService] 获取容器列表失败', 'main', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return []
    }
  }

  /**
   * 获取容器详情
   * @param containerId 容器 ID
   * @returns 容器详情
   */
  async getContainerDetails(containerId: string): Promise<ContainerDetails | null> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      const rawInfo = await container.inspect()
      const info = serialize(rawInfo)
      const baseInfo = await this.mapper.getContainerBaseInfo(containerId)

      const cmd = info.Config?.Cmd
      const entrypoint = info.Config?.Entrypoint

      return serialize({
        ...baseInfo,
        hostConfig: this.mapper.mapHostConfig(info),
        networkSettings: this.mapper.mapNetworkSettings(info),
        mounts: this.mapper.mapMounts(info),
        env: info.Config?.Env || [],
        cmd: Array.isArray(cmd) ? cmd : cmd ? [cmd] : [],
        workingDir: info.Config?.WorkingDir || '',
        entrypoint: Array.isArray(entrypoint) ? entrypoint : entrypoint ? [entrypoint] : []
      })
    } catch (error) {
      logger.error('获取容器详情失败', 'main', { error, containerId })
      return null
    }
  }

  /**
   * 启动容器
   * @param containerId 容器 ID
   * @returns 操作结果
   */
  async startContainer(containerId: string): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      await container.start()
      logger.info('容器启动成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      return this.handleContainerOperationError('start', containerId, error)
    }
  }

  /**
   * 停止容器
   * @param containerId 容器 ID
   * @param timeout 停止超时
   * @returns 操作结果
   */
  async stopContainer(containerId: string, timeout?: number): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      await container.stop({ t: timeout || 10 })
      logger.info('容器停止成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      return this.handleContainerOperationError('stop', containerId, error)
    }
  }

  /**
   * 重启容器
   * @param containerId 容器 ID
   * @returns 操作结果
   */
  async restartContainer(containerId: string): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      await container.restart()
      logger.info('容器重启成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      return this.handleContainerOperationError('restart', containerId, error)
    }
  }

  /**
   * 删除容器
   * @param containerId 容器 ID
   * @param force 是否强制删除
   * @returns 操作结果
   */
  async removeContainer(containerId: string, force?: boolean): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      await container.remove({ force: force || false })
      logger.info('容器删除成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      return this.handleContainerOperationError('remove', containerId, error)
    }
  }

  /**
   * 检查容器是否存在
   * @param containerId 容器 ID
   * @returns 是否存在
   */
  async containerExists(containerId: string): Promise<boolean> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      await container.inspect()
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('404') || errorMessage.includes('No such container')) {
        return false
      }
      logger.warn('检查容器存在性失败', 'main', { error: errorMessage, containerId })
      return false
    }
  }

  /**
   * 批量检查多个容器是否存在
   * @param containerIds 容器 ID 列表
   * @returns 存在性映射
   */
  async containersExist(containerIds: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()

    await Promise.all(
      containerIds.map(async (containerId) => {
        result.set(containerId, await this.containerExists(containerId))
      })
    )

    return result
  }

  /**
   * 根据 Compose 项目名获取容器
   * @param projectName 项目名
   * @returns 容器列表
   */
  async getContainersByComposeProject(projectName: string): Promise<ContainerInfo[]> {
    try {
      const allContainers = await this.listContainers({ state: 'all' })
      const composeLabel = `com.docker.compose.project=${projectName}`

      return allContainers.filter((container) =>
        Object.entries(container.labels).some(([key, value]) => `${key}=${value}` === composeLabel)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目容器失败', 'main', { error: errorMessage, projectName })
      return []
    }
  }

  /**
   * 复制文件到容器
   * @param containerId 容器 ID
   * @param source 源文件
   * @param target 目标路径
   * @returns 操作结果
   */
  async copyToContainer(containerId: string, source: string, target: string): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      const content = await fs.promises.readFile(source)

      await container.putArchive(content, { path: target })

      logger.info('文件复制到容器成功', 'main', {
        containerId: containerId.substring(0, 12),
        source,
        target
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('复制文件到容器失败', 'main', {
        error: errorMessage,
        containerId,
        source,
        target
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 批量复制本地文件到容器（单次 Docker API 调用）
   * 读取所有源文件，构建单个 tar 一并发送到容器
   * @param containerId 容器 ID
   * @param files 文件映射列表（本地路径 → 容器内相对路径）
   * @param basePath 容器内目标基路径
   * @param concurrency 并发读取文件数，默认 8
   * @returns 逐文件写入结果
   */
  async copyFilesToContainer(
    containerId: string,
    files: Array<{ source: string; target: string }>,
    basePath: string = '/app',
    concurrency: number = 8
  ): Promise<LabResult> {
    try {
      const entries: Array<{
        path: string
        content: Buffer
        sourcePath: string
      }> = []
      const failures: string[] = []

      // 分批并发读取源文件
      for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency)
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              await fs.promises.access(file.source, fs.constants.R_OK)
              const content = await fs.promises.readFile(file.source)
              return { success: true as const, ...file, content }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              logger.warn('读取源文件失败', 'main', { source: file.source, error: message })
              return { success: false as const, ...file, error: message }
            }
          })
        )

        for (const result of batchResults) {
          if (result.success) {
            entries.push({
              path: result.target,
              content: result.content,
              sourcePath: result.source
            })
          } else {
            failures.push(result.source)
          }
        }
      }

      if (entries.length === 0) {
        return {
          success: false,
          error: `所有文件读取失败: ${failures.join(', ')}`
        }
      }

      // 从内存直接构建 tar
      const { buildTarArchive } = await import('../file/tarBuilder')
      const now = Math.floor(Date.now() / 1000)

      // 收集目录条目
      const dirSet = new Set<string>()
      for (const entry of entries) {
        const parts = entry.path.split('/')
        for (let j = 1; j < parts.length; j++) {
          dirSet.add(parts.slice(0, j).join('/'))
        }
      }

      const tarEntries: Array<{
        path: string
        type: 'file' | 'directory'
        mode: number
        mtime: number
        content?: Buffer
      }> = []

      const sortedDirs = Array.from(dirSet).sort()
      for (const dirPath of sortedDirs) {
        tarEntries.push({ path: `${dirPath}/`, type: 'directory', mode: 0o755, mtime: now })
      }

      const sortedFiles = [...entries].sort((a, b) => a.path.localeCompare(b.path))
      for (const file of sortedFiles) {
        tarEntries.push({
          path: file.path,
          type: 'file',
          mode: 0o644,
          mtime: now,
          content: file.content
        })
      }

      const archive = buildTarArchive(tarEntries)
      const container = this.context.getDocker().getContainer(containerId)
      await container.putArchive(archive, { path: basePath })

      logger.info('批量复制文件到容器成功', 'main', {
        containerId: containerId.substring(0, 12),
        copiedCount: entries.length,
        failedCount: failures.length,
        basePath
      })

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('批量复制文件到容器失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 从容器复制文件
   * @param containerId 容器 ID
   * @param source 容器内路径
   * @param target 本地目标路径
   * @returns 操作结果
   */
  async copyFromContainer(containerId: string, source: string, target: string): Promise<LabResult> {
    try {
      const container = this.context.getDocker().getContainer(containerId)
      const stream = await container.getArchive({ path: source })

      return await new Promise((resolve) => {
        const chunks: Buffer[] = []

        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', async () => {
          try {
            const content = Buffer.concat(chunks)
            await fs.promises.writeFile(target, content)

            logger.info('从容器复制文件成功', 'main', {
              containerId: containerId.substring(0, 12),
              source,
              target
            })

            resolve({ success: true })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            resolve({ success: false, error: errorMessage })
          }
        })
        stream.on('error', (error: Error) => {
          resolve({ success: false, error: error.message })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('从容器复制文件失败', 'main', {
        error: errorMessage,
        containerId,
        source,
        target
      })
      return { success: false, error: errorMessage }
    }
  }

  private handleContainerOperationError(
    operation: 'start' | 'stop' | 'restart' | 'remove',
    containerId: string,
    error: unknown
  ): LabResult {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const friendlyError = this.getFriendlyOperationError(operation, errorMessage)
    const actionMap = {
      start: '启动',
      stop: '停止',
      restart: '重启',
      remove: '删除'
    }

    if (friendlyError === errorMessage) {
      logger.error(`容器${actionMap[operation]}失败`, 'main', { error: errorMessage, containerId })
    } else {
      logger.warn(`容器${actionMap[operation]}失败`, 'main', {
        reason: friendlyError,
        containerId: containerId.substring(0, 12)
      })
    }

    return { success: false, error: friendlyError }
  }

  private getFriendlyOperationError(
    operation: 'start' | 'stop' | 'restart' | 'remove',
    errorMessage: string
  ): string {
    if (operation === 'start') {
      if (errorMessage.includes('HTTP code 304') || errorMessage.includes('already started')) {
        return '容器已经在运行中'
      }
      if (errorMessage.includes('permission denied')) {
        return '权限不足，无法启动容器'
      }
    }

    if (operation === 'stop') {
      if (errorMessage.includes('HTTP code 304') || errorMessage.includes('already stopped')) {
        return '容器已经停止'
      }
      if (errorMessage.includes('permission denied')) {
        return '权限不足，无法停止容器'
      }
    }

    if (operation === 'restart' && errorMessage.includes('permission denied')) {
      return '权限不足，无法重启容器'
    }

    if (operation === 'remove') {
      if (errorMessage.includes('HTTP code 409') || errorMessage.includes('container is running')) {
        return '容器正在运行，请先停止容器后再删除'
      }
      if (errorMessage.includes('permission denied')) {
        return '权限不足，无法删除容器'
      }
    }

    if (errorMessage.includes('HTTP code 404') || errorMessage.includes('No such container')) {
      return operation === 'remove' ? '容器不存在，可能已被手动删除' : '容器不存在，可能已被删除'
    }

    return errorMessage
  }
}
