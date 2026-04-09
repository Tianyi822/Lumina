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
  FRONTEND_LOG_HINT,
  FRONTEND_MOUNT_PATH,
  FRONTEND_PACKAGE_MANAGER,
  FRONTEND_RUNTIME,
  FRONTEND_STARTUP_LOG_PATH,
  FRONTEND_STORAGE_TYPE
} from './constants'
import { checkHttpReady, waitForHttpReady } from './waitForHttpReady'
import {
  allocateFixedHostPort,
  buildPreviewUrl,
  getPreferredHostPort,
  getReusableHostPort
} from './frontendSandboxPorts'
import {
  buildContainerName,
  buildProjectName,
  buildWorkspaceVolumeLabels,
  buildWorkspaceVolumeName,
  ensureFrontendContainerRunning,
  invalidateFrontendBuildValidation,
  persistFrontendBuildValidationFailure,
  persistFrontendSandboxStatus,
  removeContainerIfExists,
  saveSandboxOrThrow,
  syncFrontendLifecycleStatus,
  syncFrontendPortBinding
} from './frontendSandboxPersistence'

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
      const containerName = buildContainerName(name)
      const hostPort = await allocateFixedHostPort(
        getPreferredHostPort(containerPort),
        sandboxService
      )
      volumeName = buildWorkspaceVolumeName(sandboxId)

      await dockerService.createVolume({
        name: volumeName,
        labels: buildWorkspaceVolumeLabels(sandboxId)
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
      const previewUrl = buildPreviewUrl(actualHostPort)
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
      const message =
        bootstrapResult.warning ||
        this.buildPreviewMessage(options.autoStart !== false, bootstrapResult.previewReady)

      await persistFrontendSandboxStatus(
        sandbox,
        sandboxService,
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
      await ensureFrontendContainerRunning(sandbox, dockerService)
      await syncFrontendPortBinding(sandbox, dockerService, sandboxService)

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

      await persistFrontendSandboxStatus(
        refreshedSandbox,
        sandboxService,
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
      await persistFrontendSandboxStatus(sandbox, sandboxService, 'error', errorMessage)
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
        await removeContainerIfExists(containerId, dockerService)
      }

      sandbox.containerIds = []
      sandbox.primaryContainerId = undefined
      sandbox.status = 'error'
      sandbox.isOrphan = false
      saveSandboxOrThrow(sandbox, sandboxService, '更新前端沙箱状态失败')

      const imageId = await ensureFrontendBaseImage()
      const desiredHostPort = await getReusableHostPort(
        sandbox.frontend.hostPort,
        sandbox.sandboxId,
        sandboxService
      )
      const containerResult = await dockerService.createContainerFromImage({
        imageId,
        name: buildContainerName(sandbox.name),
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
        (item) => item.containerPort === sandbox.frontend!.containerPort && item.protocol === 'tcp'
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
      sandbox.frontend.previewUrl = buildPreviewUrl(actualHostPort)
      saveSandboxOrThrow(sandbox, sandboxService, '保存重建后的前端沙箱元数据失败')

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

      await persistFrontendSandboxStatus(
        refreshedSandbox,
        sandboxService,
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
      await persistFrontendSandboxStatus(sandbox, sandboxService, 'error', errorMessage)
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
      await ensureFrontendContainerRunning(sandbox, dockerService)
      await syncFrontendLifecycleStatus(sandbox, dockerService, sandboxService)
      await syncFrontendPortBinding(sandbox, dockerService, sandboxService)

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
      await frontendWorkspaceBootstrapService.ensureBuildReady(refreshedSandbox, template, state, {
        force: true
      })

      const latestSandbox = this.loadFrontendSandboxOrThrow(sandboxId, true)
      await syncFrontendLifecycleStatus(latestSandbox, dockerService, sandboxService)
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
        await persistFrontendBuildValidationFailure(
          sandboxId,
          errorMessage,
          sandboxService,
          frontendWorkspaceBootstrapService
        )
      } catch (stateError) {
        logger.warn('写入前端构建校验错误状态失败', 'main', {
          sandboxId,
          error: stateError instanceof Error ? stateError.message : String(stateError)
        })
      }

      try {
        const current = this.loadFrontendSandboxOrThrow(sandboxId, true)
        await syncFrontendLifecycleStatus(current, dockerService, sandboxService, {
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

    await syncFrontendPortBinding(sandbox, dockerService, sandboxService)
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
  async recoverFrontendRuntime(sandbox: SandboxData): Promise<FrontendRuntimeRecoveryResult> {
    if (!sandbox.frontend || !sandbox.primaryContainerId) {
      return {
        handled: false,
        previewReady: false
      }
    }

    await syncFrontendPortBinding(sandbox, dockerService, sandboxService)

    const { framework, previewUrl } = sandbox.frontend

    if (await checkHttpReady(previewUrl)) {
      await persistFrontendSandboxStatus(sandbox, sandboxService, 'running')
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
        await persistFrontendSandboxStatus(sandbox, sandboxService, 'error')
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

      await invalidateFrontendBuildValidation(sandbox, frontendWorkspaceBootstrapService)

      logger.info('前端服务恢复成功', 'main', {
        sandboxId: sandbox.sandboxId,
        previewUrl
      })

      await persistFrontendSandboxStatus(sandbox, sandboxService, 'running')

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
      await persistFrontendSandboxStatus(sandbox, sandboxService, 'error', errorMessage)
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
        saveSandboxOrThrow(sandbox, sandboxService, '保存前端孤儿沙箱状态失败')
      }
      return
    }

    if (sandbox.isOrphan) {
      sandbox.isOrphan = false
      saveSandboxOrThrow(sandbox, sandboxService, '保存前端沙箱关联状态失败')
    }

    await syncFrontendPortBinding(sandbox, dockerService, sandboxService)

    if (details.state !== 'running') {
      await persistFrontendSandboxStatus(sandbox, sandboxService, 'stopped')
      return
    }

    await this.recoverFrontendRuntime(sandbox)
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

  private getRenderedTemplate(
    name: string,
    framework: FrontendFramework
  ): ReturnType<typeof templateService.renderTemplate> {
    return templateService.renderTemplate(framework, {
      projectName: buildProjectName(name)
    })
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
