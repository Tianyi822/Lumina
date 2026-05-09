import type { LabCreationType, LabBackendType } from './core'

/**
 * 实验室权限控制类型
 * 定义每种实验室类型的操作权限
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
  /** 删除实验室时是否强制不删除容器（existing类型） */
  forceKeepContainer: boolean
  /** 描述 */
  description: string
}

/**
 * 实验室类型权限映射
 * 集中管理三种实验室类型的权限策略
 */
export const LAB_TYPE_PERMISSIONS: Record<LabCreationType, LabPermissionPolicy> = {
  existing: {
    canStart: false,
    canStop: false,
    canRestart: false,
    canDeleteContainer: false,
    defaultDeleteContainer: false,
    forceKeepContainer: true,
    description: '已有容器类型：仅关联容器，不管理生命周期'
  },
  compose: {
    canStart: true,
    canStop: true,
    canRestart: true,
    canDeleteContainer: true,
    defaultDeleteContainer: true,
    forceKeepContainer: false,
    description: 'Compose类型：完整容器管理权限'
  },
  dockerfile: {
    canStart: true,
    canStop: true,
    canRestart: true,
    canDeleteContainer: true,
    defaultDeleteContainer: true,
    forceKeepContainer: false,
    description: 'Dockerfile类型：完整容器管理权限'
  },
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
 * 实验室类型守卫
 * 检查值是否为有效的实验室创建类型
 */
export function isLabCreationType(value: unknown): value is LabCreationType {
  return typeof value === 'string' && ['existing', 'compose', 'dockerfile', 'ssh'].includes(value)
}

/**
 * 检查是否为受管实验室类型（有完整容器管理权限）
 */
export function isManagedLab(type: LabCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

/**
 * 检查是否为只读实验室类型（仅关联，不管理生命周期）
 */
export function isReadOnlyLab(type: LabCreationType): boolean {
  return type === 'existing' || type === 'ssh'
}

/** 检查是否为 SSH 后端实验室 */
export function isSshBackend(lab: { backendType: LabBackendType }): boolean {
  return lab.backendType === 'ssh'
}
