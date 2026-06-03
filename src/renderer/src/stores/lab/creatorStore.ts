import { create } from 'zustand'
import type {
  ComposeOptions,
  ContainerInfo,
  CreateLabRequest,
  CreateLabResult,
  LabCreationType,
  ComposeDockerfileConfig
} from '@renderer/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { useContainerStore } from './containerStore'
import { useDockerConfigStore } from './configStore'
import { useLabStore } from './labStore'
import { useUIStateStore, type LabDetailTab } from '../uiStateStore'
import { usePortMappingStore } from './portMappingStore'
import { useComposeConfigStore } from './composeConfigStore'
import { useDockerfileConfigStore } from './dockerfileConfigStore'
import { labApi } from '@renderer/services/labApi'
import type {
  GeneratorForm,
  LabCreateType,
  CreatePhase,
  ComposeTemplateType,
  PortMapping
} from './types'

// ==================== 类型定义 ====================

interface SshConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password: string
  keyContent: string
  keyName: string
}

interface CreatorState {
  // 创建类型与容器选择
  createType: LabCreateType
  selectedContainerId: string | null
  containerFilter: 'all' | 'running' | 'stopped'
  containerSearchQuery: string

  // 保存对话框
  showSaveDialog: boolean
  saveDialogType: 'dockerfile' | 'compose'
  saveConfigName: string

  // SSH 创建配置
  sshConfig: SshConfig

  // 创建状态跟踪
  isCreating: boolean
  createError: string | null
  createPhase: CreatePhase

  // ==================== Actions ====================

  // 创建类型
  setCreateType: (type: LabCreateType) => void

  // 容器选择
  selectContainer: (containerId: string) => void
  resetContainerSelector: () => void
  setContainerFilter: (filter: 'all' | 'running' | 'stopped') => void
  setContainerSearchQuery: (query: string) => void

  // SSH 配置
  resetSshConfig: () => void
  updateSshConfig: (partial: Partial<SshConfig>) => void

  // Compose / Dockerfile 内容设置（带自动端口解析）
  setDockerfileContent: (content: string) => void
  setDockerfileContext: (context: string) => void
  setDockerfileProjectName: (name: string) => void
  setSelectedDockerfileId: (id: string | null) => void
  setComposeContent: (content: string) => void
  setComposeProjectName: (name: string) => void
  setSelectedComposeId: (id: string | null) => void
  setShowGenerator: (show: boolean) => void
  setGeneratorForm: (form: GeneratorForm) => void
  updateGeneratorForm: (partial: Partial<GeneratorForm>) => void

  // 配置生成器
  onSavedDockerfileSelect: () => Promise<void>
  clearSavedDockerfile: () => void

  // 保存配置
  openSaveDialog: (type: 'dockerfile' | 'compose') => void
  closeSaveDialog: () => void
  handleSaveConfig: () => Promise<void>

  // 加载已保存配置
  loadSelectedDockerfile: () => Promise<void>
  loadSelectedCompose: () => Promise<void>

  // 创建实验室
  createFromCompose: (
    options?: ComposeOptions
  ) => Promise<(CreateLabResult & { composeError?: string }) | null>
  createFromDockerfile: () => Promise<(CreateLabResult & { dockerError?: string }) | null>
  createFromExisting: (containerId: string) => Promise<CreateLabResult | null>
  handleCreate: () => Promise<boolean>

  // 重置
  reset: () => void
  clearCreateError: () => void

  // ==================== Getters（以函数形式暴露） ====================

  getFilteredContainers: () => ContainerInfo[]
  getRunningCount: () => number
  getStoppedCount: () => number
  getCanCreate: () => boolean
  getContainerSelectHint: () => string
  getCreatePhaseText: () => string
  getCreateProgress: () => number

  // 端口映射委托
  updatePortMapping: (index: number, mapping: Partial<PortMapping>) => void
  addPortMapping: () => void
  removePortMapping: (index: number) => void
  refreshPorts: () => void

  // 配置生成器委托
  resetGeneratorForm: () => void
  generateServiceConfig: () => string
  insertServiceConfig: () => void

  // 模板委托
  getComposeTemplate: (type: ComposeTemplateType) => string
}

const defaultSshConfig: SshConfig = {
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  keyContent: '',
  keyName: ''
}

export const useLabCreatorStore = create<CreatorState>()((set, get) => ({
  // ==================== 初始状态 ====================

  createType: 'compose',
  selectedContainerId: null,
  containerFilter: 'all',
  containerSearchQuery: '',

  showSaveDialog: false,
  saveDialogType: 'compose',
  saveConfigName: '',

  sshConfig: { ...defaultSshConfig },

  isCreating: false,
  createError: null,
  createPhase: 'idle',

  // ==================== 创建类型 ====================

  setCreateType: (type) => {
    set({ createType: type })

    // 切换创建类型时自动解析/重置端口
    if (type === 'dockerfile') {
      const content = useDockerfileConfigStore.getState().dockerfileContent
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseDockerfilePorts(content)
      })
    } else if (type === 'compose') {
      const content = useComposeConfigStore.getState().composeContent
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseComposePorts(content)
      })
    } else {
      usePortMappingStore.setState({ portMappings: [] })
    }
  },

  // ==================== 容器选择 ====================

  selectContainer: (containerId) => {
    set((state) => ({
      selectedContainerId: state.selectedContainerId === containerId ? null : containerId
    }))
  },

  resetContainerSelector: () => {
    set({ containerSearchQuery: '', containerFilter: 'all', selectedContainerId: null })
  },

  setContainerFilter: (filter) => set({ containerFilter: filter }),
  setContainerSearchQuery: (query) => set({ containerSearchQuery: query }),

  // ==================== SSH 配置 ====================

  resetSshConfig: () => set({ sshConfig: { ...defaultSshConfig } }),

  updateSshConfig: (partial) => set((state) => ({ sshConfig: { ...state.sshConfig, ...partial } })),

  // ==================== Dockerfile 内容设置（带自动端口解析） ====================

  setDockerfileContent: (content) => {
    useDockerfileConfigStore.setState({ dockerfileContent: content })

    // 自动解析端口
    if (get().createType === 'dockerfile' && content) {
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseDockerfilePorts(content)
      })
    }
  },

  setDockerfileContext: (context) => {
    useDockerfileConfigStore.setState({ dockerfileContext: context })
  },

  setDockerfileProjectName: (name) => {
    useDockerfileConfigStore.setState({ dockerfileProjectName: name })
  },

  setSelectedDockerfileId: (id) => {
    useDockerfileConfigStore.setState({ selectedDockerfileId: id })
  },

  // ==================== Compose 内容设置（带自动端口解析） ====================

  setComposeContent: (content) => {
    useComposeConfigStore.setState({ composeContent: content })

    // 自动解析端口
    if (get().createType === 'compose' && content) {
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseComposePorts(content)
      })
    }
  },

  setComposeProjectName: (name) => {
    useComposeConfigStore.setState({ composeProjectName: name })
  },

  setSelectedComposeId: (id) => {
    useComposeConfigStore.setState({ selectedComposeId: id })
  },

  setShowGenerator: (show) => {
    useComposeConfigStore.setState({ showGenerator: show })
  },

  setGeneratorForm: (form) => {
    useComposeConfigStore.setState({ generatorForm: form })
  },

  updateGeneratorForm: (partial) => {
    const current = useComposeConfigStore.getState().generatorForm
    useComposeConfigStore.setState({ generatorForm: { ...current, ...partial } })
  },

  // ==================== 配置生成器 ====================

  onSavedDockerfileSelect: async () => {
    const form = useComposeConfigStore.getState().generatorForm
    if (!form.savedDockerfileId) {
      useComposeConfigStore.setState({
        generatorForm: {
          ...useComposeConfigStore.getState().generatorForm,
          useSavedDockerfile: false
        }
      })
      return
    }

    useComposeConfigStore.setState({
      generatorForm: { ...useComposeConfigStore.getState().generatorForm, useSavedDockerfile: true }
    })

    const { loadDockerfileConfig } = useDockerConfigStore.getState()
    const config = await loadDockerfileConfig(form.savedDockerfileId)
    if (config) {
      useComposeConfigStore.setState({
        generatorForm: {
          ...useComposeConfigStore.getState().generatorForm,
          context: `./${config.name}`,
          dockerfile: config.filename
        }
      })
    }
  },

  clearSavedDockerfile: () => {
    useComposeConfigStore.setState({
      generatorForm: {
        ...useComposeConfigStore.getState().generatorForm,
        savedDockerfileId: null,
        useSavedDockerfile: false,
        context: './app',
        dockerfile: 'Dockerfile'
      }
    })
  },

  // ==================== 保存配置 ====================

  openSaveDialog: (type) => {
    set({ saveDialogType: type, saveConfigName: '', showSaveDialog: true })
  },

  closeSaveDialog: () => {
    set({ showSaveDialog: false, saveConfigName: '' })
  },

  handleSaveConfig: async () => {
    const { saveConfigName, saveDialogType } = get()
    if (!saveConfigName.trim()) return

    const { saveDockerfileConfig, saveComposeConfig } = useDockerConfigStore.getState()

    if (saveDialogType === 'dockerfile') {
      const content = useDockerfileConfigStore.getState().dockerfileContent
      await saveDockerfileConfig({
        name: saveConfigName.trim(),
        content
      })
    } else {
      const content = useComposeConfigStore.getState().composeContent
      await saveComposeConfig({
        name: saveConfigName.trim(),
        content
      })
    }

    set({ showSaveDialog: false })
    notifySuccess('保存成功', `配置「${saveConfigName.trim()}」保存成功`, { source: 'creator' })
  },

  // ==================== 加载已保存配置 ====================

  loadSelectedDockerfile: async () => {
    const selectedId = useDockerfileConfigStore.getState().selectedDockerfileId
    if (!selectedId) return
    const { loadDockerfileConfig } = useDockerConfigStore.getState()
    const config = await loadDockerfileConfig(selectedId)
    if (config) {
      useDockerfileConfigStore.setState({ dockerfileContent: config.content })
      // 触发端口解析
      get().setDockerfileContent(config.content)
    }
  },

  loadSelectedCompose: async () => {
    const selectedId = useComposeConfigStore.getState().selectedComposeId
    if (!selectedId) return
    const { loadComposeConfig } = useDockerConfigStore.getState()
    const config = await loadComposeConfig(selectedId)
    if (config) {
      useComposeConfigStore.setState({
        composeContent: config.content,
        composeProjectName: config.name
      })
      // 触发端口解析
      get().setComposeContent(config.content)
    }
  },

  // ==================== 创建实验室：从 Compose ====================

  createFromCompose: async (options) => {
    const labStore = useLabStore.getState()

    set({ isCreating: true, createError: null, createPhase: 'metadata' })

    const composeContent = useComposeConfigStore.getState().composeContent
    const composeProjectName = useComposeConfigStore.getState().composeProjectName
    const selectedComposeId = useComposeConfigStore.getState().selectedComposeId
    const generatorForm = useComposeConfigStore.getState().generatorForm

    try {
      window.api.logger.info('[LabCreatorStore] 开始从 Compose 创建实验室', {
        projectName: options?.projectName || composeProjectName,
        composeConfigId: selectedComposeId
      })

      const request: CreateLabRequest = {
        name: composeProjectName.trim() || '创建 Compose 实验室',
        creationType: 'compose' as LabCreationType,
        composeConfigId: selectedComposeId || undefined,
        projectName: options?.projectName || composeProjectName
      }

      const result = await labStore.createLab(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建实验室元数据失败'
        set({ createError: errorMsg, createPhase: 'idle', isCreating: false })
        notifyError('创建实验室失败', errorMsg, { source: 'lab', dedupeKey: 'lab:creator' })
        window.api.logger.error('[LabCreatorStore] 创建实验室元数据失败', { error: errorMsg })
        return {
          success: false,
          lab: result?.lab,
          error: errorMsg,
          composeError: errorMsg
        }
      }

      set({ createPhase: 'building' })

      // 准备 Dockerfile 配置列表（用于 compose 中的 build 指令）
      const dockerfiles: ComposeDockerfileConfig[] = []
      if (generatorForm.useSavedDockerfile && generatorForm.savedDockerfileId) {
        dockerfiles.push({
          dockerfileId: generatorForm.savedDockerfileId,
          targetContext: generatorForm.context,
          targetFilename: generatorForm.dockerfile
        })
      }

      // 尝试调用 Docker 创建容器 API
      try {
        const composeResult = await labApi.createFromCompose(
          composeContent,
          {
            ...options,
            dockerfiles: dockerfiles.length > 0 ? dockerfiles : undefined
          },
          result.lab?.labId,
          composeProjectName.trim() || undefined
        )

        if (!composeResult.success) {
          const errorMsg = composeResult.error || 'Docker Compose 创建失败'
          set({ createError: errorMsg, createPhase: 'idle', isCreating: false })

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
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              })
            }
          }

          notifyError('Compose 创建失败', errorMsg, {
            source: 'lab',
            dedupeKey: 'lab:creator'
          })
          window.api.logger.error('[LabCreatorStore] Docker Compose 创建失败', {
            error: errorMsg
          })
          return {
            success: false,
            lab: result.lab,
            error: `Docker 创建失败: ${errorMsg}`,
            composeError: errorMsg
          }
        }

        set({ createPhase: 'starting' })
        await useContainerStore.getState().refreshContainers()

        set({ createPhase: 'done', isCreating: false })

        window.api.logger.info('[LabCreatorStore] 从 Compose 创建实验室成功', {
          projectName: composeProjectName,
          labId: result.lab?.labId,
          containerCount: composeResult.containerIds?.length || 0
        })

        return {
          success: true,
          lab: result.lab,
          containerIds: composeResult.containerIds
        }
      } catch (dockerError) {
        const errorMsg = dockerError instanceof Error ? dockerError.message : String(dockerError)
        set({ createError: errorMsg, createPhase: 'idle', isCreating: false })

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
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            })
          }
        }

        notifyError('Compose 创建失败', errorMsg, {
          source: 'lab',
          dedupeKey: 'lab:creator'
        })
        window.api.logger.error('[LabCreatorStore] Docker Compose API 调用失败', {
          error: errorMsg
        })
        return {
          success: false,
          lab: result.lab,
          error: `Docker API 调用失败: ${errorMsg}`,
          composeError: errorMsg
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      set({ createError: errorMsg, createPhase: 'idle', isCreating: false })
      notifyError('Compose 创建失败', errorMsg, {
        source: 'lab',
        dedupeKey: 'lab:creator'
      })
      window.api.logger.error('[LabCreatorStore] 从 Compose 创建实验室失败', {
        error: errorMsg
      })
      return {
        success: false,
        error: errorMsg,
        composeError: errorMsg
      }
    } finally {
      // 延迟重置状态，确保 UI 有时间显示完成状态
      setTimeout(() => {
        if (get().createPhase === 'done') {
          set({ createPhase: 'idle', isCreating: false })
        }
      }, 1000)
    }
  },

  // ==================== 创建实验室：从 Dockerfile ====================

  createFromDockerfile: async () => {
    const labStore = useLabStore.getState()

    set({ isCreating: true, createError: null, createPhase: 'metadata' })

    const dockerfileContent = useDockerfileConfigStore.getState().dockerfileContent
    const dockerfileContext = useDockerfileConfigStore.getState().dockerfileContext
    const dockerfileProjectName = useDockerfileConfigStore.getState().dockerfileProjectName
    const selectedDockerfileId = useDockerfileConfigStore.getState().selectedDockerfileId
    const portMappings = usePortMappingStore.getState().portMappings

    try {
      window.api.logger.info('[LabCreatorStore] 开始从 Dockerfile 创建实验室', {
        context: dockerfileContext,
        dockerfileConfigId: selectedDockerfileId
      })

      const request: CreateLabRequest = {
        name: dockerfileProjectName.trim() || '创建 Dockerfile 实验室',
        creationType: 'dockerfile' as LabCreationType,
        dockerfileConfigId: selectedDockerfileId || undefined,
        context: dockerfileContext || undefined
      }

      const result = await labStore.createLab(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建实验室元数据失败'
        set({ createError: errorMsg, createPhase: 'idle', isCreating: false })
        notifyError('创建实验室失败', errorMsg, { source: 'lab', dedupeKey: 'lab:creator' })
        window.api.logger.error('[LabCreatorStore] 创建实验室元数据失败', { error: errorMsg })
        return {
          success: false,
          lab: result?.lab,
          error: errorMsg,
          dockerError: errorMsg
        }
      }

      set({ createPhase: 'building' })

      // 尝试调用 Docker 创建容器 API
      try {
        // 准备端口映射参数
        const portMappingsParam = portMappings.map((p) => ({
          hostPort: p.hostPort,
          containerPort: p.containerPort,
          protocol: p.protocol
        }))

        const dockerResult = await labApi.createFromDockerfile(
          dockerfileContent,
          dockerfileContext,
          result.lab?.labId,
          dockerfileProjectName.trim() || undefined,
          portMappingsParam.length > 0 ? portMappingsParam : undefined
        )

        // 检查 Docker 操作结果
        if (!dockerResult.success || dockerResult.error) {
          const errorMsg = dockerResult.error || 'Docker 构建失败'
          set({ createError: errorMsg, createPhase: 'idle', isCreating: false })

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
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              })
            }
          }

          notifyError('Dockerfile 创建失败', errorMsg, {
            source: 'lab',
            dedupeKey: 'lab:creator'
          })
          window.api.logger.error('[LabCreatorStore] Dockerfile 创建失败', { error: errorMsg })
          return {
            success: false,
            lab: result.lab,
            error: `Docker 创建失败: ${errorMsg}`,
            dockerError: errorMsg
          }
        }

        const containerId = dockerResult.containerId || ''
        set({ createPhase: 'starting' })
        await useContainerStore.getState().refreshContainers()

        set({ createPhase: 'done', isCreating: false })

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
        const errorMsg = dockerError instanceof Error ? dockerError.message : String(dockerError)
        set({ createError: errorMsg, createPhase: 'idle', isCreating: false })

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
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            })
          }
        }

        notifyError('Dockerfile 创建失败', errorMsg, {
          source: 'lab',
          dedupeKey: 'lab:creator'
        })
        window.api.logger.error('[LabCreatorStore] Dockerfile API 调用失败', { error: errorMsg })
        return {
          success: false,
          lab: result.lab,
          error: `Docker API 调用失败: ${errorMsg}`,
          dockerError: errorMsg
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      set({ createError: errorMsg, createPhase: 'idle', isCreating: false })
      notifyError('Dockerfile 创建失败', errorMsg, {
        source: 'lab',
        dedupeKey: 'lab:creator'
      })
      window.api.logger.error('[LabCreatorStore] 从 Dockerfile 创建实验室失败', {
        error: errorMsg
      })
      return {
        success: false,
        error: errorMsg,
        dockerError: errorMsg
      }
    } finally {
      // 延迟重置状态，确保 UI 有时间显示完成状态
      setTimeout(() => {
        if (get().createPhase === 'done') {
          set({ createPhase: 'idle', isCreating: false })
        }
      }, 1000)
    }
  },

  // ==================== 创建实验室：从已有容器 ====================

  createFromExisting: async (containerId) => {
    const labStore = useLabStore.getState()
    const containerStore = useContainerStore.getState()

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
        notifyError('创建实验室失败', result.error, { source: 'lab' })
      }

      return result
    } catch (error) {
      notifyError('创建实验室失败', error instanceof Error ? error.message : String(error), {
        source: 'lab'
      })
      window.api.logger.error('[LabCreatorStore] 从已有容器创建实验室失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  },

  // ==================== 统一创建入口 ====================

  handleCreate: async () => {
    const labStore = useLabStore.getState()
    const uiStateStore = useUIStateStore.getState()
    const { createType, selectedContainerId, sshConfig } = get()

    const completeSuccess = async (
      labId: string | undefined,
      tab: LabDetailTab = 'stats',
      options: { silentLoad?: boolean } = {}
    ): Promise<boolean> => {
      if (labId) {
        try {
          await labStore.loadLab(labId, true, { silent: options.silentLoad ?? false })
          uiStateStore.setLastLabId(labId)
        } catch (error) {
          window.api.logger.warn('[LabCreatorStore] 创建成功后加载实验室失败，仍将关闭创建窗口', {
            labId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      uiStateStore.setLabDetailTab(tab)
      uiStateStore.closeLabCreator()
      get().reset()
      return true
    }

    switch (createType) {
      case 'compose': {
        const composeProjectName = useComposeConfigStore.getState().composeProjectName
        const result = await get().createFromCompose({
          projectName: composeProjectName || undefined
        })

        if (result?.success && result.lab?.labId) {
          return completeSuccess(result.lab.labId, 'stats')
        }
        return false
      }
      case 'dockerfile': {
        const result = await get().createFromDockerfile()
        if (result?.success && result.lab?.labId) {
          return completeSuccess(result.lab.labId, 'stats')
        }
        return false
      }
      case 'existing': {
        if (!selectedContainerId) return false

        const result = await get().createFromExisting(selectedContainerId)
        if (result?.success) {
          await useContainerStore.getState().loadContainerDetails(selectedContainerId)
          return completeSuccess(result.lab?.labId, 'stats')
        }
        return false
      }
      case 'ssh': {
        const labResult = await labStore.createLab({
          name: `${sshConfig.username}@${sshConfig.host}`,
          creationType: 'ssh',
          backendType: 'ssh',
          sshHost: sshConfig.host,
          sshPort: sshConfig.port,
          sshUsername: sshConfig.username,
          sshAuthType: sshConfig.authType,
          sshPassword: sshConfig.authType === 'password' ? sshConfig.password : undefined,
          sshKeyName: sshConfig.authType === 'key' ? sshConfig.keyName : undefined
        })

        if (!labResult?.success || !labResult.lab?.labId) return false

        const connected = await labStore.connectSsh(labResult.lab.labId, {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          authType: sshConfig.authType,
          password: sshConfig.authType === 'password' ? sshConfig.password : undefined,
          keyName: sshConfig.authType === 'key' ? sshConfig.keyName : undefined,
          keyContent: sshConfig.authType === 'key' ? sshConfig.keyContent : undefined
        })

        if (connected) {
          notifySuccess('SSH 实验室已创建', `已连接到 ${sshConfig.host}`, { source: 'lab' })
        }

        return completeSuccess(labResult.lab.labId, connected ? 'terminal' : 'stats', {
          silentLoad: true
        })
      }
      default:
        return false
    }
  },

  // ==================== 重置 ====================

  reset: () => {
    set({
      createType: 'compose',
      selectedContainerId: null,
      containerFilter: 'all',
      containerSearchQuery: '',
      isCreating: false,
      createError: null,
      createPhase: 'idle',
      sshConfig: { ...defaultSshConfig }
    })

    useComposeConfigStore.getState().reset()
    useDockerfileConfigStore.getState().reset()
    usePortMappingStore.getState().reset()
  },

  clearCreateError: () => set({ createError: null, createPhase: 'idle' }),

  // ==================== Getters ====================

  getFilteredContainers: () => {
    const { containerFilter, containerSearchQuery } = get()
    const containers = useContainerStore.getState().containers

    let result = containers

    if (containerFilter !== 'all') {
      if (containerFilter === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (containerFilter === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      }
    }

    if (containerSearchQuery.trim()) {
      const query = containerSearchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(query)) ||
          c.image.toLowerCase().includes(query)
      )
    }

    return result
  },

  getRunningCount: () => {
    return useContainerStore.getState().containers.filter((c) => c.state === 'running').length
  },

  getStoppedCount: () => {
    return useContainerStore
      .getState()
      .containers.filter((c) => c.state === 'exited' || c.state === 'dead').length
  },

  getCanCreate: () => {
    const { createType, selectedContainerId, sshConfig } = get()
    const compose = useComposeConfigStore.getState()
    const dockerfile = useDockerfileConfigStore.getState()

    switch (createType) {
      case 'compose':
        return (
          compose.composeContent.trim().length > 0 && compose.composeProjectName.trim().length > 0
        )
      case 'dockerfile':
        return (
          dockerfile.dockerfileContent.trim().length > 0 &&
          dockerfile.dockerfileProjectName.trim().length > 0
        )
      case 'existing':
        return selectedContainerId !== null
      case 'ssh': {
        const hasCredentials =
          sshConfig.authType === 'password'
            ? sshConfig.password.trim().length > 0
            : sshConfig.keyContent.trim().length > 0 && sshConfig.keyName.trim().length > 0
        return (
          sshConfig.host.trim().length > 0 && sshConfig.username.trim().length > 0 && hasCredentials
        )
      }
      default:
        return false
    }
  },

  getContainerSelectHint: () => {
    const { createType, selectedContainerId } = get()
    if (createType !== 'existing') return ''

    const containers = useContainerStore.getState().containers
    const selected = containers.find((container) => container.id === selectedContainerId)
    if (!selected || selected.state === 'running') return ''

    return '只有运行中的容器才能选择使用，请先启动容器'
  },

  getCreatePhaseText: () => {
    switch (get().createPhase) {
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
  },

  getCreateProgress: () => {
    switch (get().createPhase) {
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
  },

  // ==================== 端口映射委托 ====================

  updatePortMapping: (index, mapping) =>
    usePortMappingStore.getState().updatePortMapping(index, mapping),
  addPortMapping: () => usePortMappingStore.getState().addPortMapping(),
  removePortMapping: (index) => usePortMappingStore.getState().removePortMapping(index),

  refreshPorts: () => {
    const { createType } = get()
    if (createType === 'dockerfile') {
      const content = useDockerfileConfigStore.getState().dockerfileContent
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseDockerfilePorts(content)
      })
    } else if (createType === 'compose') {
      const content = useComposeConfigStore.getState().composeContent
      usePortMappingStore.setState({
        portMappings: usePortMappingStore.getState().parseComposePorts(content)
      })
    }
  },

  // ==================== 配置生成器委托 ====================

  resetGeneratorForm: () => useComposeConfigStore.getState().resetGeneratorForm(),
  generateServiceConfig: () => useComposeConfigStore.getState().generateServiceConfig(),
  insertServiceConfig: () => useComposeConfigStore.getState().insertServiceConfig(),

  // ==================== 模板委托 ====================

  getComposeTemplate: (type) => useComposeConfigStore.getState().composeTemplates[type]
}))
