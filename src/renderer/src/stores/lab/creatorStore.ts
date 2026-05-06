import { ref, computed, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type {
  ComposeOptions,
  CreateLabRequest,
  CreateLabResult,
  LabCreationType,
  ComposeDockerfileConfig
} from '@renderer/types/lab'
import { useContainerStore } from './containerStore'
import { useDockerConfigStore } from './configStore'
import { useLabStore } from './labStore'
import { usePortMappingStore } from './portMappingStore'
import { useComposeConfigStore } from './composeConfigStore'
import { useDockerfileConfigStore } from './dockerfileConfigStore'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import type { LabCreateType, CreatePhase, ComposeTemplateType } from './types'

export const useLabCreatorStore = defineStore('labCreator', () => {
  // ==================== Store Dependencies ====================

  const containerStore = useContainerStore()
  const configStore = useDockerConfigStore()
  const portMappingStore = usePortMappingStore()
  const composeConfigStore = useComposeConfigStore()
  const dockerfileConfigStore = useDockerfileConfigStore()
  const notify = useNotification()

  const { containers } = storeToRefs(containerStore)
  const { loadDockerfileConfig, loadComposeConfig, saveDockerfileConfig, saveComposeConfig } =
    configStore

  const { portMappings } = storeToRefs(portMappingStore)
  const { composeContent, composeProjectName, selectedComposeId, generatorForm } =
    storeToRefs(composeConfigStore)
  const { dockerfileContent, dockerfileContext, dockerfileProjectName, selectedDockerfileId } =
    storeToRefs(dockerfileConfigStore)

  // ==================== State: 创建类型与容器选择 ====================

  /** 创建类型 */
  const createType = ref<LabCreateType>('compose')
  /** 选中的容器 ID (用于创建器) */
  const selectedContainerId = ref<string | null>(null)
  /** 容器过滤类型 (用于创建器) */
  const containerFilter = ref<'all' | 'running' | 'stopped'>('all')
  /** 容器搜索关键词 (用于创建器) */
  const containerSearchQuery = ref('')

  // ==================== State: 保存对话框 ====================

  /** 保存配置对话框显示状态 */
  const showSaveDialog = ref(false)
  /** 保存配置对话框类型 */
  const saveDialogType = ref<'dockerfile' | 'compose'>('compose')
  /** 保存配置名称 */
  const saveConfigName = ref('')

  // ==================== State: 创建状态跟踪 ====================

  /** 创建进行中状态 */
  const isCreating = ref(false)
  /** 创建错误信息 */
  const createError = ref<string | null>(null)
  /** 创建阶段 */
  const createPhase = ref<CreatePhase>('idle')

  // ==================== Watchers ====================

  // 监听内容变化，自动解析端口
  watch(dockerfileContent, (content) => {
    if (createType.value === 'dockerfile' && content) {
      portMappingStore.portMappings = portMappingStore.parseDockerfilePorts(content)
    }
  })

  watch(composeContent, (content) => {
    if (createType.value === 'compose' && content) {
      portMappingStore.portMappings = portMappingStore.parseComposePorts(content)
    }
  })

  watch(createType, (type) => {
    if (type === 'dockerfile') {
      portMappingStore.portMappings = portMappingStore.parseDockerfilePorts(dockerfileContent.value)
    } else if (type === 'compose') {
      portMappingStore.portMappings = portMappingStore.parseComposePorts(composeContent.value)
    } else {
      portMappingStore.portMappings = []
    }
  })

  // ==================== Getters ====================

  /** 创建器过滤后的容器列表 */
  const filteredContainers = computed(() => {
    let result = containers.value

    if (containerFilter.value !== 'all') {
      if (containerFilter.value === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (containerFilter.value === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      }
    }

    if (containerSearchQuery.value.trim()) {
      const query = containerSearchQuery.value.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(query)) ||
          c.image.toLowerCase().includes(query)
      )
    }

    return result
  })

  const runningCount = computed(() => containers.value.filter((c) => c.state === 'running').length)

  const stoppedCount = computed(
    () => containers.value.filter((c) => c.state === 'exited' || c.state === 'dead').length
  )

  const canCreate = computed(() => {
    switch (createType.value) {
      case 'compose':
        return composeContent.value.trim().length > 0 && composeProjectName.value.trim().length > 0
      case 'dockerfile':
        return (
          dockerfileContent.value.trim().length > 0 && dockerfileProjectName.value.trim().length > 0
        )
      case 'existing':
        return selectedContainerId.value !== null
      default:
        return false
    }
  })

  // ==================== Actions: 容器选择 ====================

  function selectContainer(containerId: string): void {
    selectedContainerId.value = selectedContainerId.value === containerId ? null : containerId
  }

  function resetContainerSelector(): void {
    containerSearchQuery.value = ''
    containerFilter.value = 'all'
    selectedContainerId.value = null
  }

  // ==================== Actions: 配置生成器 ====================

  async function onSavedDockerfileSelect(): Promise<void> {
    if (!generatorForm.value.savedDockerfileId) {
      generatorForm.value.useSavedDockerfile = false
      return
    }

    generatorForm.value.useSavedDockerfile = true
    const config = await loadDockerfileConfig(generatorForm.value.savedDockerfileId)
    if (config) {
      generatorForm.value.context = `./${config.name}`
      generatorForm.value.dockerfile = config.filename
    }
  }

  function clearSavedDockerfile(): void {
    generatorForm.value.savedDockerfileId = null
    generatorForm.value.useSavedDockerfile = false
    generatorForm.value.context = './app'
    generatorForm.value.dockerfile = 'Dockerfile'
  }

  // ==================== Actions: 保存配置 ====================

  function openSaveDialog(type: 'dockerfile' | 'compose'): void {
    saveDialogType.value = type
    saveConfigName.value = ''
    showSaveDialog.value = true
  }

  function closeSaveDialog(): void {
    showSaveDialog.value = false
    saveConfigName.value = ''
  }

  async function handleSaveConfig(): Promise<void> {
    if (!saveConfigName.value.trim()) return

    const content =
      saveDialogType.value === 'dockerfile' ? dockerfileContent.value : composeContent.value

    if (saveDialogType.value === 'dockerfile') {
      await saveDockerfileConfig({
        name: saveConfigName.value.trim(),
        content: content
      })
    } else {
      await saveComposeConfig({
        name: saveConfigName.value.trim(),
        content: content
      })
    }

    showSaveDialog.value = false
    const notify = useNotification()
    notify.success('保存成功', `配置「${saveConfigName.value.trim()}」保存成功`, {
      source: 'creator'
    })
  }

  // ==================== Actions: 加载已保存配置 ====================

  async function loadSelectedDockerfile(): Promise<void> {
    if (!selectedDockerfileId.value) return
    const config = await loadDockerfileConfig(selectedDockerfileId.value)
    if (config) {
      dockerfileContent.value = config.content
    }
  }

  async function loadSelectedCompose(): Promise<void> {
    if (!selectedComposeId.value) return
    const config = await loadComposeConfig(selectedComposeId.value)
    if (config) {
      composeContent.value = config.content
      composeProjectName.value = config.name
    }
  }

  // ==================== Actions: 创建实验室 ====================

  /**
   * 从 Compose 创建实验室
   */
  async function createFromCompose(
    options?: ComposeOptions
  ): Promise<(CreateLabResult & { composeError?: string }) | null> {
    const labStore = useLabStore()

    // 重置状态
    isCreating.value = true
    createError.value = null
    createPhase.value = 'metadata'

    try {
      window.api.logger.info('[LabCreatorStore] 开始从 Compose 创建实验室', {
        projectName: options?.projectName || composeProjectName.value,
        composeConfigId: selectedComposeId.value
      })

      const request: CreateLabRequest = {
        name: composeProjectName.value.trim() || '创建 Compose 实验室',
        creationType: 'compose' as LabCreationType,
        composeConfigId: selectedComposeId.value || undefined,
        projectName: options?.projectName || composeProjectName.value
      }

      const result = await labStore.createLab(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建实验室元数据失败'
        createError.value = errorMsg
        createPhase.value = 'idle'
        isCreating.value = false
        notify.error('创建实验室失败', errorMsg, { source: 'lab', dedupeKey: 'lab:creator' })
        window.api.logger.error('[LabCreatorStore] 创建实验室元数据失败', {
          error: errorMsg
        })
        return {
          success: false,
          lab: result?.lab,
          error: errorMsg,
          composeError: errorMsg
        }
      }

      createPhase.value = 'building'

      // 准备 Dockerfile 配置列表（用于 compose 中的 build 指令）
      const dockerfiles: ComposeDockerfileConfig[] = []
      if (generatorForm.value.useSavedDockerfile && generatorForm.value.savedDockerfileId) {
        dockerfiles.push({
          dockerfileId: generatorForm.value.savedDockerfileId,
          targetContext: generatorForm.value.context,
          targetFilename: generatorForm.value.dockerfile
        })
      }

      // 尝试调用 Docker 创建容器 API
      try {
        const composeResult = await labApi.createFromCompose(
          composeContent.value,
          {
            ...options,
            dockerfiles: dockerfiles.length > 0 ? dockerfiles : undefined
          },
          result.lab?.labId,
          composeProjectName.value.trim() || undefined
        )

        if (!composeResult.success) {
          createError.value = composeResult.error || 'Docker Compose 创建失败'
          createPhase.value = 'idle'
          isCreating.value = false

          // 清理已创建的实验室元数据
          if (result.lab?.labId) {
            try {
              await labApi.deleteLab(result.lab.labId, { force: true, deleteContainers: false })
              window.api.logger.info('[LabCreatorStore] 已清理失败的实验室', {
                labId: result.lab.labId
              })
            } catch (cleanupError) {
              window.api.logger.warn('[LabCreatorStore] 清理实验室失败', {
                labId: result.lab.labId,
                error:
                  cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              })
            }
          }

          notify.error('Compose 创建失败', createError.value, {
            source: 'lab',
            dedupeKey: 'lab:creator'
          })
          window.api.logger.error('[LabCreatorStore] Docker Compose 创建失败', {
            error: createError.value
          })
          return {
            success: false,
            lab: result.lab,
            error: `Docker 创建失败: ${createError.value}`,
            composeError: createError.value
          }
        }

        createPhase.value = 'starting'
        await containerStore.refreshContainers()

        createPhase.value = 'done'
        isCreating.value = false

        window.api.logger.info('[LabCreatorStore] 从 Compose 创建实验室成功', {
          projectName: composeProjectName.value,
          labId: result.lab?.labId,
          containerCount: composeResult.containerIds?.length || 0
        })

        return {
          success: true,
          lab: result.lab,
          containerIds: composeResult.containerIds
        }
      } catch (dockerError) {
        createError.value = dockerError instanceof Error ? dockerError.message : String(dockerError)
        createPhase.value = 'idle'
        isCreating.value = false

        // 清理已创建的实验室元数据
        if (result.lab?.labId) {
          try {
            await labApi.deleteLab(result.lab.labId, { force: true, deleteContainers: false })
            window.api.logger.info('[LabCreatorStore] 已清理失败的实验室', {
              labId: result.lab.labId
            })
          } catch (cleanupError) {
            window.api.logger.warn('[LabCreatorStore] 清理实验室失败', {
              labId: result.lab.labId,
              error:
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            })
          }
        }

        notify.error('Compose 创建失败', createError.value, {
          source: 'lab',
          dedupeKey: 'lab:creator'
        })
        window.api.logger.error('[LabCreatorStore] Docker Compose API 调用失败', {
          error: createError.value
        })
        return {
          success: false,
          lab: result.lab,
          error: `Docker API 调用失败: ${createError.value}`,
          composeError: createError.value
        }
      }
    } catch (error) {
      createError.value = error instanceof Error ? error.message : String(error)
      createPhase.value = 'idle'
      isCreating.value = false
      notify.error('Compose 创建失败', createError.value, {
        source: 'lab',
        dedupeKey: 'lab:creator'
      })
      window.api.logger.error('[LabCreatorStore] 从 Compose 创建实验室失败', {
        error: createError.value
      })
      return {
        success: false,
        error: createError.value,
        composeError: createError.value
      }
    } finally {
      // 延迟重置状态，确保 UI 有时间显示完成状态
      setTimeout(() => {
        if (createPhase.value === 'done') {
          createPhase.value = 'idle'
          isCreating.value = false
        }
      }, 1000)
    }
  }

  /**
   * 从 Dockerfile 创建实验室
   */
  async function createFromDockerfile(): Promise<
    (CreateLabResult & { dockerError?: string }) | null
  > {
    const labStore = useLabStore()

    // 重置状态
    isCreating.value = true
    createError.value = null
    createPhase.value = 'metadata'

    try {
      window.api.logger.info('[LabCreatorStore] 开始从 Dockerfile 创建实验室', {
        context: dockerfileContext.value,
        dockerfileConfigId: selectedDockerfileId.value
      })

      const request: CreateLabRequest = {
        name: dockerfileProjectName.value.trim() || '创建 Dockerfile 实验室',
        creationType: 'dockerfile' as LabCreationType,
        dockerfileConfigId: selectedDockerfileId.value || undefined,
        context: dockerfileContext.value || undefined
      }

      const result = await labStore.createLab(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建实验室元数据失败'
        createError.value = errorMsg
        createPhase.value = 'idle'
        isCreating.value = false
        notify.error('创建实验室失败', errorMsg, { source: 'lab', dedupeKey: 'lab:creator' })
        window.api.logger.error('[LabCreatorStore] 创建实验室元数据失败', {
          error: errorMsg
        })
        return {
          success: false,
          lab: result?.lab,
          error: errorMsg,
          dockerError: errorMsg
        }
      }

      createPhase.value = 'building'

      // 尝试调用 Docker 创建容器 API
      try {
        // 准备端口映射参数
        const portMappingsParam = portMappings.value.map((p) => ({
          hostPort: p.hostPort,
          containerPort: p.containerPort,
          protocol: p.protocol
        }))

        const dockerResult = await labApi.createFromDockerfile(
          dockerfileContent.value,
          dockerfileContext.value,
          result.lab?.labId,
          dockerfileProjectName.value.trim() || undefined,
          portMappingsParam.length > 0 ? portMappingsParam : undefined
        )

        // 检查 Docker 操作结果
        if (!dockerResult.success || dockerResult.error) {
          createError.value = dockerResult.error || 'Docker 构建失败'
          createPhase.value = 'idle'
          isCreating.value = false

          // 清理已创建的实验室元数据
          if (result.lab?.labId) {
            try {
              await labApi.deleteLab(result.lab.labId, { force: true, deleteContainers: false })
              window.api.logger.info('[LabCreatorStore] 已清理失败的实验室', {
                labId: result.lab.labId
              })
            } catch (cleanupError) {
              window.api.logger.warn('[LabCreatorStore] 清理实验室失败', {
                labId: result.lab.labId,
                error:
                  cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              })
            }
          }

          notify.error('Dockerfile 创建失败', createError.value, {
            source: 'lab',
            dedupeKey: 'lab:creator'
          })
          window.api.logger.error('[LabCreatorStore] Dockerfile 创建失败', {
            error: createError.value
          })
          return {
            success: false,
            lab: result.lab,
            error: `Docker 创建失败: ${createError.value}`,
            dockerError: createError.value
          }
        }

        const containerId = dockerResult.containerId || ''
        createPhase.value = 'starting'
        await containerStore.refreshContainers()

        createPhase.value = 'done'
        isCreating.value = false

        window.api.logger.info('[LabCreatorStore] 从 Dockerfile 创建实验室成功', {
          labId: result.lab?.labId,
          containerId: containerId.substring(0, 12)
        })

        return {
          success: true,
          lab: result.lab,
          containerIds: containerId ? [containerId] : []
        }
      } catch (dockerError) {
        createError.value = dockerError instanceof Error ? dockerError.message : String(dockerError)
        createPhase.value = 'idle'
        isCreating.value = false

        // 清理已创建的实验室元数据
        if (result.lab?.labId) {
          try {
            await labApi.deleteLab(result.lab.labId, { force: true, deleteContainers: false })
            window.api.logger.info('[LabCreatorStore] 已清理失败的实验室', {
              labId: result.lab.labId
            })
          } catch (cleanupError) {
            window.api.logger.warn('[LabCreatorStore] 清理实验室失败', {
              labId: result.lab.labId,
              error:
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            })
          }
        }

        notify.error('Dockerfile 创建失败', createError.value, {
          source: 'lab',
          dedupeKey: 'lab:creator'
        })
        window.api.logger.error('[LabCreatorStore] Dockerfile API 调用失败', {
          error: createError.value
        })
        return {
          success: false,
          lab: result.lab,
          error: `Docker API 调用失败: ${createError.value}`,
          dockerError: createError.value
        }
      }
    } catch (error) {
      createError.value = error instanceof Error ? error.message : String(error)
      createPhase.value = 'idle'
      isCreating.value = false
      notify.error('Dockerfile 创建失败', createError.value, {
        source: 'lab',
        dedupeKey: 'lab:creator'
      })
      window.api.logger.error('[LabCreatorStore] 从 Dockerfile 创建实验室失败', {
        error: createError.value
      })
      return {
        success: false,
        error: createError.value,
        dockerError: createError.value
      }
    } finally {
      // 延迟重置状态，确保 UI 有时间显示完成状态
      setTimeout(() => {
        if (createPhase.value === 'done') {
          createPhase.value = 'idle'
          isCreating.value = false
        }
      }, 1000)
    }
  }

  /**
   * 从已有容器创建实验室
   */
  async function createFromExisting(containerId: string): Promise<CreateLabResult | null> {
    const labStore = useLabStore()

    try {
      const container = containerStore.containers.find((c) => c.id === containerId)
      const containerName = container?.names[0]?.replace(/^\//, '') || containerId.substring(0, 12)

      const request: CreateLabRequest = {
        name: `${containerName}-实验室`,
        creationType: 'existing' as LabCreationType,
        existingContainerId: containerId
      }

      const result = await labStore.createLab(request)

      if (result?.success) {
        window.api.logger.info('[LabCreatorStore] 从已有容器创建实验室成功', {
          containerId: containerId.substring(0, 12)
        })
      } else if (result?.error) {
        notify.error('创建实验室失败', result.error, { source: 'lab' })
      }

      return result
    } catch (error) {
      notify.error('创建实验室失败', error instanceof Error ? error.message : String(error), {
        source: 'lab'
      })
      window.api.logger.error('[LabCreatorStore] 从已有容器创建实验室失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== Actions: 重置 ====================

  /**
   * 清除创建错误状态
   */
  function clearCreateError(): void {
    createError.value = null
    createPhase.value = 'idle'
  }

  function reset(): void {
    createType.value = 'compose'
    selectedContainerId.value = null
    containerFilter.value = 'all'
    containerSearchQuery.value = ''
    isCreating.value = false
    createError.value = null
    createPhase.value = 'idle'

    composeConfigStore.reset()
    dockerfileConfigStore.reset()
    portMappingStore.reset()
  }

  return {
    // State: 创建类型与容器选择
    createType,
    selectedContainerId,
    containerFilter,
    containerSearchQuery,

    // State: Compose 配置 (From Sub-store)
    composeContent,
    composeProjectName,
    selectedComposeId,

    // State: Dockerfile 配置 (From Sub-store)
    dockerfileContent,
    dockerfileContext,
    dockerfileProjectName,
    selectedDockerfileId,

    // State: 端口映射 (From Sub-store)
    portMappings,

    // State: 配置生成器 (From Sub-store)
    showGenerator: computed({
      get: () => composeConfigStore.showGenerator,
      set: (val) => (composeConfigStore.showGenerator = val)
    }),
    generatorForm,

    // State: 保存对话框
    showSaveDialog,
    saveDialogType,
    saveConfigName,

    // State: 创建状态跟踪
    isCreating,
    createError,
    createPhase,

    // Getters
    filteredContainers,
    runningCount,
    stoppedCount,
    canCreate,

    // Actions: 容器选择
    selectContainer,
    resetContainerSelector,

    // Actions: 端口映射 (Delegated to Sub-store)
    updatePortMapping: portMappingStore.updatePortMapping,
    addPortMapping: portMappingStore.addPortMapping,
    removePortMapping: portMappingStore.removePortMapping,
    refreshPorts: () => {
      if (createType.value === 'dockerfile') {
        portMappingStore.portMappings = portMappingStore.parseDockerfilePorts(
          dockerfileContent.value
        )
      } else if (createType.value === 'compose') {
        portMappingStore.portMappings = portMappingStore.parseComposePorts(composeContent.value)
      }
    },

    // Actions: 配置生成器 (Delegated to Sub-store)
    resetGeneratorForm: composeConfigStore.resetGeneratorForm,
    onSavedDockerfileSelect,
    clearSavedDockerfile,
    generateServiceConfig: composeConfigStore.generateServiceConfig,
    insertServiceConfig: composeConfigStore.insertServiceConfig,

    // Actions: 保存配置
    openSaveDialog,
    closeSaveDialog,
    handleSaveConfig,

    // Actions: 加载已保存配置
    loadSelectedDockerfile,
    loadSelectedCompose,

    // Actions: 创建实验室
    createFromCompose,
    createFromDockerfile,
    createFromExisting,

    // Actions: 重置
    reset,
    clearCreateError,

    // Helper (From Sub-store)
    getComposeTemplate: (type: ComposeTemplateType) => composeConfigStore.composeTemplates[type],
    composeTemplates: composeConfigStore.composeTemplates
  }
})
