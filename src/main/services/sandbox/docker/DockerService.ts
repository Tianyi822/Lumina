import Docker from 'dockerode'
import { logger } from '@main/services/logger'
import type {
  ComposeDownOptions,
  ComposeExecOptions,
  ComposeLogOptions,
  ComposeStopOptions,
  ContainerFilter,
  ExecCommand,
  LogOptions
} from '@shared/types/sandbox'
import { DockerComposeService } from './DockerComposeService'
import { DockerContainerMapper } from './DockerContainerMapper'
import { DockerContainerService } from './DockerContainerService'
import { DockerExecService } from './DockerExecService'
import { DockerImageService } from './DockerImageService'
import { DockerStatsService } from './DockerStatsService'
import type {
  BuildImageFromDockerfileOptions,
  ComposeUpOptions,
  CreateContainerFromImageOptions,
  DockerAvailabilityResult,
  DockerServiceContext
} from './types'

/**
 * Docker 统一服务入口
 */
export class DockerService implements DockerServiceContext {
  private docker: Docker | null = null
  private initialized = false

  private readonly containerMapper = new DockerContainerMapper(this)
  private readonly containerService = new DockerContainerService(this, this.containerMapper)
  private readonly execService = new DockerExecService(this)
  private readonly statsService = new DockerStatsService(this)
  private readonly imageService = new DockerImageService(this)
  private readonly composeService = new DockerComposeService(
    this,
    this.containerService,
    this.execService,
    this.statsService
  )

  /**
   * 初始化 Docker 客户端
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    try {
      this.docker = new Docker()
      this.initialized = true
      logger.info('Docker 服务初始化成功')
    } catch (error) {
      const errorMessage = `Docker 服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 获取 Docker 客户端
   * @returns Docker 客户端实例
   */
  getDocker(): Docker {
    if (!this.initialized || !this.docker) {
      throw new Error('Docker 服务未初始化')
    }

    return this.docker
  }

  /**
   * 检查 Docker 是否可用
   * @returns 可用性结果
   */
  async checkAvailable(): Promise<DockerAvailabilityResult> {
    try {
      const version = await this.getDocker().version()
      return {
        available: true,
        version: version.Version
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('Docker 不可用', 'main', { error: errorMessage })
      return {
        available: false,
        error: errorMessage
      }
    }
  }

  /**
   * 获取容器列表
   * @param filter 过滤条件
   * @returns 容器列表
   */
  async listContainers(filter?: ContainerFilter) {
    return this.containerService.listContainers(filter)
  }

  /**
   * 获取容器详情
   * @param containerId 容器 ID
   * @returns 容器详情
   */
  async getContainerDetails(containerId: string) {
    return this.containerService.getContainerDetails(containerId)
  }

  /**
   * 获取容器统计
   * @param containerId 容器 ID
   * @returns 统计信息
   */
  async getContainerStats(containerId: string) {
    return this.statsService.getContainerStats(containerId)
  }

  /**
   * 启动容器
   * @param containerId 容器 ID
   * @returns 操作结果
   */
  async startContainer(containerId: string) {
    return this.containerService.startContainer(containerId)
  }

  /**
   * 停止容器
   * @param containerId 容器 ID
   * @param timeout 停止超时
   * @returns 操作结果
   */
  async stopContainer(containerId: string, timeout?: number) {
    return this.containerService.stopContainer(containerId, timeout)
  }

  /**
   * 重启容器
   * @param containerId 容器 ID
   * @returns 操作结果
   */
  async restartContainer(containerId: string) {
    return this.containerService.restartContainer(containerId)
  }

  /**
   * 删除容器
   * @param containerId 容器 ID
   * @param force 是否强制删除
   * @returns 操作结果
   */
  async removeContainer(containerId: string, force?: boolean) {
    return this.containerService.removeContainer(containerId, force)
  }

  /**
   * 检查容器是否存在
   * @param containerId 容器 ID
   * @returns 是否存在
   */
  async containerExists(containerId: string) {
    return this.containerService.containerExists(containerId)
  }

  /**
   * 批量检查容器是否存在
   * @param containerIds 容器 ID 列表
   * @returns 存在性映射
   */
  async containersExist(containerIds: string[]) {
    return this.containerService.containersExist(containerIds)
  }

  /**
   * 根据 Compose 项目名查询容器
   * @param projectName 项目名
   * @returns 容器列表
   */
  async getContainersByComposeProject(projectName: string) {
    return this.containerService.getContainersByComposeProject(projectName)
  }

  /**
   * 执行 docker compose down
   * @param projectName 项目名
   * @returns 操作结果
   */
  async composeDown(projectName: string) {
    return this.composeService.composeDown(projectName)
  }

  /**
   * 在容器内执行命令
   * @param containerId 容器 ID
   * @param command 执行命令
   * @returns 执行结果
   */
  async execCommand(containerId: string, command: ExecCommand) {
    return this.execService.execCommand(containerId, command)
  }

  /**
   * 获取容器日志
   * @param containerId 容器 ID
   * @param options 日志选项
   * @returns 日志内容
   */
  async getContainerLogs(containerId: string, options?: LogOptions) {
    return this.statsService.getContainerLogs(containerId, options)
  }

  /**
   * 复制文件到容器
   * @param containerId 容器 ID
   * @param source 源文件
   * @param target 目标路径
   * @returns 操作结果
   */
  async copyToContainer(containerId: string, source: string, target: string) {
    return this.containerService.copyToContainer(containerId, source, target)
  }

  /**
   * 从容器复制文件
   * @param containerId 容器 ID
   * @param source 容器内路径
   * @param target 本地目标路径
   * @returns 操作结果
   */
  async copyFromContainer(containerId: string, source: string, target: string) {
    return this.containerService.copyFromContainer(containerId, source, target)
  }

  /**
   * 从 Dockerfile 构建镜像
   * @param options 构建参数
   * @returns 构建结果
   */
  async buildImageFromDockerfile(options: BuildImageFromDockerfileOptions) {
    return this.imageService.buildImageFromDockerfile(options)
  }

  /**
   * 获取镜像详情
   * @param imageId 镜像 ID
   * @returns 镜像信息
   */
  async inspectImage(imageId: string) {
    return this.imageService.inspectImage(imageId)
  }

  /**
   * 从镜像创建容器
   * @param options 创建参数
   * @returns 创建结果
   */
  async createContainerFromImage(options: CreateContainerFromImageOptions) {
    return this.imageService.createContainerFromImage(options)
  }

  /**
   * 执行 docker compose up
   * @param options 启动参数
   * @returns 启动结果
   */
  async composeUp(options: ComposeUpOptions) {
    return this.composeService.composeUp(options)
  }

  /**
   * 清理悬空资源
   */
  async cleanupDanglingResources() {
    return this.imageService.cleanupDanglingResources()
  }

  /**
   * 启动 Compose 项目
   * @param projectName 项目名
   * @returns 启动结果
   */
  async composeStart(projectName: string) {
    return this.composeService.composeStart(projectName)
  }

  /**
   * 停止 Compose 项目
   * @param projectName 项目名
   * @param options 停止选项
   * @returns 停止结果
   */
  async composeStop(projectName: string, options?: ComposeStopOptions) {
    return this.composeService.composeStop(projectName, options)
  }

  /**
   * 重启 Compose 项目
   * @param projectName 项目名
   * @returns 重启结果
   */
  async composeRestart(projectName: string) {
    return this.composeService.composeRestart(projectName)
  }

  /**
   * 获取 Compose 项目状态
   * @param projectName 项目名
   * @returns 项目状态
   */
  async composeStatus(projectName: string) {
    return this.composeService.composeStatus(projectName)
  }

  /**
   * 在 Compose 服务中执行命令
   * @param projectName 项目名
   * @param serviceName 服务名
   * @param command 命令
   * @param options 执行选项
   * @returns 执行结果
   */
  async composeExec(
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ) {
    return this.composeService.composeExec(projectName, serviceName, command, options)
  }

  /**
   * 获取 Compose 项目日志
   * @param projectName 项目名
   * @param options 日志选项
   * @returns 日志结果
   */
  async composeLogs(projectName: string, options?: ComposeLogOptions) {
    return this.composeService.composeLogs(projectName, options)
  }

  /**
   * 执行扩展版 docker compose down
   * @param projectName 项目名
   * @param options down 选项
   * @returns 删除结果
   */
  async composeDownExtended(projectName: string, options?: ComposeDownOptions) {
    return this.composeService.composeDownExtended(projectName, options)
  }
}

let dockerServiceInstance: DockerService | null = null

export function getDockerService(): DockerService {
  if (!dockerServiceInstance) {
    dockerServiceInstance = new DockerService()
  }

  return dockerServiceInstance
}

export const dockerService = {
  initialize: () => getDockerService().initialize(),
  checkAvailable: () => getDockerService().checkAvailable(),
  listContainers: (filter?: ContainerFilter) => getDockerService().listContainers(filter),
  getContainerDetails: (id: string) => getDockerService().getContainerDetails(id),
  getContainerStats: (id: string) => getDockerService().getContainerStats(id),
  startContainer: (id: string) => getDockerService().startContainer(id),
  stopContainer: (id: string, timeout?: number) => getDockerService().stopContainer(id, timeout),
  restartContainer: (id: string) => getDockerService().restartContainer(id),
  removeContainer: (id: string, force?: boolean) => getDockerService().removeContainer(id, force),
  containerExists: (containerId: string) => getDockerService().containerExists(containerId),
  containersExist: (containerIds: string[]) => getDockerService().containersExist(containerIds),
  getContainersByComposeProject: (projectName: string) =>
    getDockerService().getContainersByComposeProject(projectName),
  composeDown: (projectName: string) => getDockerService().composeDown(projectName),
  composeStart: (projectName: string) => getDockerService().composeStart(projectName),
  composeStop: (projectName: string, options?: ComposeStopOptions) =>
    getDockerService().composeStop(projectName, options),
  composeRestart: (projectName: string) => getDockerService().composeRestart(projectName),
  composeStatus: (projectName: string) => getDockerService().composeStatus(projectName),
  composeExec: (
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ) => getDockerService().composeExec(projectName, serviceName, command, options),
  composeLogs: (projectName: string, options?: ComposeLogOptions) =>
    getDockerService().composeLogs(projectName, options),
  composeDownExtended: (projectName: string, options?: ComposeDownOptions) =>
    getDockerService().composeDownExtended(projectName, options),
  composeUp: (options: ComposeUpOptions) => getDockerService().composeUp(options),
  inspectImage: (imageId: string) => getDockerService().inspectImage(imageId),
  buildImageFromDockerfile: (options: BuildImageFromDockerfileOptions) =>
    getDockerService().buildImageFromDockerfile(options),
  createContainerFromImage: (options: CreateContainerFromImageOptions) =>
    getDockerService().createContainerFromImage(options),
  execCommand: (id: string, cmd: ExecCommand) => getDockerService().execCommand(id, cmd),
  getContainerLogs: (id: string, opts?: LogOptions) =>
    getDockerService().getContainerLogs(id, opts),
  copyToContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyToContainer(id, src, dest),
  copyFromContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyFromContainer(id, src, dest),
  cleanupDanglingResources: () => getDockerService().cleanupDanglingResources()
}
