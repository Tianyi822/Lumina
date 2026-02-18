import { ipcMain, shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { sandboxService, getDockerConfigService, getDockerService } from '@main/services/sandbox'
import type {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  CreateSandboxRequest,
  CreateSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus
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
  SandboxSelection,
  ComposeOptions,
  ComposeResult,
  ComposeStopOptions,
  ComposeStopResult,
  ComposeRestartResult,
  ComposeProjectStatus,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult
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

  ipcMain.handle('sandbox:save', async (_event, data: SandboxData): Promise<SandboxResult> => {
    return sandboxService.saveSandbox(data)
  })

  ipcMain.handle('sandbox:load', async (_event, sandboxId: string): Promise<SandboxData | null> => {
    return sandboxService.loadSandbox(sandboxId)
  })

  ipcMain.handle('sandbox:list', async (): Promise<SandboxListItem[]> => {
    return await sandboxService.listSandboxs()
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

  // ==================== 沙箱管理（带类型/选项） ====================

  ipcMain.handle(
    'sandbox:create',
    async (_event, request: CreateSandboxRequest): Promise<CreateSandboxResult> => {
      return sandboxService.createSandbox(request)
    }
  )

  ipcMain.handle(
    'sandbox:delete',
    async (
      _event,
      sandboxId: string,
      options?: DeleteSandboxOptions
    ): Promise<{ success: boolean; removedContainers?: string[]; error?: string }> => {
      return sandboxService.deleteSandbox(sandboxId, options)
    }
  )

  ipcMain.handle(
    'sandbox:checkContainerStatus',
    async (_event, sandboxId: string): Promise<SandboxContainerStatus | null> => {
      return sandboxService.checkContainerStatus(sandboxId)
    }
  )

  ipcMain.handle('sandbox:checkAllContainerStatus', async (): Promise<SandboxContainerStatus[]> => {
    return sandboxService.checkAllSandboxContainerStatus()
  })

  ipcMain.handle(
    'sandbox:cleanupOrphan',
    async (_event, sandboxId: string): Promise<SandboxResult> => {
      return sandboxService.cleanupOrphanSandbox(sandboxId)
    }
  )

  ipcMain.handle(
    'sandbox:recoverOrphan',
    async (_event, sandboxId: string, newContainerId: string): Promise<SandboxResult> => {
      return sandboxService.recoverOrphanSandbox(sandboxId, newContainerId)
    }
  )

  // ==================== 沙箱创建（Dockerfile 和 Compose）====================

  /**
   * 端口映射类型
   */
  type PortMappingInput = {
    hostPort: number | null // null 表示自动分配
    containerPort: number
    protocol: 'tcp' | 'udp'
  }

  /**
   * 从 Dockerfile 创建沙箱
   * 1. 构建 Docker 镜像
   * 2. 创建并启动容器
   * 3. 更新沙箱元数据
   */
  ipcMain.handle(
    'sandbox:createFromDockerfile',
    async (
      _event,
      dockerfile: string,
      context: string | undefined,
      sandboxId: string | undefined,
      sandboxName: string | undefined,
      userPortMappings: PortMappingInput[] | undefined
    ): Promise<{ success: boolean; containerId?: string; error?: string }> => {
      try {
        logger.info('开始从 Dockerfile 创建沙箱', 'main', {
          context,
          sandboxId,
          sandboxName,
          dockerfileLength: dockerfile.length,
          userPortMappings
        })

        // Docker 镜像和容器名称必须是小写，格式: sandbox-dockerfile-{名称}
        const sanitizedName = (sandboxName || `dockerfile-${Date.now()}`)
          .toLowerCase()
          .replace(/[^a-z0-9_.-]/g, '-')
          .replace(/^-+|-+$/g, '')
        const dockerName = `sandbox-dockerfile-${sanitizedName}`

        // 1. 构建镜像
        const buildResult = await dockerSvc.buildImageFromDockerfile({
          dockerfile,
          context,
          tag: dockerName
        })

        if (!buildResult.success || !buildResult.imageId) {
          logger.error('从 Dockerfile 构建镜像失败', 'main', {
            error: buildResult.error
          })
          return {
            success: false,
            error: buildResult.error || '构建镜像失败'
          }
        }

        logger.info('Docker 镜像构建成功', 'main', {
          imageId: buildResult.imageId
        })

        // 确定要使用的端口映射：优先使用用户指定的，否则自动检测
        let ports: Array<{
          containerPort: number
          hostPort?: number
          protocol?: 'tcp' | 'udp'
        }> = []

        if (userPortMappings && userPortMappings.length > 0) {
          // 使用用户指定的端口映射
          ports = userPortMappings.map((p) => ({
            containerPort: p.containerPort,
            hostPort: p.hostPort ?? undefined,
            protocol: p.protocol
          }))
          logger.info('使用用户指定的端口映射', 'main', { ports })
        } else {
          // 获取镜像的暴露端口，用于自动端口映射
          try {
            const imageInspect = await dockerSvc.inspectImage(buildResult.imageId)
            if (imageInspect?.Config?.ExposedPorts) {
              ports = Object.keys(imageInspect.Config.ExposedPorts).map((port) => {
                const [portNum, protocol] = port.split('/')
                return {
                  containerPort: parseInt(portNum, 10),
                  protocol: (protocol as 'tcp' | 'udp') || 'tcp'
                }
              })
              logger.info('获取到镜像暴露端口', 'main', { ports })
            }
          } catch (err) {
            logger.warn('获取镜像暴露端口失败，将不进行端口映射', 'main', { error: String(err) })
          }
        }

        // 2. 创建并启动容器，使用 Docker 兼容的名称
        const containerResult = await dockerSvc.createContainerFromImage({
          imageId: buildResult.imageId,
          name: dockerName,
          ports
        })

        if (!containerResult.success || !containerResult.containerId) {
          logger.error('创建容器失败', 'main', {
            error: containerResult.error
          })
          return {
            success: false,
            error: containerResult.error || '创建容器失败'
          }
        }

        // 3. 更新沙箱元数据，关联容器 ID
        if (sandboxId && containerResult.containerId) {
          const sandbox = sandboxService.loadSandbox(sandboxId)
          if (sandbox) {
            sandbox.containerIds = [containerResult.containerId]
            sandbox.primaryContainerId = containerResult.containerId
            sandbox.status = 'running'
            sandbox.updatedAt = new Date().toISOString()
            sandboxService.saveSandbox(sandbox)
            logger.info('沙箱元数据已更新', 'main', {
              sandboxId,
              containerId: containerResult.containerId.substring(0, 12)
            })
          }
        }

        logger.info('从 Dockerfile 创建沙箱成功', 'main', {
          containerId: containerResult.containerId.substring(0, 12),
          containerName: dockerName
        })

        return {
          success: true,
          containerId: containerResult.containerId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('从 Dockerfile 创建沙箱失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  /**
   * 从 docker-compose.yaml 创建沙箱
   * 1. 执行 docker compose up
   * 2. 更新沙箱元数据
   */
  ipcMain.handle(
    'sandbox:createFromCompose',
    async (
      _event,
      content: string,
      options: ComposeOptions | undefined,
      sandboxId: string | undefined,
      sandboxName: string | undefined
    ): Promise<ComposeResult> => {
      try {
        // Docker 项目名称必须是小写，格式: sandbox-docker-compose-{名称}
        // 容器名称格式: sandbox-docker-compose-{名称}-{服务名}-1
        const sanitizedName = (sandboxName || options?.projectName || `compose-${Date.now()}`)
          .toLowerCase()
          .replace(/[^a-z0-9_.-]/g, '-')
          .replace(/^-+|-+$/g, '')
        const projectName = `sandbox-docker-compose-${sanitizedName}`

        logger.info('开始从 docker-compose 创建沙箱', 'main', {
          projectName,
          sandboxId,
          sandboxName,
          contentLength: content.length,
          dockerfiles: options?.dockerfiles
        })

        // 准备 Dockerfile 配置（如果有的话）
        let dockerfileConfigs: Array<{
          id: string
          content: string
          targetContext: string
          targetFilename: string
        }> = []

        if (options?.dockerfiles && options.dockerfiles.length > 0) {
          for (const df of options.dockerfiles) {
            const loadResult = configService.loadDockerfile(df.dockerfileId)
            if (loadResult.success && loadResult.config) {
              dockerfileConfigs.push({
                id: df.dockerfileId,
                content: loadResult.config.content,
                targetContext: df.targetContext || './app',
                targetFilename: df.targetFilename || 'Dockerfile'
              })
            } else {
              logger.warn('加载 Dockerfile 配置失败，跳过', 'main', {
                dockerfileId: df.dockerfileId,
                error: loadResult.error
              })
            }
          }
        }

        // 1. 执行 docker compose up
        const upResult = await dockerSvc.composeUp({
          composeContent: content,
          projectName,
          dockerfileConfigs: dockerfileConfigs.length > 0 ? dockerfileConfigs : undefined
        })

        if (!upResult.success) {
          logger.error('docker compose up 失败', 'main', {
            error: upResult.error,
            projectName
          })
          return {
            containerIds: [],
            failedServices: [],
            error: upResult.error || 'docker compose up 失败'
          }
        }

        // 2. 更新沙箱元数据，关联容器 ID
        if (sandboxId && upResult.containerIds && upResult.containerIds.length > 0) {
          const sandbox = sandboxService.loadSandbox(sandboxId)
          if (sandbox) {
            sandbox.containerIds = upResult.containerIds
            sandbox.primaryContainerId = upResult.containerIds[0]
            sandbox.composeProjectName = projectName
            sandbox.status = 'running'
            sandbox.updatedAt = new Date().toISOString()
            sandboxService.saveSandbox(sandbox)
            logger.info('沙箱元数据已更新', 'main', {
              sandboxId,
              containerCount: upResult.containerIds.length
            })
          }
        }

        logger.info('从 docker-compose 创建沙箱成功', 'main', {
          projectName,
          containerCount: upResult.containerIds?.length || 0
        })

        return {
          containerIds: upResult.containerIds || [],
          failedServices: []
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('从 docker-compose 创建沙箱失败', 'main', { error: errorMessage })
        return {
          containerIds: [],
          failedServices: [],
          error: errorMessage
        }
      }
    }
  )

  // ==================== Compose 项目操作 ====================

  /**
   * 从已保存的 Compose 配置启动容器
   * 1. 加载 Compose 配置
   * 2. 执行 docker compose up
   * 3. 更新沙箱元数据
   */
  ipcMain.handle(
    'sandbox:compose:start',
    async (
      _event,
      configId: string,
      sandboxId?: string,
      sandboxName?: string
    ): Promise<{ success: boolean; containerIds?: string[]; error?: string }> => {
      try {
        logger.info('从 Compose 配置启动容器', 'main', {
          configId,
          sandboxId,
          sandboxName
        })

        // 加载 Compose 配置
        const loadResult = configService.loadCompose(configId)
        if (!loadResult.success || !loadResult.config) {
          return {
            success: false,
            error: loadResult.error || '加载 Compose 配置失败'
          }
        }

        const config = loadResult.config

        // Docker 项目名称必须是小写，格式: sandbox-docker-compose-{名称}
        const sanitizedName = (sandboxName || config.name)
          .toLowerCase()
          .replace(/[^a-z0-9_.-]/g, '-')
          .replace(/^-+|-+$/g, '')
        const projectName = `sandbox-docker-compose-${sanitizedName}`

        // 执行 docker compose up
        const upResult = await dockerSvc.composeUp({
          composeContent: config.content,
          projectName
        })

        if (!upResult.success) {
          logger.error('docker compose up 失败', 'main', {
            error: upResult.error,
            projectName
          })
          return {
            success: false,
            error: upResult.error || 'docker compose up 失败'
          }
        }

        // 更新沙箱元数据
        if (sandboxId && upResult.containerIds && upResult.containerIds.length > 0) {
          const sandbox = sandboxService.loadSandbox(sandboxId)
          if (sandbox) {
            sandbox.containerIds = upResult.containerIds
            sandbox.primaryContainerId = upResult.containerIds[0]
            sandbox.composeProjectName = projectName
            sandbox.composeFilePath = configId
            sandbox.status = 'running'
            sandbox.updatedAt = new Date().toISOString()
            sandboxService.saveSandbox(sandbox)
            sandboxService.logOperation(
              sandboxId,
              `从 Compose 配置启动容器: ${config.name}`,
              'info'
            )
            logger.info('沙箱元数据已更新', 'main', {
              sandboxId,
              containerCount: upResult.containerIds.length
            })
          }
        }

        logger.info('从 Compose 配置启动容器成功', 'main', {
          projectName,
          containerCount: upResult.containerIds?.length || 0
        })

        return {
          success: true,
          containerIds: upResult.containerIds
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('从 Compose 配置启动容器失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  /**
   * 停止 Compose 项目
   */
  ipcMain.handle(
    'sandbox:compose:stop',
    async (
      _event,
      projectName: string,
      options?: ComposeStopOptions
    ): Promise<ComposeStopResult> => {
      return dockerSvc.composeStop(projectName, options)
    }
  )

  /**
   * 重启 Compose 项目
   */
  ipcMain.handle(
    'sandbox:compose:restart',
    async (_event, projectName: string): Promise<ComposeRestartResult> => {
      return dockerSvc.composeRestart(projectName)
    }
  )

  /**
   * 获取 Compose 项目状态
   */
  ipcMain.handle(
    'sandbox:compose:status',
    async (
      _event,
      projectName: string
    ): Promise<{ success: boolean; status?: ComposeProjectStatus; error?: string }> => {
      return dockerSvc.composeStatus(projectName)
    }
  )

  /**
   * 在 Compose 服务中执行命令
   */
  ipcMain.handle(
    'sandbox:compose:exec',
    async (
      _event,
      projectName: string,
      serviceName: string,
      command: string,
      options?: ComposeExecOptions
    ): Promise<ComposeExecResult> => {
      return dockerSvc.composeExec(projectName, serviceName, command, options)
    }
  )

  /**
   * 获取 Compose 项目日志
   */
  ipcMain.handle(
    'sandbox:compose:logs',
    async (
      _event,
      projectName: string,
      options?: ComposeLogOptions
    ): Promise<ComposeLogResult> => {
      return dockerSvc.composeLogs(projectName, options)
    }
  )

  /**
   * 停止并删除 Compose 项目（带选项）
   */
  ipcMain.handle(
    'sandbox:compose:downExtended',
    async (
      _event,
      projectName: string,
      options?: ComposeDownOptions
    ): Promise<ComposeDownResult> => {
      return dockerSvc.composeDownExtended(projectName, options)
    }
  )
}
