// MCP Store
// 管理 MCP 服务器配置、连接状态和工具列表

import { ref, computed, toRaw, reactive } from 'vue'
import { defineStore } from 'pinia'
import type {
  MCPServerConfig,
  MCPConnectionStatus,
  MCPTool,
  MCPStatusChangeEvent
} from '@renderer/types'
import { deepClone } from '@shared/utils'

export const useMCPStore = defineStore(
  'mcp',
  () => {
    // ==================== State ====================

    // MCP 服务器配置列表
    const configs = ref<MCPServerConfig[]>([])

    // MCP 连接状态列表
    const statuses = ref<MCPConnectionStatus[]>([])

    // 工具列表（按服务器分组）
    const toolsByServer = ref<Record<string, MCPTool[]>>({})

    // 搜索关键词
    const searchQuery = ref('')

    // 展开的服务器（持久化）
    const expandedServers = ref<Set<string>>(new Set())

    // 显示配置表单
    const showForm = ref(false)

    // 正在编辑的配置（null 表示新建）
    const editingConfig = ref<MCPServerConfig | null>(null)

    // 表单数据
    const formData = reactive<MCPServerConfig>({
      name: '',
      transport: 'stdio',
      command: '',
      args: [],
      env: {},
      url: '',
      headers: {}
    })

    // 表单文本字段
    const argsText = ref('')
    const envText = ref('')
    const headersText = ref('')

    // 加载状态
    const loading = ref(false)

    // 正在连接的服务器名
    const connecting = ref<string | null>(null)

    // 正在测试的服务器名
    const testing = ref<string | null>(null)

    // 错误信息
    const error = ref<string | null>(null)

    // 状态监听器清理函数
    let statusListenerCleanup: (() => void) | null = null

    // ==================== Getters ====================

    // 总工具数量
    const totalToolsCount = computed(() => {
      return Object.values(toolsByServer.value).reduce((sum, tools) => sum + tools.length, 0)
    })

    // 已连接服务器数量
    const connectedServersCount = computed(() => {
      return statuses.value.filter((s) => s.connected).length
    })

    // 过滤后的工具列表（按搜索词过滤）
    const filteredToolsByServer = computed(() => {
      if (!searchQuery.value.trim()) {
        return toolsByServer.value
      }

      const query = searchQuery.value.toLowerCase()
      const result: Record<string, MCPTool[]> = {}

      for (const [serverName, tools] of Object.entries(toolsByServer.value)) {
        const filtered = tools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(query) ||
            tool.description.toLowerCase().includes(query)
        )
        if (filtered.length > 0) {
          result[serverName] = filtered
        }
      }

      return result
    })

    // 是否正在进行操作
    const isOperating = computed(() => {
      return loading.value || connecting.value !== null || testing.value !== null
    })

    // ==================== Actions: 配置管理 ====================

    // 加载所有配置和状态
    async function loadConfigs(): Promise<void> {
      loading.value = true
      error.value = null
      try {
        configs.value = await window.api.mcp.listConfigs()
        statuses.value = await window.api.mcp.getStatus()
        window.api.logger?.debug('[MCPStore] 加载配置完成', {
          configCount: configs.value.length,
          statusCount: statuses.value.length
        })
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[MCPStore] 加载配置失败', { error: error.value })
      } finally {
        loading.value = false
      }
    }

    // 保存配置
    async function saveConfig(config: MCPServerConfig): Promise<boolean> {
      loading.value = true
      error.value = null
      try {
        const plainConfig = deepClone(toRaw(config))
        const result = await window.api.mcp.saveConfig(plainConfig)
        if (result.success) {
          await loadConfigs()
          window.api.logger?.info('[MCPStore] 保存配置成功', { name: config.name })
          return true
        } else {
          error.value = result.error || '保存失败'
          return false
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[MCPStore] 保存配置失败', { error: error.value })
        return false
      } finally {
        loading.value = false
      }
    }

    // 删除配置
    async function deleteConfig(name: string): Promise<boolean> {
      loading.value = true
      error.value = null
      try {
        const result = await window.api.mcp.deleteConfig(name)
        if (result.success) {
          await loadConfigs()
          window.api.logger?.info('[MCPStore] 删除配置成功', { name })
          return true
        } else {
          error.value = result.error || '删除失败'
          return false
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[MCPStore] 删除配置失败', { error: error.value })
        return false
      } finally {
        loading.value = false
      }
    }

    // 获取配置的连接状态
    function getStatus(name: string): MCPConnectionStatus | undefined {
      return statuses.value.find((s) => s.serverName === name)
    }

    // 检查服务器是否已连接
    function isServerConnected(serverName: string): boolean {
      const status = statuses.value.find((s) => s.serverName === serverName)
      return status?.connected ?? false
    }

    // ==================== Actions: 连接管理 ====================

    // 连接服务器
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
          window.api.logger?.info('[MCPStore] 连接成功', { name })
          return true
        } else {
          onError?.(result.error || '连接失败')
          return false
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        onError?.(message)
        window.api.logger?.error('[MCPStore] 连接失败', { name, error: message })
        return false
      } finally {
        connecting.value = null
      }
    }

    // 断开服务器连接
    async function disconnect(name: string, onError?: (message: string) => void): Promise<boolean> {
      try {
        const result = await window.api.mcp.disconnect(name)
        if (result.success) {
          await loadConfigs()
          window.api.logger?.info('[MCPStore] 断开连接成功', { name })
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

    // 测试连接
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

    // 刷新所有状态
    async function refreshStatuses(): Promise<void> {
      try {
        statuses.value = await window.api.mcp.getStatus()
      } catch (e) {
        window.api.logger?.error('[MCPStore] 刷新状态失败', { error: e })
      }
    }

    // ==================== Actions: 工具管理 ====================

    // 加载所有工具
    async function loadAllTools(): Promise<void> {
      try {
        toolsByServer.value = await window.api.mcp.listToolsByServer()
        statuses.value = await window.api.mcp.getStatus()
        window.api.logger?.debug('[MCPStore] 加载工具完成', {
          serverCount: Object.keys(toolsByServer.value).length,
          totalTools: totalToolsCount.value
        })
      } catch (e) {
        window.api.logger?.error('[MCPStore] 加载工具失败', { error: e })
      }
    }

    // 获取服务器工具列表
    function getServerTools(serverName: string): MCPTool[] {
      return toolsByServer.value[serverName] || []
    }

    // 刷新指定服务器的工具
    async function refreshServerTools(serverName: string): Promise<void> {
      try {
        const allTools = await window.api.mcp.listToolsByServer()
        if (allTools[serverName]) {
          toolsByServer.value[serverName] = allTools[serverName]
        }
      } catch (e) {
        window.api.logger?.error('[MCPStore] 刷新服务器工具失败', { serverName, error: e })
      }
    }

    // ==================== Actions: UI 状态 ====================

    // 切换服务器展开状态
    function toggleServerExpanded(serverName: string): void {
      if (expandedServers.value.has(serverName)) {
        expandedServers.value.delete(serverName)
      } else {
        expandedServers.value.add(serverName)
      }
    }

    // 检查服务器是否展开
    function isServerExpanded(serverName: string): boolean {
      return expandedServers.value.has(serverName)
    }

    // 设置搜索关键词
    function setSearchQuery(query: string): void {
      searchQuery.value = query
    }

    // 清除搜索
    function clearSearch(): void {
      searchQuery.value = ''
    }

    // ==================== Actions: 表单管理 ====================

    // 解析键值对文本
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

    // 键值对转文本
    function keyValueToText(obj: Record<string, string>): string {
      return Object.entries(obj)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
    }

    // 构建配置对象
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

    // 验证配置
    function validateConfig(config: MCPServerConfig, existingNames: string[]): string | null {
      if (!config.name.trim()) {
        return '请输入服务器名称'
      }

      // 编辑模式时排除自身名称
      const namesToCheck = editingConfig.value
        ? existingNames.filter((n) => n !== editingConfig.value?.name)
        : existingNames

      if (namesToCheck.some((c) => c === config.name)) {
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

    // 重置表单
    function resetForm(): void {
      showForm.value = false
      editingConfig.value = null
      formData.name = ''
      formData.transport = 'stdio'
      formData.command = ''
      formData.args = []
      formData.env = {}
      formData.url = ''
      formData.headers = {}
      argsText.value = ''
      envText.value = ''
      headersText.value = ''
    }

    // 打开新建表单
    function openCreateForm(): void {
      resetForm()
      showForm.value = true
    }

    // 打开编辑表单
    function openEditForm(config: MCPServerConfig): void {
      editingConfig.value = config
      formData.name = config.name
      formData.transport = config.transport
      formData.command = config.command || ''
      formData.args = config.args || []
      formData.env = config.env || {}
      formData.url = config.url || ''
      formData.headers = config.headers || {}
      argsText.value = (config.args || []).join('\n')
      envText.value = keyValueToText(config.env || {})
      headersText.value = keyValueToText(config.headers || {})
      showForm.value = true
    }

    // 关闭表单
    function closeForm(): void {
      resetForm()
    }

    // ==================== Actions: 事件监听 ====================

    // 设置状态变更监听器
    function setupStatusListener(): void {
      if (statusListenerCleanup) {
        statusListenerCleanup()
      }

      statusListenerCleanup = window.api.mcp.onStatusChange((event: MCPStatusChangeEvent) => {
        window.api.logger?.debug('[MCPStore] 收到状态变更事件', {
          serverName: event.serverName,
          connected: event.status.connected,
          error: event.status.error
        })

        refreshStatuses()
        loadAllTools()
      })

      window.api.logger?.debug('[MCPStore] 状态监听器已设置')
    }

    // 清理状态变更监听器
    function cleanupStatusListener(): void {
      if (statusListenerCleanup) {
        statusListenerCleanup()
        statusListenerCleanup = null
        window.api.logger?.debug('[MCPStore] 状态监听器已清理')
      }
    }

    return {
      // State
      configs,
      statuses,
      toolsByServer,
      searchQuery,
      expandedServers,
      showForm,
      editingConfig,
      formData,
      argsText,
      envText,
      headersText,
      loading,
      connecting,
      testing,
      error,

      // Getters
      totalToolsCount,
      connectedServersCount,
      filteredToolsByServer,
      isOperating,

      // Actions: 配置管理
      loadConfigs,
      saveConfig,
      deleteConfig,
      getStatus,
      isServerConnected,

      // Actions: 连接管理
      connect,
      disconnect,
      testConnection,
      refreshStatuses,

      // Actions: 工具管理
      loadAllTools,
      getServerTools,
      refreshServerTools,

      // Actions: UI 状态
      toggleServerExpanded,
      isServerExpanded,
      setSearchQuery,
      clearSearch,

      // Actions: 表单管理
      parseKeyValueText,
      keyValueToText,
      buildConfig,
      validateConfig,
      resetForm,
      openCreateForm,
      openEditForm,
      closeForm,

      // Actions: 事件监听
      setupStatusListener,
      cleanupStatusListener
    }
  },
  {
    // 持久化配置
    persist: {
      key: 'lumina-mcp-state',
      pick: ['expandedServers'],
      serializer: {
        serialize: (value) => {
          return JSON.stringify({
            expandedServers: Array.from(value.expandedServers || [])
          })
        },
        deserialize: (value) => {
          const parsed = JSON.parse(value)
          return {
            expandedServers: new Set(parsed.expandedServers || [])
          }
        }
      }
    }
  }
)
