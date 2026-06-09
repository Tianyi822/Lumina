import { logger } from '@main/services/logger'
import { labService } from '@main/services/lab'
import type { LabData, LabResult } from '@shared/types/lab'

export const execAsync = undefined

/**
 * 实验室 IPC 处理程序的共享工具函数
 */

/** 容器 ID 到实验室选择的映射 */
export const containerSelections = new Map<string, never>()

/** 会话 ID 到容器 ID 的映射 */
export const sessionContainers = new Map<string, string>()

/**
 * 获取实验室相关服务
 */
export function getLabServices() {
  return { labService }
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
