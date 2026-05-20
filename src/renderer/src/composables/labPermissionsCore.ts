import type { LabCreationType, LabPermissionPolicy } from '@renderer/types/lab'
import { LAB_TYPE_PERMISSIONS } from '@renderer/types/lab'
import { getLabTypeMeta } from '@renderer/utils/labPermissions'

export interface LabPermissionResult {
  policy: LabPermissionPolicy | null
  typeMeta: {
    icon: string
    label: string
    fullLabel: string
    theme: 'warning' | 'info' | 'success'
    description: string
    deleteWarning: string
  } | null
  canStart: boolean
  canStop: boolean
  canRestart: boolean
  canDeleteContainer: boolean
  forceKeepContainer: boolean
  defaultDeleteContainer: boolean
  isReadOnly: boolean
  isManaged: boolean
  showLifecycleButtons: boolean
}

export function computeLabPermissions(
  creationType: LabCreationType | undefined | null
): LabPermissionResult {
  if (!creationType) {
    return {
      policy: null,
      typeMeta: null,
      canStart: false,
      canStop: false,
      canRestart: false,
      canDeleteContainer: false,
      forceKeepContainer: false,
      defaultDeleteContainer: false,
      isReadOnly: true,
      isManaged: false,
      showLifecycleButtons: false
    }
  }

  const policy = LAB_TYPE_PERMISSIONS[creationType] ?? null
  const typeMeta = getLabTypeMeta(creationType)
  const canStart = policy?.canStart ?? false
  const canStop = policy?.canStop ?? false
  const canRestart = policy?.canRestart ?? false
  const canDeleteContainer = policy?.canDeleteContainer ?? false
  const forceKeepContainer = policy?.forceKeepContainer ?? false
  const defaultDeleteContainer = policy?.defaultDeleteContainer ?? false
  const isReadOnly = !canStart && !canStop && !canRestart
  const isManaged = canStart && canStop && canRestart
  const showLifecycleButtons = isManaged

  return {
    policy,
    typeMeta,
    canStart,
    canStop,
    canRestart,
    canDeleteContainer,
    forceKeepContainer,
    defaultDeleteContainer,
    isReadOnly,
    isManaged,
    showLifecycleButtons
  }
}

export function getLabOperationDisabledReason(
  policy: LabPermissionPolicy | null,
  operation: 'start' | 'stop' | 'restart' | 'delete'
): string | undefined {
  if (!policy) return undefined

  switch (operation) {
    case 'start':
      return policy.canStart ? undefined : '已有容器类型的实验室不支持启动操作'
    case 'stop':
      return policy.canStop ? undefined : '已有容器类型的实验室不支持停止操作'
    case 'restart':
      return policy.canRestart ? undefined : '已有容器类型的实验室不支持重启操作'
    case 'delete':
      return undefined
    default:
      return undefined
  }
}
