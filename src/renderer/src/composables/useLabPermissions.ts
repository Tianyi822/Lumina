/**
 * 实验室权限 Composable
 * 提供响应式的权限检查
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import type { LabCreationType, LabPermissionPolicy } from '@renderer/types/lab'
import { LAB_TYPE_PERMISSIONS } from '@renderer/types/lab'
import { getLabTypeMeta } from '@renderer/utils/labPermissions'

/**
 * 实验室权限 Composable
 * 提供响应式的权限检查
 *
 * @param creationType - 实验室创建类型（响应式）
 */
export function useLabPermissions(
  creationType:
    | ComputedRef<LabCreationType | undefined | null>
    | Ref<LabCreationType | undefined | null>
): {
  policy: ComputedRef<LabPermissionPolicy | null>
  typeMeta: ComputedRef<{
    icon: string
    label: string
    fullLabel: string
    theme: 'warning' | 'info' | 'success'
    description: string
    deleteWarning: string
  } | null>
  canStart: ComputedRef<boolean>
  canStop: ComputedRef<boolean>
  canRestart: ComputedRef<boolean>
  canDeleteContainer: ComputedRef<boolean>
  forceKeepContainer: ComputedRef<boolean>
  defaultDeleteContainer: ComputedRef<boolean>
  isReadOnly: ComputedRef<boolean>
  isManaged: ComputedRef<boolean>
  showLifecycleButtons: ComputedRef<boolean>
  getDisabledReason: (operation: 'start' | 'stop' | 'restart' | 'delete') => string | undefined
} {
  /**
   * 权限策略
   */
  const policy = computed<LabPermissionPolicy | null>(() => {
    if (!creationType.value) return null
    return LAB_TYPE_PERMISSIONS[creationType.value]
  })

  /**
   * UI 元数据
   */
  const typeMeta = computed(() => {
    if (!creationType.value) return null
    return getLabTypeMeta(creationType.value)
  })

  /**
   * 是否允许启动容器
   */
  const canStart = computed(() => policy.value?.canStart ?? false)

  /**
   * 是否允许停止容器
   */
  const canStop = computed(() => policy.value?.canStop ?? false)

  /**
   * 是否允许重启容器
   */
  const canRestart = computed(() => policy.value?.canRestart ?? false)

  /**
   * 是否允许删除容器（删除实验室时）
   */
  const canDeleteContainer = computed(() => policy.value?.canDeleteContainer ?? false)

  /**
   * 是否强制保留容器（existing 类型）
   */
  const forceKeepContainer = computed(() => policy.value?.forceKeepContainer ?? false)

  /**
   * 默认是否删除容器
   */
  const defaultDeleteContainer = computed(() => policy.value?.defaultDeleteContainer ?? false)

  /**
   * 是否为只读实验室（不允许生命周期管理）
   */
  const isReadOnly = computed(() => {
    if (!policy.value) return true
    return !policy.value.canStart && !policy.value.canStop && !policy.value.canRestart
  })

  /**
   * 是否为托管实验室（有完整管理权限）
   */
  const isManaged = computed(() => {
    if (!policy.value) return false
    return policy.value.canStart && policy.value.canStop && policy.value.canRestart
  })

  /**
   * 是否显示生命周期操作按钮（启动/停止/重启）
   */
  const showLifecycleButtons = computed(() => isManaged.value)

  /**
   * 获取操作禁用原因
   */
  function getDisabledReason(
    operation: 'start' | 'stop' | 'restart' | 'delete'
  ): string | undefined {
    if (!policy.value) return undefined

    switch (operation) {
      case 'start':
        return policy.value.canStart ? undefined : '已有容器类型的实验室不支持启动操作'
      case 'stop':
        return policy.value.canStop ? undefined : '已有容器类型的实验室不支持停止操作'
      case 'restart':
        return policy.value.canRestart ? undefined : '已有容器类型的实验室不支持重启操作'
      case 'delete':
        return undefined
      default:
        return undefined
    }
  }

  return {
    // 权限策略
    policy,
    typeMeta,

    // 权限状态
    canStart,
    canStop,
    canRestart,
    canDeleteContainer,
    forceKeepContainer,
    defaultDeleteContainer,

    // 实验室类型判断
    isReadOnly,
    isManaged,
    showLifecycleButtons,

    // 方法
    getDisabledReason
  }
}

export default useLabPermissions
