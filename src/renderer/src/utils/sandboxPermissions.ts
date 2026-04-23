/**
 * 沙箱权限工具函数
 * 提供前端权限检查和对话框配置
 */

import type { SandboxCreationType, SandboxPermissionPolicy } from '@shared/types/sandbox'
import {
  SANDBOX_TYPE_PERMISSIONS,
  isManagedSandbox,
  isReadOnlySandbox
} from '@shared/types/sandbox'

/**
 * 沙箱类型元数据（用于UI显示）
 */
export interface SandboxTypeMeta {
  icon: string
  label: string
  fullLabel: string
  theme: 'warning' | 'info' | 'success'
  description: string
  deleteWarning: string
}

/**
 * 获取沙箱类型的权限策略（非响应式）
 */
export function getSandboxPermissions(type: SandboxCreationType): SandboxPermissionPolicy {
  return SANDBOX_TYPE_PERMISSIONS[type]
}

/**
 * 检查是否允许容器生命周期管理
 */
export function canManageContainer(type: SandboxCreationType): {
  allowed: boolean
  reason?: string
} {
  const policy = SANDBOX_TYPE_PERMISSIONS[type]

  if (!policy.canStart && !policy.canStop && !policy.canRestart) {
    return {
      allowed: false,
      reason: '已有容器类型的沙箱不允许管理容器生命周期，请使用 Docker 命令行操作'
    }
  }

  return { allowed: true }
}

/**
 * 获取沙箱类型的UI元数据
 */
export function getSandboxTypeMeta(type: SandboxCreationType): SandboxTypeMeta {
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

/**
 * 获取删除确认对话框的配置
 */
export function getDeleteDialogConfig(
  type: SandboxCreationType,
  containerCount: number,
  sandboxName: string
): DeleteDialogConfig {
  const policy = SANDBOX_TYPE_PERMISSIONS[type]

  switch (type) {
    case 'existing':
      return {
        title: '确认删除沙箱',
        message: `确定要删除沙箱「${sandboxName}」吗？\n\n此沙箱关联的是已有容器，删除沙箱仅会移除管理记录，不会删除容器本身。容器将继续在 Docker 中运行。`,
        showDeleteOption: false,
        defaultDeleteContainers: false,
        confirmButtonText: '仅删除记录',
        warningMessage: '删除后如需再次管理此容器，需要重新创建沙箱并关联该容器。',
        typeTheme: 'warning'
      }

    case 'compose':
      return {
        title: '确认删除 Compose 沙箱',
        message: `确定要删除沙箱「${sandboxName}」吗？${
          containerCount > 1 ? `\n该沙箱包含 ${containerCount} 个容器。` : ''
        }`,
        showDeleteOption: true,
        defaultDeleteContainers: policy.defaultDeleteContainer,
        confirmButtonText: '删除沙箱',
        deleteOptionLabel:
          containerCount > 1 ? `同时停止并删除 ${containerCount} 个容器` : '同时停止并删除容器',
        warningMessage: '删除容器后将无法恢复，请确认已备份重要数据。',
        typeTheme: 'success'
      }

    case 'dockerfile':
      return {
        title: '确认删除 Dockerfile 沙箱',
        message: `确定要删除沙箱「${sandboxName}」吗？`,
        showDeleteOption: true,
        defaultDeleteContainers: policy.defaultDeleteContainer,
        confirmButtonText: '删除沙箱',
        deleteOptionLabel: '同时停止并删除容器',
        warningMessage: '删除容器后将无法恢复，请确认已备份重要数据。',
        typeTheme: 'info'
      }

    default:
      return {
        title: '确认删除',
        message: `确定要删除沙箱「${sandboxName}」吗？`,
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
  type: SandboxCreationType,
  operation: 'start' | 'stop' | 'restart' | 'delete'
): string | undefined {
  const policy = SANDBOX_TYPE_PERMISSIONS[type]

  switch (operation) {
    case 'start':
      return policy.canStart ? undefined : '已有容器类型的沙箱不支持启动操作，请使用 Docker 命令行'
    case 'stop':
      return policy.canStop ? undefined : '已有容器类型的沙箱不支持停止操作，请使用 Docker 命令行'
    case 'restart':
      return policy.canRestart
        ? undefined
        : '已有容器类型的沙箱不支持重启操作，请使用 Docker 命令行'
    case 'delete':
      return undefined // 删除总是允许，但行为不同
    default:
      return undefined
  }
}

// 重新导出共享类型中的守卫函数
export { isManagedSandbox, isReadOnlySandbox }
