import { computed, type ComputedRef, type Ref } from 'vue'
import type { LabCreationType } from '@renderer/types/lab'
import { computeLabPermissions, getLabOperationDisabledReason } from './labPermissionsCore'

export type { LabPermissionResult } from './labPermissionsCore'

export function useLabPermissions(
  creationType:
    | ComputedRef<LabCreationType | undefined | null>
    | Ref<LabCreationType | undefined | null>
): {
  policy: ComputedRef<import('@renderer/types/lab').LabPermissionPolicy | null>
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
  const policy = computed(() => computeLabPermissions(creationType.value).policy)
  const typeMeta = computed(() => computeLabPermissions(creationType.value).typeMeta)
  const canStart = computed(() => computeLabPermissions(creationType.value).canStart)
  const canStop = computed(() => computeLabPermissions(creationType.value).canStop)
  const canRestart = computed(() => computeLabPermissions(creationType.value).canRestart)
  const canDeleteContainer = computed(
    () => computeLabPermissions(creationType.value).canDeleteContainer
  )
  const forceKeepContainer = computed(
    () => computeLabPermissions(creationType.value).forceKeepContainer
  )
  const defaultDeleteContainer = computed(
    () => computeLabPermissions(creationType.value).defaultDeleteContainer
  )
  const isReadOnly = computed(() => computeLabPermissions(creationType.value).isReadOnly)
  const isManaged = computed(() => computeLabPermissions(creationType.value).isManaged)
  const showLifecycleButtons = computed(
    () => computeLabPermissions(creationType.value).showLifecycleButtons
  )

  function getDisabledReason(
    operation: 'start' | 'stop' | 'restart' | 'delete'
  ): string | undefined {
    return getLabOperationDisabledReason(policy.value, operation)
  }

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
    showLifecycleButtons,
    getDisabledReason
  }
}

export default useLabPermissions
