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
    const reason =
      type === 'ssh'
        ? 'SSH 远程服务器的容器生命周期由远程服务器管理，请通过 SSH 连接操作'
        : '已有容器类型的实验室不允许管理容器生命周期，请使用 Docker 命令行操作'
    return {
      allowed: false,
      reason
    }
  }

  return { allowed: true }
}

/**
 * 获取实验室类型的UI元数据
 */
export function getLabTypeMeta(type: LabCreationType): LabTypeMeta {
  switch (type) {
    case 'existing':
      return {
        icon: '🔗',
        label: '已有容器',
        fullLabel: '已有容器关联',
        theme: 'warning',
        description: '外部容器 · 仅监控',
        deleteWarning: '此操作仅删除 Lumina 中的记录，不影响实际容器'
      }
    case 'dockerfile':
      return {
        icon: '📦',
        label: 'Dockerfile',
        fullLabel: 'Dockerfile 构建',
        theme: 'info',
        description: '托管容器 · 完全控制',
        deleteWarning: '删除容器后将无法恢复'
      }
    case 'compose':
      return {
        icon: '🎛️',
        label: 'Compose',
        fullLabel: 'Docker Compose 编排',
        theme: 'success',
        description: '托管容器组 · 完全控制',
        deleteWarning: '删除所有服务容器后将无法恢复'
      }
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
  containerCount: number,
  labName: string,
  options: DeleteDialogOptions = {}
): DeleteDialogConfig {
  const policy = LAB_TYPE_PERMISSIONS[type]

  if (options.metadataOnly && isManagedLab(type)) {
    return {
      title: '确认删除实验室元数据',
      message: `当前无法连接或确认实验室「${labName}」关联的 Docker 容器。\n\n继续删除只会移除 Lumina 中的实验室记录，不会停止或删除 Docker 容器。`,
      showDeleteOption: false,
      defaultDeleteContainers: false,
      confirmButtonText: '删除元数据',
      warningMessage:
        '删除后实验室元数据会丢失，无法再通过此记录重连或恢复关联；如需保留重连能力，请先恢复 Docker 或容器连接后再删除。',
      typeTheme: 'warning'
    }
  }

  switch (type) {
    case 'existing':
      return {
        title: '确认删除实验室',
        message: `确定要删除实验室「${labName}」吗？\n\n此实验室关联的是已有容器，删除实验室仅会移除管理记录，不会删除容器本身。容器将继续在 Docker 中运行。`,
        showDeleteOption: false,
        defaultDeleteContainers: false,
        confirmButtonText: '仅删除记录',
        warningMessage: '删除后如需再次管理此容器，需要重新创建实验室并关联该容器。',
        typeTheme: 'warning'
      }

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

    case 'compose':
      return {
        title: '确认删除 Compose 实验室',
        message: `确定要删除实验室「${labName}」吗？${
          containerCount > 1 ? `\n该实验室包含 ${containerCount} 个容器。` : ''
        }`,
        showDeleteOption: true,
        defaultDeleteContainers: policy.defaultDeleteContainer,
        confirmButtonText: '删除实验室',
        deleteOptionLabel:
          containerCount > 1 ? `同时停止并删除 ${containerCount} 个容器` : '同时停止并删除容器',
        warningMessage: '删除容器后将无法恢复，请确认已备份重要数据。',
        typeTheme: 'success'
      }

    case 'dockerfile':
      return {
        title: '确认删除 Dockerfile 实验室',
        message: `确定要删除实验室「${labName}」吗？`,
        showDeleteOption: true,
        defaultDeleteContainers: policy.defaultDeleteContainer,
        confirmButtonText: '删除实验室',
        deleteOptionLabel: '同时停止并删除容器',
        warningMessage: '删除容器后将无法恢复，请确认已备份重要数据。',
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
      return type === 'ssh'
        ? 'SSH 远程服务器的容器生命周期由远程服务器管理'
        : '已有容器类型的实验室不支持启动操作，请使用 Docker 命令行'
    case 'stop':
      if (policy.canStop) return undefined
      return type === 'ssh'
        ? 'SSH 远程服务器的容器生命周期由远程服务器管理'
        : '已有容器类型的实验室不支持停止操作，请使用 Docker 命令行'
    case 'restart':
      if (policy.canRestart) return undefined
      return type === 'ssh'
        ? 'SSH 远程服务器的容器生命周期由远程服务器管理'
        : '已有容器类型的实验室不支持重启操作，请使用 Docker 命令行'
    case 'delete':
      return undefined // 删除总是允许，但行为不同
    default:
      return undefined
  }
}

// 重新导出共享类型中的守卫函数
export { isManagedLab, isReadOnlyLab }
