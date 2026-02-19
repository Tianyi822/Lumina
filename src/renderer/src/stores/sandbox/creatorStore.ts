import { ref, computed, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type {
  ComposeOptions,
  CreateSandboxRequest,
  CreateSandboxResult,
  SandboxCreationType,
  ComposeDockerfileConfig
} from '@shared/types/sandbox'
import { useContainerStore } from './containerStore'
import { useDockerConfigStore } from './configStore'
import { useSandboxStore } from './sandboxStore'

// ==================== 端口映射类型 ====================

export interface PortMapping {
  hostPort: number | null // null 表示自动分配
  containerPort: number
  protocol: 'tcp' | 'udp'
  editable: boolean // 是否可编辑
}

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
  /** Dockerfile 沙箱名称 */
  const dockerfileProjectName = ref('')
  /** 选中的 Dockerfile 配置 ID */
  const selectedDockerfileId = ref<string | null>(null)

  // ==================== State: 端口映射 ====================

  /** 端口映射列表 */
  const portMappings = ref<PortMapping[]>([])

  // ==================== Helper: 端口解析 ====================

  /**
   * 从 Dockerfile 内容解析 EXPOSE 指令
   */
  function parseDockerfilePorts(content: string): PortMapping[] {
    const ports: PortMapping[] = []
    if (!content) return ports

    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      // 匹配 EXPOSE 指令（忽略大小写）
      if (trimmed.toUpperCase().startsWith('EXPOSE')) {
        const exposeContent = trimmed.slice(6).trim()
        // 支持多种格式: EXPOSE 3306, EXPOSE 3306/tcp, EXPOSE 3306 3307, EXPOSE 3306/tcp 3307/udp
        const portStrings = exposeContent.split(/\s+/)

        for (const portStr of portStrings) {
          const match = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
          if (match) {
            const containerPort = parseInt(match[1], 10)
            ports.push({
              hostPort: containerPort, // 宿主机端口预选为与容器端口相同的值
              containerPort,
              protocol: (match[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
              editable: true
            })
          }
        }
      }
    }

    return ports
  }

  /**
   * 从 docker-compose.yaml 内容解析 ports 配置
   */
  function parseComposePorts(content: string): PortMapping[] {
    const ports: PortMapping[] = []

    try {
      // 简单的 YAML 端口解析（不依赖 YAML 解析库）
      const lines = content.split('\n')
      let inPortsSection = false
      let currentIndent = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // 检测 ports: 开始
        if (trimmed === 'ports:') {
          inPortsSection = true
          currentIndent = line.search(/\S/)
          continue
        }

        // 如果在 ports 部分
        if (inPortsSection) {
          const lineIndent = line.search(/\S/)

          // 如果缩进减少，说明离开了 ports 部分
          if (lineIndent <= currentIndent && trimmed && !trimmed.startsWith('-')) {
            inPortsSection = false
            continue
          }

          // 解析端口映射行
          if (trimmed.startsWith('-')) {
            const portStr = trimmed.slice(1).trim().replace(/"/g, '')

            // 格式: HostPort:ContainerPort 或 HostPort:ContainerPort/Protocol
            // 也支持简写: ContainerPort（只有容器端口）
            if (portStr.includes(':')) {
              const match = portStr.match(/^(\d+)?:?(\d+)(?:\/(tcp|udp))?$/i)
              if (match) {
                ports.push({
                  hostPort: match[1] ? parseInt(match[1], 10) : null,
                  containerPort: parseInt(match[2], 10),
                  protocol: (match[3]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
                  editable: true
                })
              }
            } else {
              // 简写格式: ContainerPort 或 ContainerPort/Protocol
              const simpleMatch = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
              if (simpleMatch) {
                ports.push({
                  hostPort: null,
                  containerPort: parseInt(simpleMatch[1], 10),
                  protocol: (simpleMatch[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
                  editable: true
                })
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('解析 docker-compose 端口失败:', e)
    }

    return ports
  }

  // 监听内容变化，自动解析端口
  watch(dockerfileContent, (content) => {
    if (createType.value === 'dockerfile' && content) {
      portMappings.value = parseDockerfilePorts(content)
    }
  })

  watch(composeContent, (content) => {
    if (createType.value === 'compose' && content) {
      portMappings.value = parseComposePorts(content)
    }
  })

  watch(createType, (type) => {
    if (type === 'dockerfile') {
      portMappings.value = parseDockerfilePorts(dockerfileContent.value)
    } else if (type === 'compose') {
      portMappings.value = parseComposePorts(composeContent.value)
    } else {
      portMappings.value = []
    }
  })

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

  // ==================== State: 创建状态跟踪 ====================

  /** 创建进行中状态 */
  const isCreating = ref(false)
  /** 创建错误信息 */
  const createError = ref<string | null>(null)
  /** 创建阶段 */
  const createPhase = ref<'idle' | 'metadata' | 'building' | 'starting' | 'done'>('idle')

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

  // ==================== Actions: 端口映射 ====================

  /** 更新端口映射 */
  function updatePortMapping(index: number, mapping: Partial<PortMapping>): void {
    if (index >= 0 && index < portMappings.value.length) {
      portMappings.value[index] = { ...portMappings.value[index], ...mapping }
    }
  }

  /** 添加端口映射 */
  function addPortMapping(): void {
    portMappings.value.push({
      hostPort: null,
      containerPort: 80,
      protocol: 'tcp',
      editable: true
    })
  }

  /** 删除端口映射 */
  function removePortMapping(index: number): void {
    if (index >= 0 && index < portMappings.value.length) {
      portMappings.value.splice(index, 1)
    }
  }

  /** 重新解析端口（手动触发） */
  function refreshPorts(): void {
    if (createType.value === 'dockerfile') {
      portMappings.value = parseDockerfilePorts(dockerfileContent.value)
    } else if (createType.value === 'compose') {
      portMappings.value = parseComposePorts(composeContent.value)
    }
  }

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
    const serviceName = generatorForm.value.serviceName.trim() || 'app'
    const currentContent = composeContent.value

    // 解析现有内容，查找并替换已存在的服务
    const lines = currentContent.split('\n')
    let inServices = false
    let currentService: string | null = null
    let serviceStartLine = -1
    let serviceEndLine = -1
    let foundService = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 检测 services 块开始
      if (line.trim() === 'services:') {
        inServices = true
        continue
      }

      // 检测其他顶级块（退出 services 块）
      if (inServices && line.match(/^[a-zA-Z]/) && !line.startsWith('  ')) {
        inServices = false
        if (foundService) break
      }

      if (inServices) {
        // 检测服务定义（2空格缩进 + 服务名 + 冒号）
        const serviceMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/)
        if (serviceMatch) {
          // 如果之前找到了目标服务，记录结束位置
          if (currentService === serviceName && !foundService) {
            serviceEndLine = i
            foundService = true
          }
          currentService = serviceMatch[1]
          if (currentService === serviceName) {
            serviceStartLine = i
            serviceEndLine = -1
          }
        }
      }
    }

    // 如果找到了目标服务但没设置结束位置，说明是最后一个服务
    if (currentService === serviceName && serviceEndLine === -1) {
      serviceEndLine = lines.length
      foundService = true
    }

    if (foundService && serviceStartLine >= 0) {
      // 替换已存在的服务
      const newLines = [
        ...lines.slice(0, serviceStartLine),
        ...config.split('\n'),
        ...lines.slice(serviceEndLine)
      ]
      composeContent.value = newLines.join('\n')
      window.api.logger.info('[SandboxCreatorStore] 替换已存在的服务配置', {
        serviceName,
        startLine: serviceStartLine,
        endLine: serviceEndLine
      })
    } else {
      // 服务不存在，插入新配置
      const servicesMatch = currentContent.match(/services:\s*\n/m)
      if (servicesMatch && servicesMatch.index !== undefined) {
        const insertIndex = servicesMatch.index + servicesMatch[0].length
        composeContent.value =
          currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
      } else if (currentContent.includes('version:')) {
        composeContent.value = currentContent + '\nservices:\n' + config + '\n'
      } else {
        composeContent.value = "version: '3.8'\n\nservices:\n" + config + '\n'
      }
      window.api.logger.info('[SandboxCreatorStore] 插入新服务配置', { serviceName })
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

  /**
   * 从 Compose 创建沙箱
   */
  async function createFromCompose(
    options?: ComposeOptions
  ): Promise<(CreateSandboxResult & { composeError?: string }) | null> {
    const sandboxStore = useSandboxStore()

    // 重置状态
    isCreating.value = true
    createError.value = null
    createPhase.value = 'metadata'

    try {
      window.api.logger.info('[SandboxCreatorStore] 开始从 Compose 创建沙箱', {
        projectName: options?.projectName || composeProjectName.value,
        composeConfigId: selectedComposeId.value
      })

      const request: CreateSandboxRequest = {
        name: composeProjectName.value.trim() || '新建 Compose 沙箱',
        creationType: 'compose' as SandboxCreationType,
        composeConfigId: selectedComposeId.value || undefined,
        projectName: options?.projectName || composeProjectName.value
      }

      const result = await sandboxStore.createSandbox(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建沙箱元数据失败'
        createError.value = errorMsg
        createPhase.value = 'idle'
        isCreating.value = false
        window.api.logger.error('[SandboxCreatorStore] 创建沙箱元数据失败', {
          error: errorMsg
        })
        return {
          success: false,
          sandbox: result?.sandbox,
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
        const composeResult = await window.api.sandbox.createFromCompose(
          composeContent.value,
          {
            ...options,
            dockerfiles: dockerfiles.length > 0 ? dockerfiles : undefined
          },
          result.sandbox?.sandboxId,
          composeProjectName.value.trim() || undefined
        )

        if (composeResult.error) {
          createError.value = composeResult.error
          createPhase.value = 'idle'
          isCreating.value = false
          window.api.logger.error('[SandboxCreatorStore] Docker Compose 创建失败', {
            error: composeResult.error
          })
          return {
            success: false,
            sandbox: result.sandbox,
            error: `Docker 创建失败: ${composeResult.error}`,
            composeError: composeResult.error
          }
        }

        createPhase.value = 'starting'
        await containerStore.refreshContainers()

        createPhase.value = 'done'
        isCreating.value = false

        window.api.logger.info('[SandboxCreatorStore] 从 Compose 创建沙箱成功', {
          projectName: composeProjectName.value,
          sandboxId: result.sandbox?.sandboxId,
          containerCount: composeResult.containerIds?.length || 0
        })

        return {
          success: true,
          sandbox: result.sandbox,
          containerIds: composeResult.containerIds
        }
      } catch (dockerError) {
        createError.value = dockerError instanceof Error ? dockerError.message : String(dockerError)
        createPhase.value = 'idle'
        isCreating.value = false
        window.api.logger.error('[SandboxCreatorStore] Docker Compose API 调用失败', {
          error: createError.value
        })
        return {
          success: false,
          sandbox: result.sandbox,
          error: `Docker API 调用失败: ${createError.value}`,
          composeError: createError.value
        }
      }
    } catch (error) {
      createError.value = error instanceof Error ? error.message : String(error)
      createPhase.value = 'idle'
      isCreating.value = false
      window.api.logger.error('[SandboxCreatorStore] 从 Compose 创建沙箱失败', {
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
   * 从 Dockerfile 创建沙箱
   */
  async function createFromDockerfile(): Promise<
    (CreateSandboxResult & { dockerError?: string }) | null
  > {
    const sandboxStore = useSandboxStore()

    // 重置状态
    isCreating.value = true
    createError.value = null
    createPhase.value = 'metadata'

    try {
      window.api.logger.info('[SandboxCreatorStore] 开始从 Dockerfile 创建沙箱', {
        context: dockerfileContext.value,
        dockerfileConfigId: selectedDockerfileId.value
      })

      const request: CreateSandboxRequest = {
        name: dockerfileProjectName.value.trim() || '新建 Dockerfile 沙箱',
        creationType: 'dockerfile' as SandboxCreationType,
        dockerfileConfigId: selectedDockerfileId.value || undefined,
        context: dockerfileContext.value || undefined
      }

      const result = await sandboxStore.createSandbox(request)

      if (!result?.success) {
        const errorMsg = result?.error || '创建沙箱元数据失败'
        createError.value = errorMsg
        createPhase.value = 'idle'
        isCreating.value = false
        window.api.logger.error('[SandboxCreatorStore] 创建沙箱元数据失败', {
          error: errorMsg
        })
        return {
          success: false,
          sandbox: result?.sandbox,
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

        const dockerResult = await window.api.sandbox.createFromDockerfile(
          dockerfileContent.value,
          dockerfileContext.value,
          result.sandbox?.sandboxId,
          dockerfileProjectName.value.trim() || undefined,
          portMappingsParam.length > 0 ? portMappingsParam : undefined
        )

        // 检查 Docker 操作结果
        if (!dockerResult.success || dockerResult.error) {
          createError.value = dockerResult.error || 'Docker 构建失败'
          createPhase.value = 'idle'
          isCreating.value = false
          window.api.logger.error('[SandboxCreatorStore] Dockerfile 创建失败', {
            error: createError.value
          })
          return {
            success: false,
            sandbox: result.sandbox,
            error: `Docker 创建失败: ${createError.value}`,
            dockerError: createError.value
          }
        }

        const containerId = dockerResult.containerId || ''
        createPhase.value = 'starting'
        await containerStore.refreshContainers()

        createPhase.value = 'done'
        isCreating.value = false

        window.api.logger.info('[SandboxCreatorStore] 从 Dockerfile 创建沙箱成功', {
          sandboxId: result.sandbox?.sandboxId,
          containerId: containerId.substring(0, 12)
        })

        return {
          success: true,
          sandbox: result.sandbox,
          containerIds: containerId ? [containerId] : []
        }
      } catch (dockerError) {
        createError.value = dockerError instanceof Error ? dockerError.message : String(dockerError)
        createPhase.value = 'idle'
        isCreating.value = false
        window.api.logger.error('[SandboxCreatorStore] Dockerfile API 调用失败', {
          error: createError.value
        })
        return {
          success: false,
          sandbox: result.sandbox,
          error: `Docker API 调用失败: ${createError.value}`,
          dockerError: createError.value
        }
      }
    } catch (error) {
      createError.value = error instanceof Error ? error.message : String(error)
      createPhase.value = 'idle'
      isCreating.value = false
      window.api.logger.error('[SandboxCreatorStore] 从 Dockerfile 创建沙箱失败', {
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
   * 从已有容器创建沙箱
   */
  async function createFromExisting(containerId: string): Promise<CreateSandboxResult | null> {
    const sandboxStore = useSandboxStore()

    try {
      const container = containerStore.containers.find((c) => c.id === containerId)
      const containerName = container?.names[0]?.replace(/^\//, '') || containerId.substring(0, 12)

      const request: CreateSandboxRequest = {
        name: `${containerName}-沙箱`,
        creationType: 'existing' as SandboxCreationType,
        existingContainerId: containerId
      }

      const result = await sandboxStore.createSandbox(request)

      if (result?.success) {
        window.api.logger.info('[SandboxCreatorStore] 从已有容器创建沙箱成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxCreatorStore] 从已有容器创建沙箱失败', {
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
    composeContent.value = ''
    composeProjectName.value = ''
    selectedComposeId.value = null
    dockerfileContent.value = ''
    dockerfileContext.value = ''
    dockerfileProjectName.value = ''
    selectedDockerfileId.value = null
    showGenerator.value = false
    isCreating.value = false
    createError.value = null
    createPhase.value = 'idle'
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
    dockerfileProjectName,
    selectedDockerfileId,

    // State: 端口映射
    portMappings,

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

    // Actions: 端口映射
    updatePortMapping,
    addPortMapping,
    removePortMapping,
    refreshPorts,

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
    createFromExisting,

    // Actions: 重置
    reset,
    clearCreateError,

    // Helper
    getComposeTemplate,
    composeTemplates: COMPOSE_TEMPLATES
  }
})
