/**
 * 实验室权限服务
 * 集中管理实验室类型的权限控制
 */

import type { LabCreationType, LabPermissionPolicy } from '@shared/types/lab'
import { LAB_TYPE_PERMISSIONS } from '@shared/types/lab'

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * 实验室权限服务
 * 提供统一的权限检查接口
 */
export class LabPermissionService {
  /**
   * 获取指定类型的权限策略
   */
  getPolicy(type: LabCreationType): LabPermissionPolicy {
    return LAB_TYPE_PERMISSIONS[type]
  }

  /**
   * 检查是否允许启动容器
   */
  canStart(type: LabCreationType): boolean {
    const policy = this.getPolicy(type)
    return policy.canStart
  }

  /**
   * 检查是否允许停止容器
   */
  canStop(type: LabCreationType): boolean {
    const policy = this.getPolicy(type)
    return policy.canStop
  }

  /**
   * 检查是否允许重启容器
   */
  canRestart(type: LabCreationType): boolean {
    const policy = this.getPolicy(type)
    return policy.canRestart
  }

  /**
   * 获取操作被拒绝的原因文案
   */
  private getDisabledReason(operation: string): string {
    return `SSH 远程服务器类型的实验室不允许${operation}操作，容器生命周期由远程服务器管理`
  }

  /**
   * 获取启动权限检查结果（带原因）
   */
  checkStart(type: LabCreationType): PermissionCheckResult {
    const allowed = this.canStart(type)
    if (allowed) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: this.getDisabledReason('启动')
    }
  }

  /**
   * 获取停止权限检查结果（带原因）
   */
  checkStop(type: LabCreationType): PermissionCheckResult {
    const allowed = this.canStop(type)
    if (allowed) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: this.getDisabledReason('停止')
    }
  }

  /**
   * 获取重启权限检查结果（带原因）
   */
  checkRestart(type: LabCreationType): PermissionCheckResult {
    const allowed = this.canRestart(type)
    if (allowed) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: this.getDisabledReason('重启')
    }
  }

  /**
   * 检查删除实验室时的容器处理策略
   */
  getDeleteContainerPolicy(type: LabCreationType): {
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
   */
  validateDeleteOptions(
    type: LabCreationType,
    requestedDeleteContainers?: boolean
  ): { shouldDeleteContainers: boolean; warning?: string } {
    const policy = this.getDeleteContainerPolicy(type)

    if (policy.forceKeep) {
      return {
        shouldDeleteContainers: false,
        warning: 'SSH 类型实验室仅删除元数据，关联连接不受影响'
      }
    }

    return {
      shouldDeleteContainers: requestedDeleteContainers ?? policy.defaultValue
    }
  }

  /**
   * 获取实验室类型的描述信息
   */
  getTypeDescription(type: LabCreationType): string {
    return this.getPolicy(type).description
  }

  /**
   * 检查是否为只读实验室（不允许生命周期管理）
   */
  isReadOnly(type: LabCreationType): boolean {
    const policy = this.getPolicy(type)
    return !policy.canStart && !policy.canStop && !policy.canRestart
  }

  /**
   * 检查是否为托管实验室（有完整管理权限）
   */
  isManaged(type: LabCreationType): boolean {
    const policy = this.getPolicy(type)
    return policy.canStart && policy.canStop && policy.canRestart
  }
}

// 导出单例实例
export const labPermissionService = new LabPermissionService()
