import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { labService, getDockerConfigService, getDockerService } from '@main/services/lab'
import type { LabData, LabResult, LabSelection } from '@shared/types/lab'

export const execAsync = promisify(exec)

/** 容器 ID 到实验室选择的映射 */
export const containerSelections = new Map<string, LabSelection>()

/** 会话 ID 到容器 ID 的映射 */
export const sessionContainers = new Map<string, string>()

interface LabServices {
  labService: typeof labService
  configService: ReturnType<typeof getDockerConfigService>
  dockerService: ReturnType<typeof getDockerService>
}

/**
 * 获取实验室相关服务
 */
export function getLabServices(): LabServices {
  return {
    labService,
    configService: getDockerConfigService(),
    dockerService: getDockerService()
  }
}

/**
 * 标准化错误信息
 */
export function normalizeLabError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  const errorMessage = String(error).trim()
  return errorMessage || fallback
}

/**
 * 生成失败结果
 */
export function createErrorResult(error: unknown, fallback: string): LabResult {
  return {
    success: false,
    error: normalizeLabError(error, fallback)
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
 * 更新实验室元数据
 */
export async function updateLabMetadata(
  labId: string,
  updater: (lab: LabData) => void
): Promise<void> {
  const lab = await labService.loadLab(labId)
  if (!lab) {
    logger.warn('未找到需要更新的实验室元数据', 'main', { labId })
    return
  }

  updater(lab)
  await labService.saveLab(lab)
}
