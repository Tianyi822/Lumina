import { computed, type ComputedRef, type Ref } from 'vue'
import {
  useContainerStore,
  useLabCreatorStore,
  useLabStore,
  useUIStateStore
} from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { ContainerInfo } from '@renderer/types/lab'

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
  const creatorStore = useLabCreatorStore()
  const containerStore = useContainerStore()
  const labStore = useLabStore()
  const uiStateStore = useUIStateStore()
  const notify = useNotification()

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
      case 'ssh': {
        const cfg = creatorStore.sshConfig
        const hasCredentials =
          cfg.authType === 'password'
            ? cfg.password.trim().length > 0
            : cfg.keyContent.trim().length > 0 && cfg.keyName.trim().length > 0
        return cfg.host.trim().length > 0 && cfg.username.trim().length > 0 && hasCredentials
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
        return '创建实验室元数据...'
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

        if (result?.success && result.lab?.labId) {
          // 加载新创建的实验室
          await labStore.loadLab(result.lab.labId)
          uiStateStore.setLabDetailTab('stats')
          options.closeDialog()
        }
        break
      }
      case 'dockerfile': {
        const result = await creatorStore.createFromDockerfile()
        if (result?.success && result.lab?.labId) {
          // 加载新创建的实验室
          await labStore.loadLab(result.lab.labId)
          uiStateStore.setLabDetailTab('stats')
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
          uiStateStore.setLabDetailTab('stats')
          options.closeDialog()
        }
        break
      }
      case 'ssh': {
        const ssh = creatorStore.sshConfig
        const labResult = await labStore.createLab({
          name: `${ssh.username}@${ssh.host}`,
          creationType: 'ssh',
          backendType: 'ssh',
          sshHost: ssh.host,
          sshPort: ssh.port,
          sshUsername: ssh.username,
          sshAuthType: ssh.authType,
          sshPassword: ssh.authType === 'password' ? ssh.password : undefined,
          sshKeyName: ssh.authType === 'key' ? ssh.keyName : undefined
        })

        if (labResult?.success && labResult.lab?.labId) {
          const connected = await labStore.connectSsh(labResult.lab.labId, {
            host: ssh.host,
            port: ssh.port,
            username: ssh.username,
            authType: ssh.authType,
            password: ssh.authType === 'password' ? ssh.password : undefined,
            keyName: ssh.authType === 'key' ? ssh.keyName : undefined,
            keyContent: ssh.authType === 'key' ? ssh.keyContent : undefined
          })

          if (connected) {
            notify.success('SSH 实验室已创建', `已连接到 ${ssh.host}`, { source: 'lab' })
          }

          await labStore.loadLab(labResult.lab.labId)
          uiStateStore.setLabDetailTab('terminal')
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
