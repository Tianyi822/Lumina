import { computed, type ComputedRef, type Ref } from 'vue'
import {
  useContainerStore,
  useSandboxCreatorStore,
  useSandboxStore,
  useUIStateStore
} from '@renderer/stores'
import type { ContainerInfo } from '@shared/types/sandbox'

interface ContainerSelectorExpose {
  selectedContainerId?: string | null
  selectedContainer?: ContainerInfo | null
}

interface UseCreateFlowOptions {
  containerSelectorRef: Ref<ContainerSelectorExpose | null>
  closeDialog: () => void
}

interface UseCreateFlowResult {
  canCreate: ComputedRef<boolean>
  containerSelectHint: ComputedRef<string>
  createPhaseText: ComputedRef<string>
  createProgress: ComputedRef<number>
  clearError: () => void
  close: () => void
  handleCreate: () => Promise<void>
}

export function useCreateFlow(options: UseCreateFlowOptions): UseCreateFlowResult {
  const creatorStore = useSandboxCreatorStore()
  const containerStore = useContainerStore()
  const sandboxStore = useSandboxStore()
  const uiStateStore = useUIStateStore()

  const canCreate = computed(() => {
    switch (creatorStore.createType) {
      case 'compose':
        return (
          creatorStore.composeContent.trim().length > 0 &&
          creatorStore.composeProjectName.trim().length > 0
        )
      case 'dockerfile':
        return (
          creatorStore.dockerfileContent.trim().length > 0 &&
          creatorStore.dockerfileProjectName.trim().length > 0
        )
      case 'existing': {
        const selected = options.containerSelectorRef.value?.selectedContainer
        return selected != null && selected.state === 'running'
      }
      default:
        return false
    }
  })

  const containerSelectHint = computed(() => {
    if (creatorStore.createType !== 'existing') {
      return ''
    }

    const selected = options.containerSelectorRef.value?.selectedContainer
    if (!selected) {
      return ''
    }

    if (selected.state !== 'running') {
      return '只有运行中的容器才能选择使用，请先启动容器'
    }

    return ''
  })

  const createPhaseText = computed(() => {
    switch (creatorStore.createPhase) {
      case 'metadata':
        return '创建沙箱元数据...'
      case 'building':
        return '构建容器镜像...'
      case 'starting':
        return '启动容器中...'
      case 'done':
        return '创建完成'
      default:
        return ''
    }
  })

  const createProgress = computed(() => {
    switch (creatorStore.createPhase) {
      case 'metadata':
        return 20
      case 'building':
        return 60
      case 'starting':
        return 90
      case 'done':
        return 100
      default:
        return 0
    }
  })

  function clearError(): void {
    creatorStore.clearCreateError()
  }

  function close(): void {
    if (creatorStore.isCreating) {
      return
    }

    options.closeDialog()
  }

  async function handleCreate(): Promise<void> {
    switch (creatorStore.createType) {
      case 'compose': {
        const result = await creatorStore.createFromCompose({
          projectName: creatorStore.composeProjectName || undefined
        })

        if (result?.success && result.sandbox?.sandboxId) {
          // 加载新创建的沙箱
          await sandboxStore.loadSandbox(result.sandbox.sandboxId)
          uiStateStore.setSandboxDetailTab('stats')
          options.closeDialog()
        }
        break
      }
      case 'dockerfile': {
        const result = await creatorStore.createFromDockerfile()
        if (result?.success && result.sandbox?.sandboxId) {
          // 加载新创建的沙箱
          await sandboxStore.loadSandbox(result.sandbox.sandboxId)
          uiStateStore.setSandboxDetailTab('stats')
          options.closeDialog()
        }
        break
      }
      case 'existing': {
        const containerId = options.containerSelectorRef.value?.selectedContainerId
        if (!containerId) {
          return
        }

        const result = await creatorStore.createFromExisting(containerId)
        if (result?.success) {
          await containerStore.loadContainerDetails(containerId)
          await containerStore.loadContainerStats(containerId)
          uiStateStore.setSandboxDetailTab('stats')
          options.closeDialog()
        }
        break
      }
    }
  }

  return {
    canCreate,
    containerSelectHint,
    createPhaseText,
    createProgress,
    clearError,
    close,
    handleCreate
  }
}
