import { logger } from '@main/services/logger'
import type {
  CreateFrontendSandboxOptions,
  FrontendFramework,
  FrontendSandboxInfo,
  SandboxData
} from '@shared/types/sandbox'
import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { FRONTEND_PROJECT_ROOT, normalizeProjectRoot } from '../file'
import { templateService } from '../templates'
import { frontendWorkspaceBootstrapService } from './FrontendWorkspaceBootstrapService'
import { ensureFrontendBaseImage } from './imageBuilder'
import {
  DEFAULT_FRONTEND_PORT,
  FRONTEND_BUILDER,
  FRONTEND_HOST_PORT_BASE,
  FRONTEND_LOG_HINT,
  FRONTEND_MOUNT_PATH,
  FRONTEND_PACKAGE_MANAGER,
  FRONTEND_RUNTIME,
  FRONTEND_STARTUP_LOG_PATH,
  FRONTEND_STORAGE_TYPE
} from './constants'
import { checkHttpReady, waitForHttpReady } from './waitForHttpReady'

const dockerService = getDockerService()

export { FRONTEND_LOG_HINT, FRONTEND_STARTUP_LOG_PATH, PREVIEW_READY_TIMEOUT_MS } from './constants'

interface FrontendRuntimeRecoveryResult {
  handled: boolean
  previewReady: boolean
  previewUrl?: string
  warning?: string
}

/**
 * 前端沙箱服务
 * 负责创建可用于运行前端项目的基础容器
 */
export class FrontendSandboxService {
  /**
   * 加载并按需恢复前端沙箱状态
   */
  async loadFrontendSandboxResolved(sandboxId: string): Promise<SandboxData | null> {
    const sandbox = sandboxService.loadSandbox(sandboxId, {
      silent: true
    })
    if (!sandbox) {
      return null
    }

    if (!sandbox.frontend) {
      return sandbox
    }

    await this.reconcileFrontendSandboxState(sandbox)
    return (
      sandboxService.loadSandbox(sandboxId, {
        silent: true
      }) || sandbox
    )
  }

  /**
   * 创建前端沙箱
   */
  async createFrontendSandbox(options: CreateFrontendSandboxOptions): Promise<FrontendSandboxInfo> {
    const {
      name,
      framework = 'vue',
      containerPort = DEFAULT_FRONTEND_PORT,
      projectRoot: rawProjectRoot = FRONTEND_PROJECT_ROOT
    } = options
    const projectRoot = normalizeProjectRoot(rawProjectRoot)

    if (!name || !name.trim()) {
      throw new Error('沙箱名称不能为空')
    }

    if (!projectRoot) {
      throw new Error('项目根目录不在允许范围内')
    }

    if (projectRoot !== FRONTEND_PROJECT_ROOT) {
      throw new Error(`前端沙箱项目根目录必须为 ${FRONTEND_PROJECT_ROOT}`)
    }

    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      throw new Error('容器端口必须是 1 到 65535 之间的整数')
    }

    let containerId: string | null = null
    let sandboxId: string | null = null
    let volumeName: string | null = null

    try {
      const createResult = await sandboxService.createSandbox({
        name,
        creationType: 'dockerfile'
      })

      if (!createResult.success || !createResult.sandbox) {
        throw new Error(createResult.error || '创建沙箱元数据失败')
      }

      sandboxId = createResult.sandbox.sandboxId

      const imageId = await ensureFrontendBaseImage()
      const containerName = this.buildContainerName(name)
      const hostPort = await this.allocateFixedHostPort(
        this.getPreferredHostPort(containerPort)
      )
      volumeName = this.buildWorkspaceVolumeName(sandboxId)

      await dockerService.createVolume({
        name: volumeName,
        labels: this.buildWorkspaceVolumeLabels(sandboxId)
      })

      const containerResult = await dockerService.createContainerFromImage({
        imageId,
        name: containerName,
        ports: [{ containerPort, hostPort, protocol: 'tcp' }],
        volumes: [{ source: volumeName, destination: FRONTEND_MOUNT_PATH, mode: 'rw' }],
        workingDir: projectRoot
      })

      if (!containerResult.success || !containerResult.containerId) {
        throw new Error(containerResult.error || '创建前端容器失败')
      }

      containerId = containerResult.containerId

      const details = await dockerService.getContainerDetails(containerId)
      const boundPort = details?.ports.find(
        (item) => item.containerPort === containerPort && item.protocol === 'tcp'
      )
      const actualHostPort = boundPort?.hostPort

      if (!actualHostPort) {
        throw new Error('未找到容器端口映射')
      }

      const sandbox = createResult.sandbox
      const previewUrl = this.buildPreviewUrl(actualHostPort)
      sandbox.containerIds = [containerId]
      sandbox.primaryContainerId = containerId
      sandbox.status = 'running'
      sandbox.frontend = {
        framework,
        storageType: FRONTEND_STORAGE_TYPE,
        volumeName,
        mountPath: FRONTEND_MOUNT_PATH,
        projectRoot,
        packageManager: FRONTEND_PACKAGE_MANAGER,
        runtime: FRONTEND_RUNTIME,
        builder: FRONTEND_BUILDER,
        bootstrapStatus: 'pending',
        workspaceInitialized: false,
        dependenciesInstalled: false,
        buildValidated: false,
        containerPort,
        hostPort: actualHostPort,
        previewUrl
      }

      const saveResult = sandboxService.saveSandbox(sandbox)
      if (!saveResult.success) {
        throw new Error(saveResult.error || '保存前端沙箱元数据失败')
      }

      const template = this.getRenderedTemplate(sandbox.name, framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        sandbox,
        template,
        {
          installDependencies: options.installDependencies !== false,
          autoStart: options.autoStart !== false,
          throwOnFailure: true
        }
      )
      const message = bootstrapResult.warning || this.buildPreviewMessage(
        options.autoStart !== false,
        bootstrapResult.previewReady
      )

      await this.persistFrontendSandboxStatus(
        sandbox,
        bootstrapResult.previewReady || options.autoStart === false ? 'running' : 'error',
        bootstrapResult.warning
      )

      if (!bootstrapResult.previewReady && options.autoStart !== false) {
        logger.warn('前端预览服务尚未就绪', 'main', {
          sandboxId,
          previewUrl,
          startupLogPath: FRONTEND_STARTUP_LOG_PATH
        })
      }

      logger.info('前端沙箱创建成功', 'main', {
        sandboxId,
        framework,
        containerId: containerId.substring(0, 12),
        hostPort: actualHostPort
      })

      return {
        sandboxId,
        name: sandbox.name,
        framework,
        containerId,
        volumeName,
        mountPath: FRONTEND_MOUNT_PATH,
        projectRoot,
        packageManager: FRONTEND_PACKAGE_MANAGER,
        runtime: FRONTEND_RUNTIME,
        builder: FRONTEND_BUILDER,
        bootstrapStatus: sandbox.frontend.bootstrapStatus,
        buildValidated: sandbox.frontend.buildValidated,
        containerPort,
        hostPort: actualHostPort,
        previewUrl,
        previewReady: bootstrapResult.previewReady,
        startupLogPath: FRONTEND_STARTUP_LOG_PATH,
        message,
        status: sandbox.status
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建前端沙箱失败', 'main', {
        name,
        framework,
        sandboxId,
        containerId,
        volumeName,
        error: errorMessage
      })

      if (sandboxId) {
        const sandbox = sandboxService.loadSandbox(sandboxId)
        if (sandbox) {
          sandbox.status = 'error'
          if (sandbox.frontend) {
            sandbox.frontend.bootstrapStatus = 'error'
            sandbox.frontend.bootstrapError = errorMessage
            sandbox.frontend.lastBootstrapAt = new Date().toISOString()
          }
          sandboxService.saveSandbox(sandbox)
        }
      }

      if (containerId && !sandboxId) {
        await dockerService.removeContainer(containerId, true).catch(() => {})
      }

      throw error
    }
  }

  /**
   * 获取前端沙箱的预览地址
   */
  getPreviewUrl(sandboxId: string): string | null {
    const sandbox = sandboxService.loadSandbox(sandboxId)
    return sandbox?.frontend?.previewUrl || null
  }

  /**
   * 重试前端工作区初始化
   */
  async retryFrontendInitialization(sandboxId: string): Promise<FrontendSandboxInfo> {
    const sandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)

    try {
      await this.ensureFrontendContainerRunning(sandbox)
      await this.syncFrontendPortBinding(sandbox)

      const refreshedSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      const template = this.getRenderedTemplate(
        refreshedSandbox.name,
        refreshedSandbox.frontend.framework
      )
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        refreshedSandbox,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      await this.persistFrontendSandboxStatus(
        refreshedSandbox,
        bootstrapResult.previewReady ? 'running' : 'error',
        bootstrapResult.warning
      )

      return this.buildFrontendSandboxInfo(
        refreshedSandbox,
        refreshedSandbox.primaryContainerId!,
        bootstrapResult.previewReady,
        bootstrapResult.warning || this.buildPreviewMessage(true, bootstrapResult.previewReady)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.persistFrontendSandboxStatus(sandbox, 'error', errorMessage)
      throw error
    }
  }

  /**
   * 重建前端运行容器并复用原工作区
   */
  async rebuildFrontendRuntimeContainer(sandboxId: string): Promise<FrontendSandboxInfo> {
    const sandbox = this.loadFrontendSandboxOrThrow(sandboxId)

    try {
      await this.ensureFrontendWorkspaceVolumeReady(sandbox)

      for (const containerId of sandbox.containerIds) {
        await this.removeContainerIfExists(containerId)
      }

      sandbox.containerIds = []
      sandbox.primaryContainerId = undefined
      sandbox.status = 'error'
      sandbox.isOrphan = false
      this.saveSandboxOrThrow(sandbox, '更新前端沙箱状态失败')

      const imageId = await ensureFrontendBaseImage()
      const desiredHostPort = await this.getReusableHostPort(
        sandbox.frontend.hostPort,
        sandbox.sandboxId
      )
      const containerResult = await dockerService.createContainerFromImage({
        imageId,
        name: this.buildContainerName(sandbox.name),
        ports: [
          {
            containerPort: sandbox.frontend.containerPort,
            hostPort: desiredHostPort,
            protocol: 'tcp'
          }
        ],
        volumes: [
          {
            source: sandbox.frontend.volumeName,
            destination: sandbox.frontend.mountPath,
            mode: 'rw'
          }
        ],
        workingDir: sandbox.frontend.projectRoot
      })

      if (!containerResult.success || !containerResult.containerId) {
        throw new Error(containerResult.error || '重建前端容器失败')
      }

      const containerId = containerResult.containerId
      const details = await dockerService.getContainerDetails(containerId)
      const boundPort = details?.ports.find(
        (item) =>
          item.containerPort === sandbox.frontend!.containerPort && item.protocol === 'tcp'
      )
      const actualHostPort = boundPort?.hostPort

      if (!actualHostPort) {
        throw new Error('重建后未找到容器端口映射')
      }

      sandbox.containerIds = [containerId]
      sandbox.primaryContainerId = containerId
      sandbox.status = 'running'
      sandbox.isOrphan = false
      sandbox.frontend.hostPort = actualHostPort
      sandbox.frontend.previewUrl = this.buildPreviewUrl(actualHostPort)
      this.saveSandboxOrThrow(sandbox, '保存重建后的前端沙箱元数据失败')

      const refreshedSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      const template = this.getRenderedTemplate(
        refreshedSandbox.name,
        refreshedSandbox.frontend.framework
      )
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        refreshedSandbox,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      await this.persistFrontendSandboxStatus(
        refreshedSandbox,
        bootstrapResult.previewReady ? 'running' : 'error',
        bootstrapResult.warning
      )

      return this.buildFrontendSandboxInfo(
        refreshedSandbox,
        containerId,
        bootstrapResult.previewReady,
        bootstrapResult.warning || this.buildPreviewMessage(true, bootstrapResult.previewReady)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.persistFrontendSandboxStatus(sandbox, 'error', errorMessage)
      throw error
    }
  }

  /**
   * 对前端工作区执行一次 Bun 构建校验
   */
  async validateFrontendBuild(sandboxId: string): Promise<FrontendSandboxInfo> {
    const sandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)

    try {
      await this.ensureFrontendWorkspaceVolumeReady(sandbox)
      await this.ensureFrontendContainerRunning(sandbox)
      await this.syncFrontendLifecycleStatus(sandbox)
      await this.syncFrontendPortBinding(sandbox)

      const refreshedSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      const template = this.getRenderedTemplate(
        refreshedSandbox.name,
        refreshedSandbox.frontend.framework
      )

      let state = await frontendWorkspaceBootstrapService.readBootstrapState(refreshedSandbox)
      state = await frontendWorkspaceBootstrapService.ensureWorkspaceReady(
        refreshedSandbox,
        template,
        state
      )
      state = await frontendWorkspaceBootstrapService.ensureDependenciesReady(
        refreshedSandbox,
        template,
        state
      )
      await frontendWorkspaceBootstrapService.ensureBuildReady(
        refreshedSandbox,
        template,
        state,
        {
          force: true
        }
      )

      const latestSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      await this.syncFrontendLifecycleStatus(latestSandbox)
      const finalizedSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      const previewReady = await checkHttpReady(finalizedSandbox.frontend.previewUrl)

      return this.buildFrontendSandboxInfo(
        finalizedSandbox,
        finalizedSandbox.primaryContainerId!,
        previewReady,
        'Bun 构建校验通过，可继续执行导出或预览前校验'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      try {
        await this.persistFrontendBuildValidationFailure(sandboxId, errorMessage)
      } catch (stateError) {
        logger.warn('写入前端构建校验错误状态失败', 'main', {
          sandboxId,
          error: stateError instanceof Error ? stateError.message : String(stateError)
        })
      }

      try {
        const current = this.loadFrontendSandboxOrThrow(sandboxId, true)
        await this.syncFrontendLifecycleStatus(current, {
          preserveBootstrapError: true
        })
      } catch (statusError) {
        logger.warn('同步前端构建校验后的生命周期状态失败', 'main', {
          sandboxId,
          error: statusError instanceof Error ? statusError.message : String(statusError)
        })
      }

      throw error
    }
  }

  /**
   * 获取前端预览状态
   */
  async getPreviewInfo(
    sandboxId: string,
    waitTimeoutMs: number = 0
  ): Promise<Pick<
    FrontendSandboxInfo,
    'previewUrl' | 'previewReady' | 'startupLogPath' | 'message'
  > | null> {
    const sandbox = await this.loadFrontendSandboxResolved(sandboxId)
    if (!sandbox?.frontend) {
      return null
    }

    await this.syncFrontendPortBinding(sandbox)
    const refreshedSandbox = sandboxService.loadSandbox(sandboxId) || sandbox
    const previewUrl = refreshedSandbox.frontend?.previewUrl || sandbox.frontend.previewUrl

    const previewReady =
      waitTimeoutMs > 0
        ? await waitForHttpReady(previewUrl, waitTimeoutMs, 500)
        : await checkHttpReady(previewUrl)

    return {
      previewUrl,
      previewReady,
      startupLogPath: FRONTEND_STARTUP_LOG_PATH,
      message: previewReady ? undefined : `预览服务尚未就绪，${FRONTEND_LOG_HINT}`
    }
  }

  /**
   * 在容器 start/restart 后恢复前端开发服务器
   */
  async recoverFrontendRuntime(
    sandbox: SandboxData
  ): Promise<FrontendRuntimeRecoveryResult> {
    if (!sandbox.frontend || !sandbox.primaryContainerId) {
      return {
        handled: false,
        previewReady: false
      }
    }

    await this.syncFrontendPortBinding(sandbox)

    const { framework, previewUrl } = sandbox.frontend

    if (await checkHttpReady(previewUrl)) {
      await this.persistFrontendSandboxStatus(sandbox, 'running')
      return {
        handled: true,
        previewReady: true,
        previewUrl
      }
    }

    try {
      const template = this.getRenderedTemplate(sandbox.name, framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        sandbox,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      if (!bootstrapResult.previewReady) {
        await this.persistFrontendSandboxStatus(sandbox, 'error')
        logger.warn('前端服务启动后未就绪', 'main', {
          sandboxId: sandbox.sandboxId,
          previewUrl
        })
        return {
          handled: true,
          previewReady: false,
          previewUrl: bootstrapResult.previewUrl || previewUrl,
          warning: bootstrapResult.warning
        }
      }

      await this.invalidateFrontendBuildValidation(sandbox)

      logger.info('前端服务恢复成功', 'main', {
        sandboxId: sandbox.sandboxId,
        previewUrl
      })

      await this.persistFrontendSandboxStatus(sandbox, 'running')

      return {
        handled: true,
        previewReady: true,
        previewUrl: bootstrapResult.previewUrl || previewUrl
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('前端服务恢复异常', 'main', {
        sandboxId: sandbox.sandboxId,
        error: errorMessage
      })
      await this.persistFrontendSandboxStatus(sandbox, 'error', errorMessage)
      return {
        handled: true,
        previewReady: false,
        previewUrl,
        warning: `前端服务恢复异常: ${errorMessage}`
      }
    }
  }

  /**
   * 根据容器 ID 恢复关联前端沙箱的开发服务器
   */
  async recoverFrontendRuntimeByContainerId(
    containerId: string
  ): Promise<FrontendRuntimeRecoveryResult> {
    const sandbox = sandboxService.findSandboxByContainerId(containerId)
    if (!sandbox?.frontend) {
      return {
        handled: false,
        previewReady: false
      }
    }

    if (sandbox.primaryContainerId && sandbox.primaryContainerId !== containerId) {
      return {
        handled: false,
        previewReady: false
      }
    }

    return this.recoverFrontendRuntime(sandbox)
  }

  private async reconcileFrontendSandboxState(sandbox: SandboxData): Promise<void> {
    if (!sandbox.frontend) {
      return
    }

    const containerId = sandbox.primaryContainerId || sandbox.containerIds[0]
    if (!containerId) {
      return
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (!details) {
      if (!sandbox.isOrphan || sandbox.status !== 'error') {
        sandbox.isOrphan = true
        sandbox.status = 'error'
        this.saveSandboxOrThrow(sandbox, '保存前端孤儿沙箱状态失败')
      }
      return
    }

    if (sandbox.isOrphan) {
      sandbox.isOrphan = false
      this.saveSandboxOrThrow(sandbox, '保存前端沙箱关联状态失败')
    }

    await this.syncFrontendPortBinding(sandbox)

    if (details.state !== 'running') {
      await this.persistFrontendSandboxStatus(sandbox, 'stopped')
      return
    }

    await this.recoverFrontendRuntime(sandbox)
  }

  /**
   * 为前端沙箱分配固定宿主机端口，避免 stop/start 或 restart 后随机变化
   */
  private async allocateFixedHostPort(
    preferredPort: number,
    ignoredSandboxId?: string
  ): Promise<number> {
    const reservedPorts = new Set(
      sandboxService
        .loadAllSandboxes()
        .filter((sandbox) => sandbox.sandboxId !== ignoredSandboxId)
        .map((sandbox) => sandbox.frontend?.hostPort)
        .filter((port): port is number => typeof port === 'number' && Number.isInteger(port) && port > 0)
    )

    for (let port = preferredPort; port <= 65535; port += 1) {
      if (reservedPorts.has(port)) {
        continue
      }

      if (await this.isHostPortAvailable(port)) {
        return port
      }
    }

    throw new Error('未找到可用的宿主机端口')
  }

  /**
   * 将容器开发端口映射到宿主机的稳定高位端口，避免与本机常见开发端口冲突
   */
  private getPreferredHostPort(containerPort: number): number {
    const preferredHostPort = containerPort + FRONTEND_HOST_PORT_BASE
    if (preferredHostPort <= 65535) {
      return preferredHostPort
    }

    return Math.min(Math.max(containerPort, 1024), 65535)
  }

  private async getReusableHostPort(preferredPort: number, sandboxId: string): Promise<number> {
    if (await this.isHostPortAvailable(preferredPort)) {
      return preferredPort
    }

    return this.allocateFixedHostPort(preferredPort, sandboxId)
  }

  /**
   * 检查宿主机端口是否可用
   */
  private async isHostPortAvailable(port: number): Promise<boolean> {
    const net = await import('node:net')

    return new Promise((resolve) => {
      const server = net.createServer()

      const finish = (available: boolean): void => {
        server.removeAllListeners()
        resolve(available)
      }

      server.once('error', () => finish(false))
      server.once('listening', () => {
        server.close(() => finish(true))
      })
      server.listen(port, '0.0.0.0')
    })
  }

  /**
   * 同步前端沙箱当前端口映射，兼容旧的动态端口沙箱
   */
  private async syncFrontendPortBinding(sandbox: SandboxData): Promise<void> {
    if (!sandbox.frontend || !sandbox.primaryContainerId) {
      return
    }

    const details = await dockerService.getContainerDetails(sandbox.primaryContainerId)
    const boundPort = details?.ports.find(
      (item) =>
        item.containerPort === sandbox.frontend?.containerPort && item.protocol === 'tcp'
    )
    const hostPort = boundPort?.hostPort

    if (!hostPort) {
      return
    }

    const previewUrl = this.buildPreviewUrl(hostPort)
    if (
      sandbox.frontend.hostPort === hostPort &&
      sandbox.frontend.previewUrl === previewUrl
    ) {
      return
    }

    sandbox.frontend.hostPort = hostPort
    sandbox.frontend.previewUrl = previewUrl
    const saveResult = sandboxService.saveSandbox(sandbox)

    if (!saveResult.success) {
      logger.warn('同步前端沙箱端口映射失败', 'main', {
        sandboxId: sandbox.sandboxId,
        hostPort,
        error: saveResult.error
      })
      return
    }

    logger.info('前端沙箱端口映射已同步', 'main', {
      sandboxId: sandbox.sandboxId,
      hostPort,
      previewUrl
    })
  }

  private async syncFrontendLifecycleStatus(
    sandbox: SandboxData,
    options?: { preserveBootstrapError?: boolean }
  ): Promise<void> {
    const containerId = sandbox.primaryContainerId || sandbox.containerIds[0]

    if (!containerId) {
      return
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (!details) {
      return
    }

    const nextStatus: SandboxData['status'] = details.state === 'running' ? 'running' : 'stopped'
    await this.persistFrontendSandboxStatus(sandbox, nextStatus, undefined, options)
  }

  /**
   * 构建预览地址
   */
  private buildPreviewUrl(hostPort: number): string {
    return `http://127.0.0.1:${hostPort}`
  }

  private loadFrontendSandboxOrThrow(
    sandboxId: string,
    requireContainer: boolean = false
  ): SandboxData & { frontend: NonNullable<SandboxData['frontend']> } {
    const sandbox = sandboxService.loadSandbox(sandboxId)

    if (!sandbox?.frontend) {
      throw new Error('未找到前端沙箱元数据')
    }

    if (requireContainer && !sandbox.primaryContainerId && sandbox.containerIds.length === 0) {
      throw new Error('前端沙箱没有关联容器，请改用重建容器')
    }

    return sandbox as SandboxData & { frontend: NonNullable<SandboxData['frontend']> }
  }

  private async ensureFrontendWorkspaceVolumeReady(sandbox: SandboxData): Promise<void> {
    const volumeName = sandbox.frontend?.volumeName

    if (!volumeName) {
      throw new Error('前端沙箱缺少工作区 volume 信息')
    }

    const exists = await dockerService.volumeExists(volumeName)
    if (!exists) {
      throw new Error(`前端工作区不存在: ${volumeName}`)
    }

    const ownedBySandbox = await dockerService.isVolumeOwnedBySandbox(volumeName, sandbox.sandboxId)
    if (!ownedBySandbox) {
      throw new Error(`前端工作区 volume 不属于当前沙箱: ${volumeName}`)
    }
  }

  private async ensureFrontendContainerRunning(sandbox: SandboxData): Promise<void> {
    const containerId = sandbox.primaryContainerId || sandbox.containerIds[0]

    if (!containerId) {
      throw new Error('前端沙箱没有关联容器，请改用重建容器')
    }

    const exists = await dockerService.containerExists(containerId)
    if (!exists) {
      throw new Error('前端容器不存在，请改用重建容器')
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (details?.state === 'running') {
      return
    }

    const startResult = await dockerService.startContainer(containerId)
    if (!startResult.success) {
      throw new Error(startResult.error || '启动前端容器失败')
    }
  }

  private async removeContainerIfExists(containerId: string): Promise<void> {
    const details = await dockerService.getContainerDetails(containerId)
    if (!details) {
      return
    }

    if (details.state === 'running') {
      const stopResult = await dockerService.stopContainer(containerId, 10)
      if (!stopResult.success) {
        throw new Error(stopResult.error || '停止旧前端容器失败')
      }
    }

    const removeResult = await dockerService.removeContainer(containerId, true)
    if (!removeResult.success) {
      throw new Error(removeResult.error || '删除旧前端容器失败')
    }
  }

  private async persistFrontendBuildValidationFailure(
    sandboxId: string,
    errorMessage: string
  ): Promise<void> {
    const sandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
    const currentState = await frontendWorkspaceBootstrapService.readBootstrapState(sandbox)

    await frontendWorkspaceBootstrapService.writeBootstrapState(sandbox, {
      ...currentState,
      buildValidated: false,
      bootstrapStatus: 'error',
      lastBootstrapAt: new Date().toISOString(),
      bootstrapError: errorMessage
    })
  }

  private async invalidateFrontendBuildValidation(sandbox: SandboxData): Promise<void> {
    if (!sandbox.frontend || !sandbox.primaryContainerId) {
      return
    }

    const currentState = await frontendWorkspaceBootstrapService.readBootstrapState(sandbox)
    if (!currentState.buildValidated) {
      return
    }

    const nextBootstrapStatus = currentState.dependenciesInstalled
      ? 'runtime-ready'
      : currentState.workspaceInitialized
        ? 'workspace-ready'
        : 'pending'

    await frontendWorkspaceBootstrapService.writeBootstrapState(sandbox, {
      ...currentState,
      buildValidated: false,
      bootstrapStatus: nextBootstrapStatus,
      lastBootstrapAt: new Date().toISOString(),
      bootstrapError: undefined
    })
  }

  private async persistFrontendSandboxStatus(
    sandbox: SandboxData,
    status: SandboxData['status'],
    bootstrapError?: string,
    options?: { preserveBootstrapError?: boolean }
  ): Promise<void> {
    const current =
      sandboxService.loadSandbox(sandbox.sandboxId, {
        silent: true
      }) || sandbox

    let nextBootstrapError = current.frontend?.bootstrapError

    if (current.frontend) {
      nextBootstrapError =
        status === 'error' ? bootstrapError || current.frontend.bootstrapError : undefined
      if (options?.preserveBootstrapError) {
        nextBootstrapError = sandbox.frontend?.bootstrapError || nextBootstrapError
      }
    }

    if (current.status === status && current.frontend?.bootstrapError === nextBootstrapError) {
      return
    }

    current.status = status
    current.updatedAt = new Date().toISOString()
    sandbox.status = status
    sandbox.updatedAt = current.updatedAt

    if (current.frontend) {
      current.frontend.lastBootstrapAt = new Date().toISOString()
      current.frontend.bootstrapError = nextBootstrapError
      if (sandbox.frontend) {
        sandbox.frontend.lastBootstrapAt = current.frontend.lastBootstrapAt
        sandbox.frontend.bootstrapError = current.frontend.bootstrapError
      }
    }

    this.saveSandboxOrThrow(current, '保存前端沙箱状态失败')
  }

  private saveSandboxOrThrow(sandbox: SandboxData, fallbackMessage: string): void {
    const saveResult = sandboxService.saveSandbox(sandbox, {
      silent: true
    })
    if (!saveResult.success) {
      throw new Error(saveResult.error || fallbackMessage)
    }
  }

  /**
   * 生成容器名称
   */
  private buildContainerName(name: string): string {
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

    return `sandbox-frontend-${sanitized || 'app'}-${Date.now()}`
  }

  /**
   * 生成模板项目名
   */
  private buildProjectName(name: string): string {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '-')
        .replace(/^-+|-+$/g, '') || 'sandbox-app'
    )
  }

  private getRenderedTemplate(
    name: string,
    framework: FrontendFramework
  ): ReturnType<typeof templateService.renderTemplate> {
    return templateService.renderTemplate(framework, {
      projectName: this.buildProjectName(name)
    })
  }

  /**
   * 生成前端工作区 volume 名称
   */
  private buildWorkspaceVolumeName(sandboxId: string): string {
    return `sandbox-frontend-workspace-${sandboxId}`
  }

  /**
   * 构建前端工作区 volume 标签
   */
  private buildWorkspaceVolumeLabels(sandboxId: string): Record<string, string> {
    return {
      'sparrow-manus.sandbox-id': sandboxId,
      'sparrow-manus.volume-role': 'frontend-workspace'
    }
  }

  private buildFrontendSandboxInfo(
    sandbox: SandboxData & { frontend: NonNullable<SandboxData['frontend']> },
    containerId: string,
    previewReady: boolean,
    message?: string
  ): FrontendSandboxInfo {
    return {
      sandboxId: sandbox.sandboxId,
      name: sandbox.name,
      framework: sandbox.frontend.framework,
      containerId,
      volumeName: sandbox.frontend.volumeName,
      mountPath: sandbox.frontend.mountPath,
      projectRoot: sandbox.frontend.projectRoot,
      packageManager: sandbox.frontend.packageManager,
      runtime: sandbox.frontend.runtime,
      builder: sandbox.frontend.builder,
      bootstrapStatus: sandbox.frontend.bootstrapStatus,
      buildValidated: sandbox.frontend.buildValidated,
      containerPort: sandbox.frontend.containerPort,
      hostPort: sandbox.frontend.hostPort,
      previewUrl: sandbox.frontend.previewUrl,
      previewReady,
      startupLogPath: FRONTEND_STARTUP_LOG_PATH,
      message,
      status: sandbox.status
    }
  }

  /**
   * 构建命令执行错误消息
   */
  private buildPreviewMessage(autoStarted: boolean, previewReady: boolean): string | undefined {
    if (!autoStarted) {
      return '开发服务器未自动启动，请稍后手动执行启动命令'
    }

    if (!previewReady) {
      return `沙箱已创建，但预览服务尚未就绪，${FRONTEND_LOG_HINT}`
    }

    return undefined
  }
}
