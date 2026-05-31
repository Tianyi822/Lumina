import { logger } from '@main/services/logger'
import type { LabData } from '@shared/types/lab'
import type { LabService } from '../LabService'
import type { DockerService } from '../docker/DockerService'
import type { FrontendWorkspaceBootstrapService } from './FrontendWorkspaceBootstrapService'
import { buildPreviewUrl } from './frontendLabPorts'

/**
 * 同步前端实验室当前端口映射，兼容旧的动态端口实验室
 */
export async function syncFrontendPortBinding(
  lab: LabData,
  dockerService: DockerService,
  labService: LabService
): Promise<void> {
  if (!lab.frontend || !lab.primaryContainerId) {
    return
  }

  const details = await dockerService.getContainerDetails(lab.primaryContainerId)
  const boundPort = details?.ports.find(
    (item) => item.containerPort === lab.frontend?.containerPort && item.protocol === 'tcp'
  )
  const hostPort = boundPort?.hostPort

  if (!hostPort) {
    return
  }

  const previewUrl = buildPreviewUrl(hostPort)
  if (lab.frontend.hostPort === hostPort && lab.frontend.previewUrl === previewUrl) {
    return
  }

  lab.frontend.hostPort = hostPort
  lab.frontend.previewUrl = previewUrl
  const saveResult = await labService.saveLab(lab)

  if (!saveResult.success) {
    logger.warn('同步前端实验室端口映射失败', 'main', {
      labId: lab.labId,
      hostPort,
      error: saveResult.error
    })
    return
  }

  logger.info('前端实验室端口映射已同步', 'main', {
    labId: lab.labId,
    hostPort,
    previewUrl
  })
}

export async function saveLabOrThrow(
  lab: LabData,
  labService: LabService,
  fallbackMessage: string
): Promise<void> {
  const saveResult = await labService.saveLab(lab, {
    silent: true
  })
  if (!saveResult.success) {
    throw new Error(saveResult.error || fallbackMessage)
  }
}

export async function persistFrontendLabStatus(
  lab: LabData,
  labService: LabService,
  status: LabData['status'],
  bootstrapError?: string,
  options?: { preserveBootstrapError?: boolean }
): Promise<void> {
  const current =
    (await labService.loadLab(lab.labId, {
      silent: true
    })) || lab

  let nextBootstrapError = current.frontend?.bootstrapError

  if (current.frontend) {
    nextBootstrapError =
      status === 'error' ? bootstrapError || current.frontend.bootstrapError : undefined
    if (options?.preserveBootstrapError) {
      nextBootstrapError = lab.frontend?.bootstrapError || nextBootstrapError
    }
  }

  if (current.status === status && current.frontend?.bootstrapError === nextBootstrapError) {
    return
  }

  current.status = status
  current.updatedAt = new Date().toISOString()
  lab.status = status
  lab.updatedAt = current.updatedAt

  if (current.frontend) {
    current.frontend.lastBootstrapAt = new Date().toISOString()
    current.frontend.bootstrapError = nextBootstrapError
    if (lab.frontend) {
      lab.frontend.lastBootstrapAt = current.frontend.lastBootstrapAt
      lab.frontend.bootstrapError = current.frontend.bootstrapError
    }
  }

  await saveLabOrThrow(current, labService, '保存前端实验室状态失败')
}

export async function syncFrontendLifecycleStatus(
  lab: LabData,
  dockerService: DockerService,
  labService: LabService,
  options?: { preserveBootstrapError?: boolean }
): Promise<void> {
  const containerId = lab.primaryContainerId || lab.containerIds[0]

  if (!containerId) {
    return
  }

  const details = await dockerService.getContainerDetails(containerId)
  if (!details) {
    return
  }

  const nextStatus: LabData['status'] = details.state === 'running' ? 'running' : 'stopped'
  await persistFrontendLabStatus(lab, labService, nextStatus, undefined, options)
}

export async function ensureFrontendContainerRunning(
  lab: LabData,
  dockerService: DockerService
): Promise<void> {
  const containerId = lab.primaryContainerId || lab.containerIds[0]

  if (!containerId) {
    throw new Error('前端实验室没有关联容器，请改用重建容器')
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

export async function removeContainerIfExists(
  containerId: string,
  dockerService: DockerService
): Promise<void> {
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

export async function persistFrontendBuildValidationFailure(
  labId: string,
  errorMessage: string,
  labService: LabService,
  bootstrapService: FrontendWorkspaceBootstrapService
): Promise<void> {
  const lab = await labService.loadLab(labId)

  if (!lab?.frontend || (!lab.primaryContainerId && lab.containerIds.length === 0)) {
    throw new Error('未找到前端实验室元数据')
  }

  const currentState = await bootstrapService.readBootstrapState(lab)

  await bootstrapService.writeBootstrapState(lab, {
    ...currentState,
    buildValidated: false,
    bootstrapStatus: 'error',
    lastBootstrapAt: new Date().toISOString(),
    bootstrapError: errorMessage
  })
}

export async function invalidateFrontendBuildValidation(
  lab: LabData,
  bootstrapService: FrontendWorkspaceBootstrapService
): Promise<void> {
  if (!lab.frontend || !lab.primaryContainerId) {
    return
  }

  const currentState = await bootstrapService.readBootstrapState(lab)
  if (!currentState.buildValidated) {
    return
  }

  const nextBootstrapStatus = currentState.dependenciesInstalled
    ? 'runtime-ready'
    : currentState.workspaceInitialized
      ? 'workspace-ready'
      : 'pending'

  await bootstrapService.writeBootstrapState(lab, {
    ...currentState,
    buildValidated: false,
    bootstrapStatus: nextBootstrapStatus,
    lastBootstrapAt: new Date().toISOString(),
    bootstrapError: undefined
  })
}

/**
 * 生成容器名称
 */
export function buildContainerName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return `lab-frontend-${sanitized || 'app'}-${Date.now()}`
}

/**
 * 生成模板项目名
 */
export function buildProjectName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'lab-app'
  )
}

/**
 * 生成前端工作区 volume 名称
 */
export function buildWorkspaceVolumeName(labId: string): string {
  return `lab-frontend-workspace-${labId}`
}

/**
 * 构建前端工作区 volume 标签
 */
export function buildWorkspaceVolumeLabels(labId: string): Record<string, string> {
  return {
    'lumina.lab-id': labId,
    'lumina.volume-role': 'frontend-workspace'
  }
}
