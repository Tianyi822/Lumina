import type { LabCreationType, LabBackendType } from './core'

/**
 * 实验室权限控制类型
 */
export interface LabPermissionPolicy {
  /** 允许启动容器 */
  canStart: boolean
  /** 允许停止容器 */
  canStop: boolean
  /** 允许重启容器 */
  canRestart: boolean
  /** 允许删除容器（删除实验室时） */
  canDeleteContainer: boolean
  /** 删除实验室时默认是否删除容器 */
  defaultDeleteContainer: boolean
  /** 删除实验室时是否强制不删除容器 */
  forceKeepContainer: boolean
  /** 描述 */
  description: string
}

/**
 * 实验室类型权限映射
 */
export const LAB_TYPE_PERMISSIONS: Record<LabCreationType, LabPermissionPolicy> = {
  ssh: {
    canStart: false,
    canStop: false,
    canRestart: false,
    canDeleteContainer: false,
    defaultDeleteContainer: false,
    forceKeepContainer: false,
    description: 'SSH远程服务器类型：不管理容器，仅管理连接和文件'
  }
}

/**
 * 检查是否为受管实验室类型
 */
export function isManagedLab(_type: LabCreationType): boolean {
  return false
}

/**
 * 检查是否为只读实验室类型
 */
export function isReadOnlyLab(_type: LabCreationType): boolean {
  return true
}

/** 检查是否为 SSH 后端实验室 */
export function isSshBackend(lab: { backendType: LabBackendType }): boolean {
  return lab.backendType === 'ssh'
}
