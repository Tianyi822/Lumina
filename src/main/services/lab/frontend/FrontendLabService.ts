import { logger } from '@main/services/logger'
import type {
  CreateFrontendLabOptions,
  FrontendFramework,
  FrontendLabInfo,
  LabData
} from '@shared/types/lab'
import { labService } from '../LabService'
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
} from './frontendLabPorts'
import {
  buildContainerName,
  buildProjectName,
  buildWorkspaceVolumeLabels,
  buildWorkspaceVolumeName,
  ensureFrontendContainerRunning,
  invalidateFrontendBuildValidation,
  persistFrontendBuildValidationFailure,
  persistFrontendLabStatus,
  removeContainerIfExists,
  saveLabOrThrow,
  syncFrontendLifecycleStatus,
  syncFrontendPortBinding
} from './frontendLabPersistence'

const dockerService = getDockerService()

export { FRONTEND_LOG_HINT, FRONTEND_STARTUP_LOG_PATH, PREVIEW_READY_TIMEOUT_MS } from './constants'

interface FrontendRuntimeRecoveryResult {
  handled: boolean
  previewReady: boolean
  previewUrl?: string
  warning?: string
}

/**
 * 前端实验室服务
 * 负责创建可用于运行前端项目的基础容器
 */
export class FrontendLabService {
  /**
   * 加载并按需恢复前端实验室状态
   */
  async loadFrontendLabResolved(labId: string): Promise<LabData | null> {
    const lab = labService.loadLab(labId, {
      silent: true
    })
    if (!lab) {
      return null
    }

    if (!lab.frontend) {
      return lab
    }

    await this.reconcileFrontendLabState(lab)
    return (
      labService.loadLab(labId, {
        silent: true
      }) || lab
    )
  }

  /**
   * 创建前端实验室
   */
  async createFrontendLab(options: CreateFrontendLabOptions): Promise<FrontendLabInfo> {
    const {
      name,
      framework = 'vue',
      containerPort = DEFAULT_FRONTEND_PORT,
      projectRoot: rawProjectRoot = FRONTEND_PROJECT_ROOT
    } = options
    const projectRoot = normalizeProjectRoot(rawProjectRoot)

    if (!name || !name.trim()) {
      throw new Error('实验室名称不能为空')
    }

    if (!projectRoot) {
      throw new Error('项目根目录不在允许范围内')
    }

    if (projectRoot !== FRONTEND_PROJECT_ROOT) {
      throw new Error(`前端实验室项目根目录必须为 ${FRONTEND_PROJECT_ROOT}`)
    }

    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      throw new Error('容器端口必须是 1 到 65535 之间的整数')
    }

    let containerId: string | null = null
    let labId: string | null = null
    let volumeName: string | null = null

    try {
      const createResult = await labService.createLab({
        name,
        creationType: 'dockerfile'
      })

      if (!createResult.success || !createResult.lab) {
        throw new Error(createResult.error || '创建实验室元数据失败')
      }

      labId = createResult.lab.labId

      const imageId = await ensureFrontendBaseImage()
      const containerName = buildContainerName(name)
      const hostPort = await allocateFixedHostPort(getPreferredHostPort(containerPort), labService)
      volumeName = buildWorkspaceVolumeName(labId)

      await dockerService.createVolume({
        name: volumeName,
        labels: buildWorkspaceVolumeLabels(labId)
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

      const lab = createResult.lab
      const previewUrl = buildPreviewUrl(actualHostPort)
      lab.containerIds = [containerId]
      lab.primaryContainerId = containerId
      lab.status = 'running'
      lab.frontend = {
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

      const saveResult = labService.saveLab(lab)
      if (!saveResult.success) {
        throw new Error(saveResult.error || '保存前端实验室元数据失败')
      }

      const template = this.getRenderedTemplate(lab.name, framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        lab,
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

      await persistFrontendLabStatus(
        lab,
        labService,
        bootstrapResult.previewReady || options.autoStart === false ? 'running' : 'error',
        bootstrapResult.warning
      )

      if (!bootstrapResult.previewReady && options.autoStart !== false) {
        logger.warn('前端预览服务尚未就绪', 'main', {
          labId,
          previewUrl,
          startupLogPath: FRONTEND_STARTUP_LOG_PATH
        })
      }

      logger.info('前端实验室创建成功', 'main', {
        labId,
        framework,
        containerId: containerId.substring(0, 12),
        hostPort: actualHostPort
      })

      return {
        labId,
        name: lab.name,
        framework,
        containerId,
        volumeName,
        mountPath: FRONTEND_MOUNT_PATH,
        projectRoot,
        packageManager: FRONTEND_PACKAGE_MANAGER,
        runtime: FRONTEND_RUNTIME,
        builder: FRONTEND_BUILDER,
        bootstrapStatus: lab.frontend.bootstrapStatus,
        buildValidated: lab.frontend.buildValidated,
        containerPort,
        hostPort: actualHostPort,
        previewUrl,
        previewReady: bootstrapResult.previewReady,
        startupLogPath: FRONTEND_STARTUP_LOG_PATH,
        message,
        status: lab.status
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建前端实验室失败', 'main', {
        name,
        framework,
        labId,
        containerId,
        volumeName,
        error: errorMessage
      })

      if (labId) {
        const lab = labService.loadLab(labId)
        if (lab) {
          lab.status = 'error'
          if (lab.frontend) {
            lab.frontend.bootstrapStatus = 'error'
            lab.frontend.bootstrapError = errorMessage
            lab.frontend.lastBootstrapAt = new Date().toISOString()
          }
          labService.saveLab(lab)
        }
      }

      if (containerId && !labId) {
        await dockerService.removeContainer(containerId, true).catch(() => {})
      }

      throw error
    }
  }

  /**
   * 获取前端实验室的预览地址
   */
  getPreviewUrl(labId: string): string | null {
    const lab = labService.loadLab(labId)
    return lab?.frontend?.previewUrl || null
  }

  /**
   * 重试前端工作区初始化
   */
  async retryFrontendInitialization(labId: string): Promise<FrontendLabInfo> {
    const lab = this.loadFrontendLabOrThrow(labId, true)

    try {
      await ensureFrontendContainerRunning(lab, dockerService)
      await syncFrontendPortBinding(lab, dockerService, labService)

      const refreshedLab = this.loadFrontendLabOrThrow(labId, true)
      const template = this.getRenderedTemplate(refreshedLab.name, refreshedLab.frontend.framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        refreshedLab,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      await persistFrontendLabStatus(
        refreshedLab,
        labService,
        bootstrapResult.previewReady ? 'running' : 'error',
        bootstrapResult.warning
      )

      return this.buildFrontendLabInfo(
        refreshedLab,
        refreshedLab.primaryContainerId!,
        bootstrapResult.previewReady,
        bootstrapResult.warning || this.buildPreviewMessage(true, bootstrapResult.previewReady)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await persistFrontendLabStatus(lab, labService, 'error', errorMessage)
      throw error
    }
  }

  /**
   * 重建前端运行容器并复用原工作区
   */
  async rebuildFrontendRuntimeContainer(labId: string): Promise<FrontendLabInfo> {
    const lab = this.loadFrontendLabOrThrow(labId)

    try {
      await this.ensureFrontendWorkspaceVolumeReady(lab)

      for (const containerId of lab.containerIds) {
        await removeContainerIfExists(containerId, dockerService)
      }

      lab.containerIds = []
      lab.primaryContainerId = undefined
      lab.status = 'error'
      lab.isOrphan = false
      saveLabOrThrow(lab, labService, '更新前端实验室状态失败')

      const imageId = await ensureFrontendBaseImage()
      const desiredHostPort = await getReusableHostPort(
        lab.frontend.hostPort,
        lab.labId,
        labService
      )
      const containerResult = await dockerService.createContainerFromImage({
        imageId,
        name: buildContainerName(lab.name),
        ports: [
          {
            containerPort: lab.frontend.containerPort,
            hostPort: desiredHostPort,
            protocol: 'tcp'
          }
        ],
        volumes: [
          {
            source: lab.frontend.volumeName,
            destination: lab.frontend.mountPath,
            mode: 'rw'
          }
        ],
        workingDir: lab.frontend.projectRoot
      })

      if (!containerResult.success || !containerResult.containerId) {
        throw new Error(containerResult.error || '重建前端容器失败')
      }

      const containerId = containerResult.containerId
      const details = await dockerService.getContainerDetails(containerId)
      const boundPort = details?.ports.find(
        (item) => item.containerPort === lab.frontend!.containerPort && item.protocol === 'tcp'
      )
      const actualHostPort = boundPort?.hostPort

      if (!actualHostPort) {
        throw new Error('重建后未找到容器端口映射')
      }

      lab.containerIds = [containerId]
      lab.primaryContainerId = containerId
      lab.status = 'running'
      lab.isOrphan = false
      lab.frontend.hostPort = actualHostPort
      lab.frontend.previewUrl = buildPreviewUrl(actualHostPort)
      saveLabOrThrow(lab, labService, '保存重建后的前端实验室元数据失败')

      const refreshedLab = this.loadFrontendLabOrThrow(labId, true)
      const template = this.getRenderedTemplate(refreshedLab.name, refreshedLab.frontend.framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        refreshedLab,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      await persistFrontendLabStatus(
        refreshedLab,
        labService,
        bootstrapResult.previewReady ? 'running' : 'error',
        bootstrapResult.warning
      )

      return this.buildFrontendLabInfo(
        refreshedLab,
        containerId,
        bootstrapResult.previewReady,
        bootstrapResult.warning || this.buildPreviewMessage(true, bootstrapResult.previewReady)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await persistFrontendLabStatus(lab, labService, 'error', errorMessage)
      throw error
    }
  }

  /**
   * 对前端工作区执行一次 Bun 构建校验
   */
  async validateFrontendBuild(labId: string): Promise<FrontendLabInfo> {
    const lab = this.loadFrontendLabOrThrow(labId, true)

    try {
      await this.ensureFrontendWorkspaceVolumeReady(lab)
      await ensureFrontendContainerRunning(lab, dockerService)
      await syncFrontendLifecycleStatus(lab, dockerService, labService)
      await syncFrontendPortBinding(lab, dockerService, labService)

      const refreshedLab = this.loadFrontendLabOrThrow(labId, true)
      const template = this.getRenderedTemplate(refreshedLab.name, refreshedLab.frontend.framework)

      let state = await frontendWorkspaceBootstrapService.readBootstrapState(refreshedLab)
      state = await frontendWorkspaceBootstrapService.ensureWorkspaceReady(
        refreshedLab,
        template,
        state
      )
      state = await frontendWorkspaceBootstrapService.ensureDependenciesReady(
        refreshedLab,
        template,
        state
      )
      await frontendWorkspaceBootstrapService.ensureBuildReady(refreshedLab, template, state, {
        force: true
      })

      const latestLab = this.loadFrontendLabOrThrow(labId, true)
      await syncFrontendLifecycleStatus(latestLab, dockerService, labService)
      const finalizedLab = this.loadFrontendLabOrThrow(labId, true)
      const previewReady = await checkHttpReady(finalizedLab.frontend.previewUrl)

      return this.buildFrontendLabInfo(
        finalizedLab,
        finalizedLab.primaryContainerId!,
        previewReady,
        'Bun 构建校验通过，可继续执行导出或预览前校验'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      try {
        await persistFrontendBuildValidationFailure(
          labId,
          errorMessage,
          labService,
          frontendWorkspaceBootstrapService
        )
      } catch (stateError) {
        logger.warn('写入前端构建校验错误状态失败', 'main', {
          labId,
          error: stateError instanceof Error ? stateError.message : String(stateError)
        })
      }

      try {
        const current = this.loadFrontendLabOrThrow(labId, true)
        await syncFrontendLifecycleStatus(current, dockerService, labService, {
          preserveBootstrapError: true
        })
      } catch (statusError) {
        logger.warn('同步前端构建校验后的生命周期状态失败', 'main', {
          labId,
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
    labId: string,
    waitTimeoutMs: number = 0
  ): Promise<Pick<
    FrontendLabInfo,
    'previewUrl' | 'previewReady' | 'startupLogPath' | 'message'
  > | null> {
    const lab = await this.loadFrontendLabResolved(labId)
    if (!lab?.frontend) {
      return null
    }

    await syncFrontendPortBinding(lab, dockerService, labService)
    const refreshedLab = labService.loadLab(labId) || lab
    const previewUrl = refreshedLab.frontend?.previewUrl || lab.frontend.previewUrl

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
  async recoverFrontendRuntime(lab: LabData): Promise<FrontendRuntimeRecoveryResult> {
    if (!lab.frontend || !lab.primaryContainerId) {
      return {
        handled: false,
        previewReady: false
      }
    }

    await syncFrontendPortBinding(lab, dockerService, labService)

    const { framework, previewUrl } = lab.frontend

    if (await checkHttpReady(previewUrl)) {
      await persistFrontendLabStatus(lab, labService, 'running')
      return {
        handled: true,
        previewReady: true,
        previewUrl
      }
    }

    try {
      const template = this.getRenderedTemplate(lab.name, framework)
      const bootstrapResult = await frontendWorkspaceBootstrapService.bootstrapWorkspace(
        lab,
        template,
        {
          installDependencies: true,
          autoStart: true,
          throwOnFailure: false
        }
      )

      if (!bootstrapResult.previewReady) {
        await persistFrontendLabStatus(lab, labService, 'error')
        logger.warn('前端服务启动后未就绪', 'main', {
          labId: lab.labId,
          previewUrl
        })
        return {
          handled: true,
          previewReady: false,
          previewUrl: bootstrapResult.previewUrl || previewUrl,
          warning: bootstrapResult.warning
        }
      }

      await invalidateFrontendBuildValidation(lab, frontendWorkspaceBootstrapService)

      logger.info('前端服务恢复成功', 'main', {
        labId: lab.labId,
        previewUrl
      })

      await persistFrontendLabStatus(lab, labService, 'running')

      return {
        handled: true,
        previewReady: true,
        previewUrl: bootstrapResult.previewUrl || previewUrl
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('前端服务恢复异常', 'main', {
        labId: lab.labId,
        error: errorMessage
      })
      await persistFrontendLabStatus(lab, labService, 'error', errorMessage)
      return {
        handled: true,
        previewReady: false,
        previewUrl,
        warning: `前端服务恢复异常: ${errorMessage}`
      }
    }
  }

  /**
   * 根据容器 ID 恢复关联前端实验室的开发服务器
   */
  async recoverFrontendRuntimeByContainerId(
    containerId: string
  ): Promise<FrontendRuntimeRecoveryResult> {
    const lab = labService.findLabByContainerId(containerId)
    if (!lab?.frontend) {
      return {
        handled: false,
        previewReady: false
      }
    }

    if (lab.primaryContainerId && lab.primaryContainerId !== containerId) {
      return {
        handled: false,
        previewReady: false
      }
    }

    return this.recoverFrontendRuntime(lab)
  }

  private async reconcileFrontendLabState(lab: LabData): Promise<void> {
    if (!lab.frontend) {
      return
    }

    const containerId = lab.primaryContainerId || lab.containerIds[0]
    if (!containerId) {
      return
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (!details) {
      if (!lab.isOrphan || lab.status !== 'error') {
        lab.isOrphan = true
        lab.status = 'error'
        saveLabOrThrow(lab, labService, '保存前端孤儿实验室状态失败')
      }
      return
    }

    if (lab.isOrphan) {
      lab.isOrphan = false
      saveLabOrThrow(lab, labService, '保存前端实验室关联状态失败')
    }

    await syncFrontendPortBinding(lab, dockerService, labService)

    if (details.state !== 'running') {
      await persistFrontendLabStatus(lab, labService, 'stopped')
      return
    }

    await this.recoverFrontendRuntime(lab)
  }

  private loadFrontendLabOrThrow(
    labId: string,
    requireContainer: boolean = false
  ): LabData & { frontend: NonNullable<LabData['frontend']> } {
    const lab = labService.loadLab(labId)

    if (!lab?.frontend) {
      throw new Error('未找到前端实验室元数据')
    }

    if (requireContainer && !lab.primaryContainerId && lab.containerIds.length === 0) {
      throw new Error('前端实验室没有关联容器，请改用重建容器')
    }

    return lab as LabData & { frontend: NonNullable<LabData['frontend']> }
  }

  private async ensureFrontendWorkspaceVolumeReady(lab: LabData): Promise<void> {
    const volumeName = lab.frontend?.volumeName

    if (!volumeName) {
      throw new Error('前端实验室缺少工作区 volume 信息')
    }

    const exists = await dockerService.volumeExists(volumeName)
    if (!exists) {
      throw new Error(`前端工作区不存在: ${volumeName}`)
    }

    const ownedByLab = await dockerService.isVolumeOwnedByLab(volumeName, lab.labId)
    if (!ownedByLab) {
      throw new Error(`前端工作区 volume 不属于当前实验室: ${volumeName}`)
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

  private buildFrontendLabInfo(
    lab: LabData & { frontend: NonNullable<LabData['frontend']> },
    containerId: string,
    previewReady: boolean,
    message?: string
  ): FrontendLabInfo {
    return {
      labId: lab.labId,
      name: lab.name,
      framework: lab.frontend.framework,
      containerId,
      volumeName: lab.frontend.volumeName,
      mountPath: lab.frontend.mountPath,
      projectRoot: lab.frontend.projectRoot,
      packageManager: lab.frontend.packageManager,
      runtime: lab.frontend.runtime,
      builder: lab.frontend.builder,
      bootstrapStatus: lab.frontend.bootstrapStatus,
      buildValidated: lab.frontend.buildValidated,
      containerPort: lab.frontend.containerPort,
      hostPort: lab.frontend.hostPort,
      previewUrl: lab.frontend.previewUrl,
      previewReady,
      startupLogPath: FRONTEND_STARTUP_LOG_PATH,
      message,
      status: lab.status
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
      return `实验室已创建，但预览服务尚未就绪，${FRONTEND_LOG_HINT}`
    }

    return undefined
  }
}
