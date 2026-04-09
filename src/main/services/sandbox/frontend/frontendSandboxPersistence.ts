import { logger } from '@main/services/logger'
import type { SandboxData } from '@shared/types/sandbox'
import type { SandboxService } from '../SandboxService'
import type { DockerService } from '../docker/DockerService'
import type { FrontendWorkspaceBootstrapService } from './FrontendWorkspaceBootstrapService'
import { buildPreviewUrl } from './frontendSandboxPorts'

/**
 * 同步前端沙箱当前端口映射，兼容旧的动态端口沙箱
 */
export async function syncFrontendPortBinding(
  sandbox: SandboxData,
  dockerService: DockerService,
  sandboxService: SandboxService
): Promise<void> {
  if (!sandbox.frontend || !sandbox.primaryContainerId) {
    return
  }

  const details = await dockerService.getContainerDetails(sandbox.primaryContainerId)
  const boundPort = details?.ports.find(
    (item) => item.containerPort === sandbox.frontend?.containerPort && item.protocol === 'tcp'
  )
  const hostPort = boundPort?.hostPort

  if (!hostPort) {
    return
  }

  const previewUrl = buildPreviewUrl(hostPort)
  if (sandbox.frontend.hostPort === hostPort && sandbox.frontend.previewUrl === previewUrl) {
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

export function saveSandboxOrThrow(
  sandbox: SandboxData,
  sandboxService: SandboxService,
  fallbackMessage: string
): void {
  const saveResult = sandboxService.saveSandbox(sandbox, {
    silent: true
  })
  if (!saveResult.success) {
    throw new Error(saveResult.error || fallbackMessage)
  }
}

export async function persistFrontendSandboxStatus(
  sandbox: SandboxData,
  sandboxService: SandboxService,
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

  saveSandboxOrThrow(current, sandboxService, '保存前端沙箱状态失败')
}

export async function syncFrontendLifecycleStatus(
  sandbox: SandboxData,
  dockerService: DockerService,
  sandboxService: SandboxService,
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
  await persistFrontendSandboxStatus(sandbox, sandboxService, nextStatus, undefined, options)
}

export async function ensureFrontendContainerRunning(
  sandbox: SandboxData,
  dockerService: DockerService
): Promise<void> {
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
  sandboxId: string,
  errorMessage: string,
  sandboxService: SandboxService,
  bootstrapService: FrontendWorkspaceBootstrapService
): Promise<void> {
  const sandbox = sandboxService.loadSandbox(sandboxId)

  if (!sandbox?.frontend || (!sandbox.primaryContainerId && sandbox.containerIds.length === 0)) {
    throw new Error('未找到前端沙箱元数据')
  }

  const currentState = await bootstrapService.readBootstrapState(sandbox)

  await bootstrapService.writeBootstrapState(sandbox, {
    ...currentState,
    buildValidated: false,
    bootstrapStatus: 'error',
    lastBootstrapAt: new Date().toISOString(),
    bootstrapError: errorMessage
  })
}

export async function invalidateFrontendBuildValidation(
  sandbox: SandboxData,
  bootstrapService: FrontendWorkspaceBootstrapService
): Promise<void> {
  if (!sandbox.frontend || !sandbox.primaryContainerId) {
    return
  }

  const currentState = await bootstrapService.readBootstrapState(sandbox)
  if (!currentState.buildValidated) {
    return
  }

  const nextBootstrapStatus = currentState.dependenciesInstalled
    ? 'runtime-ready'
    : currentState.workspaceInitialized
      ? 'workspace-ready'
      : 'pending'

  await bootstrapService.writeBootstrapState(sandbox, {
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

  return `sandbox-frontend-${sanitized || 'app'}-${Date.now()}`
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
      .replace(/^-+|-+$/g, '') || 'sandbox-app'
  )
}

/**
 * 生成前端工作区 volume 名称
 */
export function buildWorkspaceVolumeName(sandboxId: string): string {
  return `sandbox-frontend-workspace-${sandboxId}`
}

/**
 * 构建前端工作区 volume 标签
 */
export function buildWorkspaceVolumeLabels(sandboxId: string): Record<string, string> {
  return {
    'sparrow-manus.sandbox-id': sandboxId,
    'sparrow-manus.volume-role': 'frontend-workspace'
  }
}
