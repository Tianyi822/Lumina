import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { sandboxService, getDockerConfigService, getDockerService } from '@main/services/sandbox'
import type { SandboxData, SandboxResult, SandboxSelection } from '@shared/types/sandbox'

export const execAsync = promisify(exec)

/** 容器 ID 到沙箱选择的映射 */
export const containerSelections = new Map<string, SandboxSelection>()

/** 会话 ID 到容器 ID 的映射 */
export const sessionContainers = new Map<string, string>()

interface SandboxServices {
  sandboxService: typeof sandboxService
  configService: ReturnType<typeof getDockerConfigService>
  dockerService: ReturnType<typeof getDockerService>
}

/**
 * 获取沙箱相关服务
 */
export function getSandboxServices(): SandboxServices {
  return {
    sandboxService,
    configService: getDockerConfigService(),
    dockerService: getDockerService()
  }
}

/**
 * 标准化错误信息
 */
export function normalizeSandboxError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  const errorMessage = String(error).trim()
  return errorMessage || fallback
}

/**
 * 生成失败结果
 */
export function createErrorResult(error: unknown, fallback: string): SandboxResult {
  return {
    success: false,
    error: normalizeSandboxError(error, fallback)
  }
}

/**
 * 生成 Docker 兼容名称
 */
export function sanitizeDockerName(rawName: string, prefix: string): string {
  const sanitizedName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${prefix}${sanitizedName || Date.now()}`
}

/**
 * 更新沙箱元数据
 */
export function updateSandboxMetadata(
  sandboxId: string,
  updater: (sandbox: SandboxData) => void
): void {
  const sandbox = sandboxService.loadSandbox(sandboxId)
  if (!sandbox) {
    logger.warn('未找到需要更新的沙箱元数据', 'main', { sandboxId })
    return
  }

  updater(sandbox)
  sandboxService.saveSandbox(sandbox)
}
