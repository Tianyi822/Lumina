import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MCPServerConfig, MCPConnectionStatus, MCPTool } from '@renderer/types'
import { deepClone } from '@shared/utils'

interface MCPState {
  configs: MCPServerConfig[]
  statuses: MCPConnectionStatus[]
  toolsByServer: Record<string, MCPTool[]>
  searchQuery: string
  expandedServers: Set<string>
  showForm: boolean
  editingConfig: MCPServerConfig | null
  formData: MCPServerConfig
  argsText: string
  envText: string
  headersText: string
  loading: boolean
  connecting: string | null
  testing: string | null
  error: string | null

  totalToolsCount: () => number
  connectedServersCount: () => number
  filteredToolsByServer: () => Record<string, MCPTool[]>
  isOperating: () => boolean

  loadConfigs: () => Promise<void>
  saveConfig: (config: MCPServerConfig) => Promise<boolean>
  deleteConfig: (name: string) => Promise<boolean>
  getStatus: (name: string) => MCPConnectionStatus | undefined
  isServerConnected: (serverName: string) => boolean

  connect: (
    name: string,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ) => Promise<boolean>
  disconnect: (name: string, onError?: (message: string) => void) => Promise<boolean>
  testConnection: (
    config: MCPServerConfig,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ) => Promise<boolean>
  refreshStatuses: () => Promise<void>

  loadAllTools: () => Promise<void>
  getServerTools: (serverName: string) => MCPTool[]
  refreshServerTools: (serverName: string) => Promise<void>

  toggleServerExpanded: (serverName: string) => void
  isServerExpanded: (serverName: string) => boolean
  setSearchQuery: (query: string) => void
  clearSearch: () => void

  parseKeyValueText: (text: string) => Record<string, string>
  keyValueToText: (obj: Record<string, string>) => string
  buildConfig: () => MCPServerConfig
  validateConfig: (config: MCPServerConfig, existingNames: string[]) => string | null
  resetForm: () => void
  openCreateForm: () => void
  openEditForm: (config: MCPServerConfig) => void
  closeForm: () => void

  setupStatusListener: () => void
  cleanupStatusListener: () => void
}

const defaultFormData: MCPServerConfig = {
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  env: {},
  url: '',
  headers: {}
}

let statusListenerCleanup: (() => void) | null = null

export const useMCPStore = create<MCPState>()(
  persist(
    (set, get) => ({
      configs: [],
      statuses: [],
      toolsByServer: {},
      searchQuery: '',
      expandedServers: new Set(),
      showForm: false,
      editingConfig: null,
      formData: { ...defaultFormData },
      argsText: '',
      envText: '',
      headersText: '',
      loading: false,
      connecting: null,
      testing: null,
      error: null,

      totalToolsCount: () =>
        Object.values(get().toolsByServer).reduce((sum, tools) => sum + tools.length, 0),

      connectedServersCount: () => get().statuses.filter((s) => s.connected).length,

      filteredToolsByServer: () => {
        const state = get()
        if (!state.searchQuery.trim()) return state.toolsByServer

        const query = state.searchQuery.toLowerCase()
        const result: Record<string, MCPTool[]> = {}

        for (const [serverName, tools] of Object.entries(state.toolsByServer)) {
          const filtered = tools.filter(
            (tool) =>
              tool.name.toLowerCase().includes(query) ||
              tool.description.toLowerCase().includes(query)
          )
          if (filtered.length > 0) result[serverName] = filtered
        }

        return result
      },

      isOperating: () => {
        const state = get()
        return state.loading || state.connecting !== null || state.testing !== null
      },

      loadConfigs: async () => {
        set({ loading: true, error: null })
        try {
          const configs = await window.api.mcp.listConfigs()
          const statuses = await window.api.mcp.getStatus()
          set({ configs, statuses })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
        } finally {
          set({ loading: false })
        }
      },

      saveConfig: async (config) => {
        set({ loading: true, error: null })
        try {
          const result = await window.api.mcp.saveConfig(deepClone(config))
          if (result.success) {
            await get().loadConfigs()
            return true
          }
          set({ error: result.error || '保存失败' })
          return false
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
          return false
        } finally {
          set({ loading: false })
        }
      },

      deleteConfig: async (name) => {
        set({ loading: true, error: null })
        try {
          const result = await window.api.mcp.deleteConfig(name)
          if (result.success) {
            await get().loadConfigs()
            return true
          }
          set({ error: result.error || '删除失败' })
          return false
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
          return false
        } finally {
          set({ loading: false })
        }
      },

      getStatus: (name) => get().statuses.find((s) => s.serverName === name),

      isServerConnected: (serverName) => {
        const status = get().statuses.find((s) => s.serverName === serverName)
        return status?.connected ?? false
      },

      connect: async (name, onSuccess, onError) => {
        set({ connecting: name })
        try {
          const result = await window.api.mcp.connect(name)
          if (result.success) {
            await get().loadConfigs()
            onSuccess?.(`已连接到 ${name}`)
            return true
          }
          onError?.(result.error || '连接失败')
          return false
        } catch (e) {
          onError?.(e instanceof Error ? e.message : String(e))
          return false
        } finally {
          set({ connecting: null })
        }
      },

      disconnect: async (name, onError) => {
        try {
          const result = await window.api.mcp.disconnect(name)
          if (result.success) {
            await get().loadConfigs()
            return true
          }
          onError?.('断开连接失败')
          return false
        } catch {
          onError?.('断开连接失败')
          return false
        }
      },

      testConnection: async (config, onSuccess, onError) => {
        set({ testing: config.name })
        try {
          const result = await window.api.mcp.testConnection(deepClone(config))
          if (result.success) {
            onSuccess?.(`连接测试成功，找到 ${result.tools?.length || 0} 个工具`)
            return true
          }
          onError?.(result.error || '连接测试失败')
          return false
        } catch {
          onError?.('连接测试失败')
          return false
        } finally {
          set({ testing: null })
        }
      },

      refreshStatuses: async () => {
        try {
          const statuses = await window.api.mcp.getStatus()
          set({ statuses })
        } catch {
          // silent
        }
      },

      loadAllTools: async () => {
        try {
          const toolsByServer = await window.api.mcp.listToolsByServer()
          const statuses = await window.api.mcp.getStatus()
          set({ toolsByServer, statuses })
        } catch {
          // silent
        }
      },

      getServerTools: (serverName) => get().toolsByServer[serverName] || [],

      refreshServerTools: async (serverName) => {
        try {
          const allTools = await window.api.mcp.listToolsByServer()
          if (allTools[serverName]) {
            set((state) => ({
              toolsByServer: { ...state.toolsByServer, [serverName]: allTools[serverName] }
            }))
          }
        } catch {
          // silent
        }
      },

      toggleServerExpanded: (serverName) =>
        set((state) => {
          const next = new Set(state.expandedServers)
          if (next.has(serverName)) next.delete(serverName)
          else next.add(serverName)
          return { expandedServers: next }
        }),

      isServerExpanded: (serverName) => get().expandedServers.has(serverName),

      setSearchQuery: (query) => set({ searchQuery: query }),

      clearSearch: () => set({ searchQuery: '' }),

      parseKeyValueText: (text) => {
        const result: Record<string, string> = {}
        const lines = text.split('\n').filter((line) => line.trim())
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=')
          if (key && valueParts.length > 0) result[key.trim()] = valueParts.join('=').trim()
        }
        return result
      },

      keyValueToText: (obj) =>
        Object.entries(obj)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),

      buildConfig: () => {
        const state = get()
        return {
          ...state.formData,
          args: state.argsText
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s),
          env: state.parseKeyValueText(state.envText),
          headers: state.parseKeyValueText(state.headersText)
        }
      },

      validateConfig: (config, existingNames) => {
        if (!config.name.trim()) return '请输入服务器名称'

        const state = get()
        const namesToCheck = state.editingConfig
          ? existingNames.filter((n) => n !== state.editingConfig?.name)
          : existingNames

        if (namesToCheck.some((c) => c === config.name)) return '该名称已存在'

        if (config.transport === 'stdio') {
          if (!config.command?.trim()) return '请输入执行命令'
        } else {
          if (!config.url?.trim()) return '请输入服务地址'
        }

        return null
      },

      resetForm: () =>
        set({
          showForm: false,
          editingConfig: null,
          formData: { ...defaultFormData },
          argsText: '',
          envText: '',
          headersText: ''
        }),

      openCreateForm: () => {
        set({
          editingConfig: null,
          formData: { ...defaultFormData },
          argsText: '',
          envText: '',
          headersText: '',
          showForm: true
        })
      },

      openEditForm: (config) =>
        set({
          editingConfig: config,
          formData: { ...config },
          argsText: (config.args || []).join('\n'),
          envText: get().keyValueToText(config.env || {}),
          headersText: get().keyValueToText(config.headers || {}),
          showForm: true
        }),

      closeForm: () =>
        set({
          showForm: false,
          editingConfig: null,
          formData: { ...defaultFormData },
          argsText: '',
          envText: '',
          headersText: ''
        }),

      setupStatusListener: () => {
        if (statusListenerCleanup) statusListenerCleanup()

        statusListenerCleanup = window.api.mcp.onStatusChange(() => {
          get().refreshStatuses()
          get().loadAllTools()
        })
      },

      cleanupStatusListener: () => {
        if (statusListenerCleanup) {
          statusListenerCleanup()
          statusListenerCleanup = null
        }
      }
    }),
    {
      name: 'lumina-mcp-state',
      partialize: (state) => ({ expandedServers: state.expandedServers }),
      merge: (persisted, current) => ({
        ...current,
        expandedServers: (persisted as { expandedServers?: string[] })?.expandedServers
          ? new Set((persisted as { expandedServers: string[] }).expandedServers)
          : current.expandedServers
      }),
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name)
          if (!raw) return null
          const parsed = JSON.parse(raw)
          return {
            ...parsed,
            state: {
              expandedServers: Array.from(parsed.state?.expandedServers || [])
            }
          }
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              expandedServers: Array.from(value.state?.expandedServers || [])
            }
          }
          localStorage.setItem(name, JSON.stringify(toStore))
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
)
