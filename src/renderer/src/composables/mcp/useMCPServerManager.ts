import { reactive, ref, toRaw } from 'vue'
import type { Ref } from 'vue'
import type { MCPServerConfig, MCPConnectionStatus, MCPStatusChangeEvent } from '@renderer/types'
import { deepClone } from '@shared/utils'

/**
 * MCP Server Manager - 整合配置、连接和表单管理功能
 */
export function useMCPServerManager(): {
  // 配置
  mcpConfigs: Ref<MCPServerConfig[]>
  mcpStatuses: Ref<MCPConnectionStatus[]>
  loading: Ref<boolean>
  error: Ref<string | undefined>
  loadConfigs: () => Promise<void>
  saveConfig: (config: MCPServerConfig) => Promise<boolean>
  deleteConfig: (name: string) => Promise<boolean>
  getStatus: (name: string) => MCPConnectionStatus | undefined

  // 连接
  connect: (
    name: string,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void
  ) => Promise<boolean>
  disconnect: (name: string, onError?: (msg: string) => void) => Promise<boolean>
  testConnection: (
    config: MCPServerConfig,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void
  ) => Promise<boolean>
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void) => () => void

  // 表单
  showForm: Ref<boolean>
  formData: MCPServerConfig
  argsText: Ref<string>
  envText: Ref<string>
  headersText: Ref<string>
  parseKeyValueText: (text: string) => Record<string, string>
  keyValueToText: (obj: Record<string, string>) => string
  buildConfig: () => MCPServerConfig
  validateConfig: (config: MCPServerConfig, existingNames: string[]) => string | null
  resetForm: () => void
  openForm: () => void
} {
  // ==================== 配置 ====================
  const mcpConfigs = ref<MCPServerConfig[]>([])
  const mcpStatuses = ref<MCPConnectionStatus[]>([])
  const loading = ref(false)
  const error = ref<string>()

  async function loadConfigs(): Promise<void> {
    loading.value = true
    error.value = undefined
    try {
      mcpConfigs.value = await window.api.mcp.listConfigs()
      mcpStatuses.value = await window.api.mcp.getStatus()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('加载 MCP 配置失败:', e)
    } finally {
      loading.value = false
    }
  }

  async function saveConfig(config: MCPServerConfig): Promise<boolean> {
    loading.value = true
    error.value = undefined
    try {
      const plainConfig = deepClone(toRaw(config))
      const result = await window.api.mcp.saveConfig(plainConfig)
      if (result.success) {
        await loadConfigs()
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('保存 MCP 配置失败:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteConfig(name: string): Promise<boolean> {
    loading.value = true
    error.value = undefined
    try {
      const result = await window.api.mcp.deleteConfig(name)
      if (result.success) {
        await loadConfigs()
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('删除 MCP 配置失败:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  function getStatus(name: string): MCPConnectionStatus | undefined {
    return mcpStatuses.value.find((s) => s.serverName === name)
  }

  // ==================== 连接 ====================
  const connecting = ref<string | null>(null)
  const testing = ref<string | null>(null)

  async function connect(
    name: string,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ): Promise<boolean> {
    connecting.value = name
    try {
      const result = await window.api.mcp.connect(name)
      if (result.success) {
        await loadConfigs()
        onSuccess?.(`已连接到 ${name}`)
        return true
      } else {
        onError?.(result.error || '连接失败')
        return false
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      onError?.(message)
      return false
    } finally {
      connecting.value = null
    }
  }

  async function disconnect(name: string, onError?: (message: string) => void): Promise<boolean> {
    try {
      const result = await window.api.mcp.disconnect(name)
      if (result.success) {
        await loadConfigs()
        return true
      } else {
        onError?.('断开连接失败')
        return false
      }
    } catch {
      onError?.('断开连接失败')
      return false
    }
  }

  async function testConnection(
    config: MCPServerConfig,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ): Promise<boolean> {
    testing.value = config.name
    try {
      const plainConfig = deepClone(toRaw(config))
      const result = await window.api.mcp.testConnection(plainConfig)
      if (result.success) {
        onSuccess?.(`连接测试成功，找到 ${result.tools?.length || 0} 个工具`)
        return true
      } else {
        onError?.(result.error || '连接测试失败')
        return false
      }
    } catch {
      onError?.('连接测试失败')
      return false
    } finally {
      testing.value = null
    }
  }

  function onStatusChange(callback: (event: MCPStatusChangeEvent) => void): () => void {
    return window.api.mcp.onStatusChange(callback)
  }

  // ==================== 表单 ====================
  const showForm = ref(false)

  const formData = reactive<MCPServerConfig>({
    name: '',
    transport: 'stdio',
    enabled: true,
    command: '',
    args: [],
    env: {},
    url: '',
    headers: {}
  })

  const argsText = ref('')
  const envText = ref('')
  const headersText = ref('')

  function parseKeyValueText(text: string): Record<string, string> {
    const result: Record<string, string> = {}
    const lines = text.split('\n').filter((line) => line.trim())
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join('=').trim()
      }
    }
    return result
  }

  function keyValueToText(obj: Record<string, string>): string {
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  function buildConfig(): MCPServerConfig {
    return {
      ...toRaw(formData),
      args: argsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s),
      env: parseKeyValueText(envText.value),
      headers: parseKeyValueText(headersText.value)
    }
  }

  function validateConfig(config: MCPServerConfig, existingNames: string[]): string | null {
    if (!config.name.trim()) {
      return '请输入服务器名称'
    }

    if (existingNames.some((c) => c === config.name)) {
      return '该名称已存在'
    }

    if (config.transport === 'stdio') {
      if (!config.command?.trim()) {
        return '请输入执行命令'
      }
    } else {
      if (!config.url?.trim()) {
        return '请输入服务地址'
      }
    }

    return null
  }

  function resetForm(): void {
    showForm.value = false
    formData.name = ''
    formData.transport = 'stdio'
    formData.enabled = true
    formData.command = ''
    formData.args = []
    formData.env = {}
    formData.url = ''
    formData.headers = {}
    argsText.value = ''
    envText.value = ''
    headersText.value = ''
  }

  function openForm(): void {
    showForm.value = true
  }

  return {
    // 配置
    mcpConfigs,
    mcpStatuses,
    loading,
    error,
    loadConfigs,
    saveConfig,
    deleteConfig,
    getStatus,

    // 连接
    connect,
    disconnect,
    testConnection,
    onStatusChange,

    // 表单
    showForm,
    formData,
    argsText,
    envText,
    headersText,
    parseKeyValueText,
    keyValueToText,
    buildConfig,
    validateConfig,
    resetForm,
    openForm
  }
}
