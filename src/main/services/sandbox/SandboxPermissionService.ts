/**
 * 沙箱权限服务
 * 集中管理沙箱类型的权限控制
 */

import {
  SandboxCreationType,
  SandboxPermissionPolicy,
  SANDBOX_TYPE_PERMISSIONS
} from '@shared/types/sandbox'
import { logger } from '@main/services/logger'

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * 沙箱权限服务
 * 提供统一的权限检查接口
 */
export class SandboxPermissionService {
  /**
   * 获取指定类型的权限策略
   */
  getPolicy(type: SandboxCreationType): SandboxPermissionPolicy {
    return SANDBOX_TYPE_PERMISSIONS[type]
  }

  /**
   * 检查是否允许启动容器
   */
  canStart(type: SandboxCreationType): PermissionCheckResult {
    const policy = this.getPolicy(type)
    if (policy.canStart) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `${type} 类型的沙箱不允许启动容器操作，请使用 Docker 命令行管理容器生命周期`
    }
  }

  /**
   * 检查是否允许停止容器
   */
  canStop(type: SandboxCreationType): PermissionCheckResult {
    const policy = this.getPolicy(type)
    if (policy.canStop) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `${type} 类型的沙箱不允许停止容器操作，请使用 Docker 命令行管理容器生命周期`
    }
  }

  /**
   * 检查是否允许重启容器
   */
  canRestart(type: SandboxCreationType): PermissionCheckResult {
    const policy = this.getPolicy(type)
    if (policy.canRestart) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `${type} 类型的沙箱不允许重启容器操作，请使用 Docker 命令行管理容器生命周期`
    }
  }

  /**
   * 检查删除沙箱时的容器处理策略
   */
  getDeleteContainerPolicy(type: SandboxCreationType): {
    canDelete: boolean
    forceKeep: boolean
    defaultValue: boolean
  } {
    const policy = this.getPolicy(type)
    return {
      canDelete: policy.canDeleteContainer,
      forceKeep: policy.forceKeepContainer,
      defaultValue: policy.defaultDeleteContainer
    }
  }

  /**
   * 验证删除选项是否符合权限策略
   * 返回最终的 deleteContainers 值
   */
  validateDeleteOptions(
    type: SandboxCreationType,
    requestedDeleteContainers?: boolean
  ): { shouldDeleteContainers: boolean; warning?: string } {
    const policy = this.getDeleteContainerPolicy(type)

    // existing 类型强制不删除容器（保护用户原有容器）
    if (policy.forceKeep) {
      if (requestedDeleteContainers === true) {
        logger.warn('existing 类型沙箱不允许删除容器，已强制保留', 'main', {
          requestedDeleteContainers
        })
      }
      return {
        shouldDeleteContainers: false,
        warning: 'existing 类型沙箱仅删除元数据，关联容器将继续运行'
      }
    }

    // compose 和 dockerfile 类型，使用用户选择或默认值
    return {
      shouldDeleteContainers: requestedDeleteContainers ?? policy.defaultValue
    }
  }

  /**
   * 获取沙箱类型的描述信息
   */
  getTypeDescription(type: SandboxCreationType): string {
    return this.getPolicy(type).description
  }

  /**
   * 检查是否为只读沙箱（不允许生命周期管理）
   */
  isReadOnly(type: SandboxCreationType): boolean {
    const policy = this.getPolicy(type)
    return !policy.canStart && !policy.canStop && !policy.canRestart
  }

  /**
   * 检查是否为托管沙箱（有完整管理权限）
   */
  isManaged(type: SandboxCreationType): boolean {
    const policy = this.getPolicy(type)
    return policy.canStart && policy.canStop && policy.canRestart
  }
}

// 导出单例实例
export const sandboxPermissionService = new SandboxPermissionService()
