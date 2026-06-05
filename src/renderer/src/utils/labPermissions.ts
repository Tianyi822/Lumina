/**
 * 实验室权限工具函数
 * 提供前端权限检查和对话框配置
 */

import type { LabCreationType, LabPermissionPolicy } from '@renderer/types/lab'
import { LAB_TYPE_PERMISSIONS, isManagedLab, isReadOnlyLab } from '@renderer/types/lab'

/**
 * 实验室类型元数据（用于UI显示）
 */
export interface LabTypeMeta {
  icon: string
  label: string
  fullLabel: string
  theme: 'warning' | 'info' | 'success'
  description: string
  deleteWarning: string
}

/**
 * 获取实验室类型的权限策略（非响应式）
 */
export function getLabPermissions(type: LabCreationType): LabPermissionPolicy {
  return LAB_TYPE_PERMISSIONS[type]
}

/**
 * 检查是否允许容器生命周期管理
 */
export function canManageContainer(type: LabCreationType): {
  allowed: boolean
  reason?: string
} {
  const policy = LAB_TYPE_PERMISSIONS[type]

  if (!policy.canStart && !policy.canStop && !policy.canRestart) {
    return {
      allowed: false,
      reason: 'SSH 远程服务器的容器生命周期由远程服务器管理，请通过 SSH 连接操作'
    }
  }

  return { allowed: true }
}

/**
 * 获取实验室类型的UI元数据
 */
export function getLabTypeMeta(type: LabCreationType): LabTypeMeta {
  switch (type) {
    case 'ssh':
      return {
        icon: '🔌',
        label: 'SSH',
        fullLabel: 'SSH 远程服务器',
        theme: 'info',
        description: '远程服务器 · 命令与文件',
        deleteWarning: '此操作仅删除 Lumina 中的记录，不影响远程服务器'
      }
    default:
      return {
        icon: '❓',
        label: '未知',
        fullLabel: '未知类型',
        theme: 'warning',
        description: '',
        deleteWarning: ''
      }
  }
}

/**
 * 删除对话框配置
 */
export interface DeleteDialogConfig {
  title: string
  message: string
  showDeleteOption: boolean
  defaultDeleteContainers: boolean
  confirmButtonText: string
  deleteOptionLabel?: string
  warningMessage?: string
  typeTheme: 'warning' | 'info' | 'success' | 'default'
}

export interface DeleteDialogOptions {
  metadataOnly?: boolean
}

/**
 * 获取删除确认对话框的配置
 */
export function getDeleteDialogConfig(
  type: LabCreationType,
  _containerCount: number,
  labName: string,
  _options: DeleteDialogOptions = {}
): DeleteDialogConfig {
  switch (type) {
    case 'ssh':
      return {
        title: '确认删除 SSH 实验室',
        message: `确定要删除实验室「${labName}」吗？\n\n此实验室连接的是远程服务器，删除仅会移除管理记录和连接配置，不会影响远程服务器本身。`,
        showDeleteOption: false,
        defaultDeleteContainers: false,
        confirmButtonText: '删除实验室',
        warningMessage: '删除后将断开 SSH 连接，需要重新创建实验室才能再次管理此服务器。',
        typeTheme: 'info'
      }

    default:
      return {
        title: '确认删除',
        message: `确定要删除实验室「${labName}」吗？`,
        showDeleteOption: false,
        defaultDeleteContainers: false,
        confirmButtonText: '删除',
        typeTheme: 'default'
      }
  }
}

/**
 * 获取操作禁用原因
 */
export function getOperationDisabledReason(
  type: LabCreationType,
  operation: 'start' | 'stop' | 'restart' | 'delete'
): string | undefined {
  const policy = LAB_TYPE_PERMISSIONS[type]

  switch (operation) {
    case 'start':
      if (policy.canStart) return undefined
      return 'SSH 远程服务器的容器生命周期由远程服务器管理'
    case 'stop':
      if (policy.canStop) return undefined
      return 'SSH 远程服务器的容器生命周期由远程服务器管理'
    case 'restart':
      if (policy.canRestart) return undefined
      return 'SSH 远程服务器的容器生命周期由远程服务器管理'
    case 'delete':
      return undefined
    default:
      return undefined
  }
}

// 重新导出共享类型中的守卫函数
export { isManagedLab, isReadOnlyLab }
