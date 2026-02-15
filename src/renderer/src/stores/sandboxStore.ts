import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  SandboxData,
  SandboxListItem,
  SandboxLogEntry,
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ContainerFilter,
  ContainerState,
  SandboxTemplate,
  TerminalLog,
  ExecCommand,
  ComposeOptions,
  ComposeResult,
  SandboxSelection,
  LogOptions,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest
} from '@shared/types/sandbox'

const DEFAULT_NEW_SANDBOX_NAME = '新沙箱'

export const useSandboxStore = defineStore('sandbox', () => {
  // ==================== State: 基础沙箱 ====================

  const currentSandbox = ref<SandboxData | null>(null)
  const sandboxList = ref<SandboxListItem[]>([])
  const operationLogs = ref<SandboxLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)

  // ==================== State: Docker 容器 ====================

  /** Docker 容器列表 */
  const containers = ref<ContainerInfo[]>([])
  /** 选中的容器详情 */
  const selectedContainer = ref<ContainerDetails | null>(null)
  /** 容器资源统计 */
  const containerStats = ref<ContainerStats | null>(null)
  /** 容器过滤条件 */
  const containerFilter = ref<ContainerFilter>({ state: 'all' })
  /** 容器搜索关键词 */
  const containerSearchQuery = ref('')

  // ==================== State: 模板 ====================

  /** 沙箱模板列表 */
  const templates = ref<SandboxTemplate[]>([])
  /** 模板加载状态 */
  const templatesLoading = ref(false)

  // ==================== State: 终端 ====================

  /** 终端日志 */
  const terminalLogs = ref<TerminalLog[]>([])

  // ==================== State: 会话关联 ====================

  /** 当前会话的沙箱选择 */
  const currentSessionSandbox = ref<SandboxSelection | null>(null)

  // ==================== State: Docker 配置管理 ====================

  /** Dockerfile 配置列表 */
  const dockerfileConfigs = ref<DockerfileConfigMeta[]>([])
  /** Compose 配置列表 */
  const composeConfigs = ref<ComposeConfigMeta[]>([])
  /** 配置加载状态 */
  const configsLoading = ref(false)

  // ==================== State: Sandbox Creator ====================

  /** 创建类型 */
  const creatorCreateType = ref<'compose' | 'dockerfile' | 'existing'>('compose')
  /** 选中的容器 ID (用于创建器) */
  const creatorSelectedContainerId = ref<string | null>(null)
  /** 容器过滤类型 (用于创建器) */
  const creatorContainerFilter = ref<'all' | 'running' | 'stopped'>('all')
  /** 容器搜索关键词 (用于创建器) */
  const creatorContainerSearchQuery = ref('')

  /** Compose 内容 */
  const creatorComposeContent = ref('')
  /** Compose 项目名称 */
  const creatorComposeProjectName = ref('')
  /** 选中的 Compose 配置 ID */
  const creatorSelectedComposeId = ref<string | null>(null)

  /** Dockerfile 内容 */
  const creatorDockerfileContent = ref('')
  /** Dockerfile 上下文路径 */
  const creatorDockerfileContext = ref('')
  /** 选中的 Dockerfile 配置 ID */
  const creatorSelectedDockerfileId = ref<string | null>(null)

  /** 构建配置生成器显示状态 */
  const creatorShowGenerator = ref(false)
  /** 构建配置生成器表单 */
  const creatorGeneratorForm = ref({
    serviceName: 'app',
    sourceType: 'build' as 'image' | 'build',
    image: 'node:18-alpine',
    useSavedDockerfile: false,
    savedDockerfileId: null as string | null,
    context: './app',
    dockerfile: 'Dockerfile',
    buildArgs: '',
    ports: '3000:3000',
    environment: 'NODE_ENV=development'
  })

  /** 保存配置对话框显示状态 */
  const creatorShowSaveDialog = ref(false)
  /** 保存配置对话框类型 */
  const creatorSaveDialogType = ref<'dockerfile' | 'compose'>('compose')
  /** 保存配置名称 */
  const creatorSaveConfigName = ref('')

  /** 成功提示显示状态 */
  const creatorShowSuccessToast = ref(false)
  /** 成功提示消息 */
  const creatorSuccessMessage = ref('')

  // ==================== Compose Templates ====================

  const composeTemplates = {
    image: `version: '3.8'

services:
  app:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
    command: sh -c "npm install && npm start"
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
`,
    build: `version: '3.8'

services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
`,
    mixed: `version: '3.8'

services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`
  } as const

  type ComposeTemplateType = keyof typeof composeTemplates

  // ==================== Helper Functions ====================

  function getStateLabel(state: ContainerState): string {
    const labels: Record<ContainerState, string> = {
      created: '已创建',
      running: '运行中',
      paused: '已暂停',
      restarting: '重启中',
      removing: '删除中',
      exited: '已停止',
      dead: '已终止'
    }
    return labels[state] || state
  }

  function getStateClass(state: ContainerState): string {
    return `state-${state}`
  }

  function formatCreated(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  function getComposeTemplate(type: ComposeTemplateType): string {
    return composeTemplates[type]
  }

  // ==================== Getters: 基础沙箱 ====================

  const currentSandboxId = computed(() => currentSandbox.value?.sandboxId)
  const sandboxCount = computed(() => sandboxList.value.length)

  // ==================== Getters: 容器过滤 ====================

  /** 过滤后的容器列表 */
  const filteredContainers = computed(() => {
    let result = containers.value

    // 状态过滤
    if (containerFilter.value.state && containerFilter.value.state !== 'all') {
      if (containerFilter.value.state === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (containerFilter.value.state === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      } else {
        result = result.filter((c) => c.state === containerFilter.value.state)
      }
    }

    // 名称搜索
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

  /** 运行中的容器数量 */
  const runningContainerCount = computed(
    () => containers.value.filter((c) => c.state === 'running').length
  )

  // ==================== Actions: 基础沙箱 ====================

  async function loadSandboxList(): Promise<void> {
    try {
      isLoading.value = true
      sandboxList.value = await window.api.sandbox.listSandboxs()

      window.api.logger.info('[SandboxStore] 沙箱列表加载完成', {
        count: sandboxList.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载沙箱列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      isLoading.value = false
    }
  }

  async function refreshSandboxList(): Promise<void> {
    await loadSandboxList()
    listUpdateKey.value++
  }

  async function loadSandbox(sandboxId: string): Promise<boolean> {
    if (currentSandbox.value?.sandboxId === sandboxId) {
      return true
    }

    try {
      isLoading.value = true

      const sandbox = await window.api.sandbox.loadSandbox(sandboxId)
      if (sandbox) {
        currentSandbox.value = sandbox
        await loadOperationLogs(sandboxId)

        window.api.logger.info('[SandboxStore] 沙箱加载成功', {
          sandboxId,
          name: sandbox.name
        })

        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function loadOperationLogs(sandboxId: string): Promise<void> {
    try {
      operationLogs.value = await window.api.sandbox.readSandboxLog(sandboxId)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载操作日志失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      operationLogs.value = []
    }
  }

  async function createSandbox(name?: string): Promise<SandboxData | null> {
    try {
      const sandbox = await window.api.sandbox.createSandbox(name || DEFAULT_NEW_SANDBOX_NAME)

      currentSandbox.value = sandbox
      operationLogs.value = []

      await refreshSandboxList()

      window.api.logger.info('[SandboxStore] 创建沙箱成功', {
        sandboxId: sandbox.sandboxId,
        name: sandbox.name
      })

      return sandbox
    } catch (error) {
      window.api.logger.error('[SandboxStore] 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function saveCurrentSandbox(): Promise<boolean> {
    if (!currentSandbox.value) {
      return false
    }

    try {
      const result = await window.api.sandbox.saveSandbox(currentSandbox.value)

      if (result.success) {
        await refreshSandboxList()

        window.api.logger.debug('[SandboxStore] 保存沙箱成功', {
          sandboxId: currentSandbox.value.sandboxId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 保存沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  async function deleteSandbox(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.deleteSandbox(sandboxId)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value = null
          operationLogs.value = []
        }

        await refreshSandboxList()

        window.api.logger.info('[SandboxStore] 删除沙箱成功', { sandboxId })
        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 删除沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  async function renameSandbox(sandboxId: string, newName: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.renameSandbox(sandboxId, newName)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value.name = newName
        }

        await refreshSandboxList()
        await loadOperationLogs(sandboxId)

        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 重命名沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  // ==================== Actions: 容器浏览器 ====================

  /**
   * 加载 Docker 容器列表
   */
  async function loadContainers(): Promise<void> {
    try {
      isLoading.value = true
      containers.value = await window.api.sandbox.listContainers(containerFilter.value)

      window.api.logger.info('[SandboxStore] 容器列表加载完成', {
        count: containers.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载容器列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      containers.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新容器列表
   */
  async function refreshContainers(): Promise<void> {
    await loadContainers()
  }

  /**
   * 加载容器详情
   */
  async function loadContainerDetails(containerId: string): Promise<void> {
    try {
      selectedContainer.value = await window.api.sandbox.getContainerDetails(containerId)

      window.api.logger.info('[SandboxStore] 容器详情加载完成', {
        containerId: containerId.substring(0, 12)
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载容器详情失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      selectedContainer.value = null
    }
  }

  /**
   * 加载容器资源统计
   */
  async function loadContainerStats(containerId: string): Promise<void> {
    try {
      containerStats.value = await window.api.sandbox.getContainerStats(containerId)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载容器统计失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      containerStats.value = null
    }
  }

  /**
   * 设置容器过滤条件
   */
  function setContainerFilter(filter: ContainerFilter): void {
    containerFilter.value = filter
  }

  /**
   * 设置容器搜索关键词
   */
  function setContainerSearchQuery(query: string): void {
    containerSearchQuery.value = query
  }

  // ==================== Actions: 容器操作 ====================

  /**
   * 启动容器
   */
  async function startContainer(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.startContainer(containerId)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 容器启动成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 启动容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  /**
   * 停止容器
   */
  async function stopContainer(containerId: string, timeout?: number): Promise<boolean> {
    try {
      const result = await window.api.sandbox.stopContainer(containerId, timeout)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 容器停止成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 停止容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  /**
   * 重启容器
   */
  async function restartContainer(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.restartContainer(containerId)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 容器重启成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 重启容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  /**
   * 删除容器
   */
  async function removeContainer(containerId: string, force?: boolean): Promise<boolean> {
    try {
      const result = await window.api.sandbox.removeContainer(containerId, force)

      if (result.success) {
        await refreshContainers()
        // 如果删除的是当前选中的容器，清空选中状态
        if (selectedContainer.value?.id === containerId) {
          selectedContainer.value = null
        }
        window.api.logger.info('[SandboxStore] 容器删除成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 删除容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  // ==================== Actions: 命令执行 ====================

  /**
   * 在容器中执行命令
   */
  async function execCommand(
    containerId: string,
    command: ExecCommand
  ): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number } | null> {
    try {
      // 添加输入日志
      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: 'input',
        content: command.command
      })

      const result = await window.api.sandbox.execCommand(containerId, command)

      // 添加输出日志
      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: result.exitCode === 0 ? 'output' : 'error',
        content: result.stdout || result.stderr || '命令执行完成'
      })

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 执行命令失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        command: command.command
      })

      // 添加错误日志
      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        content: error instanceof Error ? error.message : String(error)
      })

      return null
    }
  }

  /**
   * 清空终端日志
   */
  function clearTerminalLogs(): void {
    terminalLogs.value = []
  }

  // ==================== Actions: 文件操作 ====================

  /**
   * 复制文件到容器
   */
  async function copyToContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.copyToContainer(containerId, source, target)

      if (result.success) {
        window.api.logger.info('[SandboxStore] 文件复制到容器成功', {
          containerId: containerId.substring(0, 12),
          source,
          target
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 复制文件到容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        source,
        target
      })
      return false
    }
  }

  /**
   * 从容器复制文件
   */
  async function copyFromContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.copyFromContainer(containerId, source, target)

      if (result.success) {
        window.api.logger.info('[SandboxStore] 文件从容器复制成功', {
          containerId: containerId.substring(0, 12),
          source,
          target
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从容器复制文件失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        source,
        target
      })
      return false
    }
  }

  // ==================== Actions: 日志 ====================

  /**
   * 获取容器日志
   */
  async function getContainerLogs(containerId: string, options?: LogOptions): Promise<string> {
    try {
      return await window.api.sandbox.getContainerLogs(containerId, options)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 获取容器日志失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return ''
    }
  }

  // ==================== Actions: 模板 ====================

  /**
   * 加载沙箱模板列表
   */
  async function loadTemplates(): Promise<void> {
    try {
      templatesLoading.value = true
      templates.value = await window.api.sandbox.listTemplates()

      window.api.logger.info('[SandboxStore] 模板列表加载完成', {
        count: templates.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      templates.value = []
    } finally {
      templatesLoading.value = false
    }
  }

  /**
   * 从模板创建沙箱
   */
  async function createFromTemplate(
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromTemplate(templateId, variables)

      if (!result.error) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 从模板创建沙箱成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从模板创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        templateId
      })
      return null
    }
  }

  // ==================== Actions: 沙箱创建 ====================

  /**
   * 从 docker-compose 创建沙箱
   */
  async function createFromCompose(
    content: string,
    options?: ComposeOptions
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromCompose(content, options)

      if (!result.error) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Compose 创建沙箱成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Compose 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * 从 Dockerfile 创建沙箱
   */
  async function createFromDockerfile(dockerfile: string, context: string): Promise<string | null> {
    try {
      const containerId = await window.api.sandbox.createFromDockerfile(dockerfile, context)

      if (containerId) {
        await refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Dockerfile 创建沙箱成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return containerId
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Dockerfile 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== Actions: 会话关联 ====================

  /**
   * 为会话选择沙箱
   */
  async function selectSandboxForSession(
    containerId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.selectSandbox(containerId, sessionId)

      if (result.success) {
        // 更新当前会话沙箱选择
        const container = containers.value.find((c) => c.id === containerId)
        if (container) {
          currentSessionSandbox.value = {
            containerId,
            containerName: container.names[0] || containerId.substring(0, 12),
            image: container.image,
            selectedAt: new Date().toISOString(),
            sessionId
          }
        }

        window.api.logger.info('[SandboxStore] 选择沙箱成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 选择沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        sessionId
      })
      return false
    }
  }

  /**
   * 取消选择沙箱
   */
  async function deselectSandbox(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.deselectSandbox(containerId)

      if (result.success && currentSessionSandbox.value?.containerId === containerId) {
        currentSessionSandbox.value = null
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 取消选择沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  /**
   * 获取会话的沙箱
   */
  async function getSessionSandbox(sessionId: string): Promise<SandboxSelection | null> {
    try {
      return await window.api.sandbox.getSessionSandbox(sessionId)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 获取会话沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  // ==================== Actions: 事件处理 ====================

  async function handleSelectSandbox(sandboxId: string): Promise<void> {
    await loadSandbox(sandboxId)
  }

  async function handleNewSandbox(): Promise<void> {
    await createSandbox()
  }

  async function handleDeleteSandbox(sandboxId: string): Promise<void> {
    await deleteSandbox(sandboxId)
  }

  // ==================== Actions: Docker 配置管理 ====================

  /**
   * 加载 Dockerfile 配置列表
   */
  async function loadDockerfileConfigs(): Promise<void> {
    try {
      configsLoading.value = true
      const result = await window.api.sandbox.dockerfile.list()
      if (result.success && result.configs) {
        dockerfileConfigs.value = result.configs
      }
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载 Dockerfile 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      configsLoading.value = false
    }
  }

  /**
   * 加载 Compose 配置列表
   */
  async function loadComposeConfigs(): Promise<void> {
    try {
      configsLoading.value = true
      const result = await window.api.sandbox.compose.list()
      if (result.success && result.configs) {
        composeConfigs.value = result.configs
      }
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载 Compose 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      configsLoading.value = false
    }
  }

  /**
   * 加载 Dockerfile 配置内容
   */
  async function loadDockerfileConfig(id: string): Promise<DockerfileConfig | null> {
    try {
      const result = await window.api.sandbox.dockerfile.load(id)
      if (result.success && result.config) {
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  }

  /**
   * 加载 Compose 配置内容
   */
  async function loadComposeConfig(id: string): Promise<ComposeConfig | null> {
    try {
      const result = await window.api.sandbox.compose.load(id)
      if (result.success && result.config) {
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  }

  /**
   * 保存 Dockerfile 配置
   */
  async function saveDockerfileConfig(
    request: SaveConfigRequest
  ): Promise<DockerfileConfigMeta | null> {
    try {
      const result = await window.api.sandbox.dockerfile.save(request)
      if (result.success && result.config) {
        await loadDockerfileConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[SandboxStore] 保存 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * 保存 Compose 配置
   */
  async function saveComposeConfig(request: SaveConfigRequest): Promise<ComposeConfigMeta | null> {
    try {
      const result = await window.api.sandbox.compose.save(request)
      if (result.success && result.config) {
        await loadComposeConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[SandboxStore] 保存 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * 删除 Dockerfile 配置
   */
  async function deleteDockerfileConfig(id: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.dockerfile.delete(id)
      if (result.success) {
        await loadDockerfileConfigs()
        return true
      }
      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 删除 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return false
    }
  }

  /**
   * 删除 Compose 配置
   */
  async function deleteComposeConfig(id: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.compose.delete(id)
      if (result.success) {
        await loadComposeConfigs()
        return true
      }
      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 删除 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return false
    }
  }

  // ==================== Getters: Sandbox Creator ====================

  /** 创建器过滤后的容器列表 */
  const creatorFilteredContainers = computed(() => {
    let result = containers.value

    if (creatorContainerFilter.value !== 'all') {
      if (creatorContainerFilter.value === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (creatorContainerFilter.value === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      }
    }

    if (creatorContainerSearchQuery.value.trim()) {
      const query = creatorContainerSearchQuery.value.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(query)) ||
          c.image.toLowerCase().includes(query)
      )
    }

    return result
  })

  const creatorRunningCount = computed(
    () => containers.value.filter((c) => c.state === 'running').length
  )

  const creatorStoppedCount = computed(
    () => containers.value.filter((c) => c.state === 'exited' || c.state === 'dead').length
  )

  const creatorCanCreate = computed(() => {
    switch (creatorCreateType.value) {
      case 'compose':
        return creatorComposeContent.value.trim().length > 0
      case 'dockerfile':
        return creatorDockerfileContent.value.trim().length > 0
      case 'existing':
        return creatorSelectedContainerId.value !== null
      default:
        return false
    }
  })

  // ==================== Actions: Sandbox Creator ====================

  function creatorSelectContainer(containerId: string): void {
    creatorSelectedContainerId.value =
      creatorSelectedContainerId.value === containerId ? null : containerId
  }

  function creatorResetContainerSelector(): void {
    creatorContainerSearchQuery.value = ''
    creatorContainerFilter.value = 'all'
    creatorSelectedContainerId.value = null
  }

  function creatorResetGeneratorForm(): void {
    creatorGeneratorForm.value = {
      serviceName: 'app',
      sourceType: 'build',
      image: 'node:18-alpine',
      useSavedDockerfile: false,
      savedDockerfileId: null,
      context: './app',
      dockerfile: 'Dockerfile',
      buildArgs: '',
      ports: '3000:3000',
      environment: 'NODE_ENV=development'
    }
  }

  async function creatorOnSavedDockerfileSelect(): Promise<void> {
    if (!creatorGeneratorForm.value.savedDockerfileId) {
      creatorGeneratorForm.value.useSavedDockerfile = false
      return
    }

    creatorGeneratorForm.value.useSavedDockerfile = true
    const config = await loadDockerfileConfig(creatorGeneratorForm.value.savedDockerfileId)
    if (config) {
      creatorGeneratorForm.value.context = `./${config.name}`
      creatorGeneratorForm.value.dockerfile = config.filename
    }
  }

  function creatorClearSavedDockerfile(): void {
    creatorGeneratorForm.value.savedDockerfileId = null
    creatorGeneratorForm.value.useSavedDockerfile = false
    creatorGeneratorForm.value.context = './app'
    creatorGeneratorForm.value.dockerfile = 'Dockerfile'
  }

  function creatorGenerateServiceConfig(): string {
    const form = creatorGeneratorForm.value
    const lines: string[] = []
    const indent = '    '

    lines.push(`  ${form.serviceName}:`)

    if (form.sourceType === 'image') {
      lines.push(`${indent}image: ${form.image}`)
    } else {
      lines.push(`${indent}build:`)
      lines.push(`${indent}  context: ${form.context}`)
      if (form.dockerfile && form.dockerfile !== 'Dockerfile') {
        lines.push(`${indent}  dockerfile: ${form.dockerfile}`)
      }
      if (form.buildArgs.trim()) {
        const args = form.buildArgs
          .split(',')
          .map((arg) => arg.trim())
          .filter(Boolean)
        if (args.length > 0) {
          lines.push(`${indent}  args:`)
          args.forEach((arg) => {
            const [key, value] = arg.split('=').map((s) => s.trim())
            if (key && value) {
              lines.push(`${indent}    ${key}: ${value}`)
            }
          })
        }
      }
    }

    if (form.ports.trim()) {
      const ports = form.ports
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      if (ports.length > 0) {
        lines.push(`${indent}ports:`)
        ports.forEach((port) => {
          lines.push(`${indent}  - "${port}"`)
        })
      }
    }

    if (form.environment.trim()) {
      const envs = form.environment
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
      if (envs.length > 0) {
        lines.push(`${indent}environment:`)
        envs.forEach((env) => {
          lines.push(`${indent}  - ${env}`)
        })
      }
    }

    return lines.join('\n')
  }

  function creatorInsertServiceConfig(): void {
    const config = creatorGenerateServiceConfig()
    const currentContent = creatorComposeContent.value

    const servicesMatch = currentContent.match(/^(services:\s*\n)/m)
    if (servicesMatch) {
      const insertIndex = servicesMatch.index! + servicesMatch[0].length
      creatorComposeContent.value =
        currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
    } else if (currentContent.includes('version:')) {
      creatorComposeContent.value = currentContent + '\nservices:\n' + config + '\n'
    } else {
      creatorComposeContent.value = "version: '3.8'\n\nservices:\n" + config + '\n'
    }

    creatorShowGenerator.value = false
    creatorResetGeneratorForm()
  }

  function creatorOpenSaveDialog(type: 'dockerfile' | 'compose'): void {
    creatorSaveDialogType.value = type
    creatorSaveConfigName.value = ''
    creatorShowSaveDialog.value = true
  }

  function creatorCloseSaveDialog(): void {
    creatorShowSaveDialog.value = false
    creatorSaveConfigName.value = ''
  }

  async function creatorHandleSaveConfig(): Promise<void> {
    if (!creatorSaveConfigName.value.trim()) return

    const content =
      creatorSaveDialogType.value === 'dockerfile'
        ? creatorDockerfileContent.value
        : creatorComposeContent.value

    if (creatorSaveDialogType.value === 'dockerfile') {
      await saveDockerfileConfig({
        name: creatorSaveConfigName.value.trim(),
        content: content
      })
    } else {
      await saveComposeConfig({
        name: creatorSaveConfigName.value.trim(),
        content: content
      })
    }

    creatorShowSaveDialog.value = false
    creatorShowSuccessToast.value = true
    creatorSuccessMessage.value = `配置「${creatorSaveConfigName.value.trim()}」保存成功`
    setTimeout(() => {
      creatorShowSuccessToast.value = false
    }, 3000)
  }

  function creatorCloseSuccessToast(): void {
    creatorShowSuccessToast.value = false
  }

  async function creatorLoadSelectedDockerfile(): Promise<void> {
    if (!creatorSelectedDockerfileId.value) return
    const config = await loadDockerfileConfig(creatorSelectedDockerfileId.value)
    if (config) {
      creatorDockerfileContent.value = config.content
    }
  }

  async function creatorLoadSelectedCompose(): Promise<void> {
    if (!creatorSelectedComposeId.value) return
    const config = await loadComposeConfig(creatorSelectedComposeId.value)
    if (config) {
      creatorComposeContent.value = config.content
      creatorComposeProjectName.value = config.name
    }
  }

  function creatorReset(): void {
    creatorCreateType.value = 'compose'
    creatorSelectedContainerId.value = null
    creatorContainerFilter.value = 'all'
    creatorContainerSearchQuery.value = ''
    creatorSelectedComposeId.value = null
    creatorSelectedDockerfileId.value = null
    creatorShowGenerator.value = false
    creatorResetGeneratorForm()
  }

  return {
    // State: 基础沙箱
    currentSandbox,
    sandboxList,
    operationLogs,
    isLoading,
    listUpdateKey,

    // State: Docker 容器
    containers,
    selectedContainer,
    containerStats,
    containerFilter,
    containerSearchQuery,

    // State: 模板
    templates,
    templatesLoading,

    // State: 终端
    terminalLogs,

    // State: 会话关联
    currentSessionSandbox,

    // Getters
    currentSandboxId,
    sandboxCount,
    filteredContainers,
    runningContainerCount,

    // Actions: 基础沙箱
    loadSandboxList,
    refreshSandboxList,
    loadSandbox,
    loadOperationLogs,
    createSandbox,
    saveCurrentSandbox,
    deleteSandbox,
    renameSandbox,

    // Actions: 容器浏览器
    loadContainers,
    refreshContainers,
    loadContainerDetails,
    loadContainerStats,
    setContainerFilter,
    setContainerSearchQuery,

    // Actions: 容器操作
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,

    // Actions: 命令执行
    execCommand,
    clearTerminalLogs,

    // Actions: 文件操作
    copyToContainer,
    copyFromContainer,

    // Actions: 日志
    getContainerLogs,

    // Actions: 模板
    loadTemplates,
    createFromTemplate,

    // Actions: 沙箱创建
    createFromCompose,
    createFromDockerfile,

    // Actions: 会话关联
    selectSandboxForSession,
    deselectSandbox,
    getSessionSandbox,

    // Actions: 事件处理
    handleSelectSandbox,
    handleNewSandbox,
    handleDeleteSandbox,

    // State: Docker 配置管理
    dockerfileConfigs,
    composeConfigs,
    configsLoading,

    // Actions: Docker 配置管理
    loadDockerfileConfigs,
    loadComposeConfigs,
    loadDockerfileConfig,
    loadComposeConfig,
    saveDockerfileConfig,
    saveComposeConfig,
    deleteDockerfileConfig,
    deleteComposeConfig,

    // State: Sandbox Creator
    creatorCreateType,
    creatorSelectedContainerId,
    creatorContainerFilter,
    creatorContainerSearchQuery,
    creatorComposeContent,
    creatorComposeProjectName,
    creatorSelectedComposeId,
    creatorDockerfileContent,
    creatorDockerfileContext,
    creatorSelectedDockerfileId,
    creatorShowGenerator,
    creatorGeneratorForm,
    creatorShowSaveDialog,
    creatorSaveDialogType,
    creatorSaveConfigName,
    creatorShowSuccessToast,
    creatorSuccessMessage,

    // Getters: Sandbox Creator
    creatorFilteredContainers,
    creatorRunningCount,
    creatorStoppedCount,
    creatorCanCreate,

    // Actions: Sandbox Creator
    creatorSelectContainer,
    creatorResetContainerSelector,
    creatorResetGeneratorForm,
    creatorOnSavedDockerfileSelect,
    creatorClearSavedDockerfile,
    creatorGenerateServiceConfig,
    creatorInsertServiceConfig,
    creatorOpenSaveDialog,
    creatorCloseSaveDialog,
    creatorHandleSaveConfig,
    creatorCloseSuccessToast,
    creatorLoadSelectedDockerfile,
    creatorLoadSelectedCompose,
    creatorReset,

    // Compose Templates
    composeTemplates,

    // Helper Functions
    getStateLabel,
    getStateClass,
    formatCreated,
    getComposeTemplate
  }
})
