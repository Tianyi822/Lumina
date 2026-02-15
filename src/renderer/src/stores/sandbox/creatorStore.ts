import { ref, computed } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type { ComposeOptions, ComposeResult } from '@shared/types/sandbox'
import { useContainerStore } from './containerStore'
import { useDockerConfigStore } from './configStore'

const COMPOSE_TEMPLATES = {
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

type ComposeTemplateType = keyof typeof COMPOSE_TEMPLATES

export const useSandboxCreatorStore = defineStore('sandboxCreator', () => {
  // ==================== Store Dependencies ====================

  const containerStore = useContainerStore()
  const configStore = useDockerConfigStore()
  const { containers } = storeToRefs(containerStore)
  const { loadDockerfileConfig, loadComposeConfig, saveDockerfileConfig, saveComposeConfig } =
    configStore

  // ==================== State: 创建类型与容器选择 ====================

  /** 创建类型 */
  const createType = ref<'compose' | 'dockerfile' | 'existing'>('compose')
  /** 选中的容器 ID (用于创建器) */
  const selectedContainerId = ref<string | null>(null)
  /** 容器过滤类型 (用于创建器) */
  const containerFilter = ref<'all' | 'running' | 'stopped'>('all')
  /** 容器搜索关键词 (用于创建器) */
  const containerSearchQuery = ref('')

  // ==================== State: Compose 配置 ====================

  /** Compose 内容 */
  const composeContent = ref('')
  /** Compose 项目名称 */
  const composeProjectName = ref('')
  /** 选中的 Compose 配置 ID */
  const selectedComposeId = ref<string | null>(null)

  // ==================== State: Dockerfile 配置 ====================

  /** Dockerfile 内容 */
  const dockerfileContent = ref('')
  /** Dockerfile 上下文路径 */
  const dockerfileContext = ref('')
  /** 选中的 Dockerfile 配置 ID */
  const selectedDockerfileId = ref<string | null>(null)

  // ==================== State: 配置生成器 ====================

  /** 构建配置生成器显示状态 */
  const showGenerator = ref(false)
  /** 构建配置生成器表单 */
  const generatorForm = ref({
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

  // ==================== State: 保存对话框 ====================

  /** 保存配置对话框显示状态 */
  const showSaveDialog = ref(false)
  /** 保存配置对话框类型 */
  const saveDialogType = ref<'dockerfile' | 'compose'>('compose')
  /** 保存配置名称 */
  const saveConfigName = ref('')

  // ==================== State: 成功提示 ====================

  /** 成功提示显示状态 */
  const showSuccessToast = ref(false)
  /** 成功提示消息 */
  const successMessage = ref('')

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
        return composeContent.value.trim().length > 0
      case 'dockerfile':
        return dockerfileContent.value.trim().length > 0
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

  function resetGeneratorForm(): void {
    generatorForm.value = {
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

  function generateServiceConfig(): string {
    const form = generatorForm.value
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

  function insertServiceConfig(): void {
    const config = generateServiceConfig()
    const currentContent = composeContent.value

    const servicesMatch = currentContent.match(/^(services:\s*\n)/m)
    if (servicesMatch) {
      const insertIndex = servicesMatch.index! + servicesMatch[0].length
      composeContent.value =
        currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
    } else if (currentContent.includes('version:')) {
      composeContent.value = currentContent + '\nservices:\n' + config + '\n'
    } else {
      composeContent.value = "version: '3.8'\n\nservices:\n" + config + '\n'
    }

    showGenerator.value = false
    resetGeneratorForm()
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
    showSuccessToast.value = true
    successMessage.value = `配置「${saveConfigName.value.trim()}」保存成功`
    setTimeout(() => {
      showSuccessToast.value = false
    }, 3000)
  }

  function closeSuccessToast(): void {
    showSuccessToast.value = false
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

  // ==================== Actions: 创建沙箱 ====================

  async function createFromCompose(options?: ComposeOptions): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromCompose(composeContent.value, options)

      if (!result.error) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxCreatorStore] 从 Compose 创建沙箱成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxCreatorStore] 从 Compose 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function createFromDockerfile(): Promise<string | null> {
    try {
      const containerId = await window.api.sandbox.createFromDockerfile(
        dockerfileContent.value,
        dockerfileContext.value
      )

      if (containerId) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxCreatorStore] 从 Dockerfile 创建沙箱成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return containerId
    } catch (error) {
      window.api.logger.error('[SandboxCreatorStore] 从 Dockerfile 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== Actions: 重置 ====================

  function reset(): void {
    createType.value = 'compose'
    selectedContainerId.value = null
    containerFilter.value = 'all'
    containerSearchQuery.value = ''
    composeContent.value = ''
    composeProjectName.value = ''
    selectedComposeId.value = null
    dockerfileContent.value = ''
    dockerfileContext.value = ''
    selectedDockerfileId.value = null
    showGenerator.value = false
    resetGeneratorForm()
  }

  // ==================== Helper: Compose 模板 ====================

  function getComposeTemplate(type: ComposeTemplateType): string {
    return COMPOSE_TEMPLATES[type]
  }

  return {
    // State: 创建类型与容器选择
    createType,
    selectedContainerId,
    containerFilter,
    containerSearchQuery,

    // State: Compose 配置
    composeContent,
    composeProjectName,
    selectedComposeId,

    // State: Dockerfile 配置
    dockerfileContent,
    dockerfileContext,
    selectedDockerfileId,

    // State: 配置生成器
    showGenerator,
    generatorForm,

    // State: 保存对话框
    showSaveDialog,
    saveDialogType,
    saveConfigName,

    // State: 成功提示
    showSuccessToast,
    successMessage,

    // Getters
    filteredContainers,
    runningCount,
    stoppedCount,
    canCreate,

    // Actions: 容器选择
    selectContainer,
    resetContainerSelector,

    // Actions: 配置生成器
    resetGeneratorForm,
    onSavedDockerfileSelect,
    clearSavedDockerfile,
    generateServiceConfig,
    insertServiceConfig,

    // Actions: 保存配置
    openSaveDialog,
    closeSaveDialog,
    handleSaveConfig,
    closeSuccessToast,

    // Actions: 加载已保存配置
    loadSelectedDockerfile,
    loadSelectedCompose,

    // Actions: 创建沙箱
    createFromCompose,
    createFromDockerfile,

    // Actions: 重置
    reset,

    // Helper
    getComposeTemplate,
    composeTemplates: COMPOSE_TEMPLATES
  }
})
