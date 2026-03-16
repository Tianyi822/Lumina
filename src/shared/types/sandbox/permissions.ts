import type { SandboxCreationType } from './core'

/**
 * 沙箱权限控制类型
 * 定义每种沙箱类型的操作权限
 */
export interface SandboxPermissionPolicy {
  /** 允许启动容器 */
  canStart: boolean
  /** 允许停止容器 */
  canStop: boolean
  /** 允许重启容器 */
  canRestart: boolean
  /** 允许删除容器（删除沙箱时） */
  canDeleteContainer: boolean
  /** 删除沙箱时默认是否删除容器 */
  defaultDeleteContainer: boolean
  /** 删除沙箱时是否强制不删除容器（existing类型） */
  forceKeepContainer: boolean
  /** 描述 */
  description: string
}

/**
 * 沙箱类型权限映射
 * 集中管理三种沙箱类型的权限策略
 */
export const SANDBOX_TYPE_PERMISSIONS: Record<SandboxCreationType, SandboxPermissionPolicy> = {
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
  }
}

/**
 * 沙箱类型守卫
 * 检查值是否为有效的沙箱创建类型
 */
export function isSandboxCreationType(value: unknown): value is SandboxCreationType {
  return typeof value === 'string' && ['existing', 'compose', 'dockerfile'].includes(value)
}

/**
 * 检查是否为受管沙箱类型（有完整容器管理权限）
 */
export function isManagedSandbox(type: SandboxCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

/**
 * 检查是否为只读沙箱类型（仅关联，不管理生命周期）
 */
export function isReadOnlySandbox(type: SandboxCreationType): boolean {
  return type === 'existing'
}
