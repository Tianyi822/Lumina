import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { MCPTool, MCPConnectionStatus } from '@renderer/types'

/**
 * MCP Manager - 整合工具数据、搜索和选择功能
 */
export function useMCPManager(): {
  // 工具数据
  toolsByServer: Ref<Record<string, MCPTool[]>>
  connectionStatuses: Ref<MCPConnectionStatus[]>
  totalToolsCount: ComputedRef<number>
  connectedServersCount: ComputedRef<number>
  loadTools: () => Promise<void>
  isServerConnected: (serverName: string) => boolean
  getServerTools: (serverName: string) => MCPTool[]

  // 搜索
  searchQuery: Ref<string>
  expandedServers: Ref<Set<string>>
  filteredToolsByServer: ComputedRef<Record<string, MCPTool[]>>
  toggleServer: (serverName: string) => void
  isServerExpanded: (serverName: string) => boolean
  clearSearch: () => void

  // 选择
  selectedTools: Ref<MCPTool[]>
  selectedToolsCount: ComputedRef<number>
  isToolSelected: (tool: MCPTool) => boolean
  toggleTool: (tool: MCPTool) => void
  removeTool: (tool: MCPTool) => void
  clearSelection: () => void
  getSelectedTools: () => MCPTool[]
} {
  // ==================== 工具数据 ====================
  const toolsByServer = ref<Record<string, MCPTool[]>>({})
  const connectionStatuses = ref<MCPConnectionStatus[]>([])

  const totalToolsCount = computed(() => {
    return Object.values(toolsByServer.value).reduce((sum, tools) => sum + tools.length, 0)
  })

  const connectedServersCount = computed(() => {
    return connectionStatuses.value.filter((s) => s.connected).length
  })

  async function loadTools(): Promise<void> {
    try {
      toolsByServer.value = await window.api.mcp.listToolsByServer()
      connectionStatuses.value = await window.api.mcp.getStatus()
    } catch (error) {
      console.error('加载 MCP 工具失败:', error)
    }
  }

  function isServerConnected(serverName: string): boolean {
    const status = connectionStatuses.value.find((s) => s.serverName === serverName)
    return status?.connected ?? false
  }

  function getServerTools(serverName: string): MCPTool[] {
    return toolsByServer.value[serverName] || []
  }

  // ==================== 搜索 ====================
  const searchQuery = ref('')
  const expandedServers = ref<Set<string>>(new Set())

  const filteredToolsByServer = computed(() => {
    if (!searchQuery.value.trim()) {
      return toolsByServer.value
    }

    const query = searchQuery.value.toLowerCase()
    const result: Record<string, MCPTool[]> = {}

    for (const [serverName, tools] of Object.entries(toolsByServer.value)) {
      const filtered = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query)
      )
      if (filtered.length > 0) {
        result[serverName] = filtered
      }
    }

    return result
  })

  function toggleServer(serverName: string): void {
    if (expandedServers.value.has(serverName)) {
      expandedServers.value.delete(serverName)
    } else {
      expandedServers.value.add(serverName)
    }
  }

  function isServerExpanded(serverName: string): boolean {
    return expandedServers.value.has(serverName)
  }

  function clearSearch(): void {
    searchQuery.value = ''
  }

  // ==================== 选择 ====================
  const selectedTools = ref<MCPTool[]>([])

  const selectedToolsCount = computed(() => {
    return selectedTools.value.length
  })

  function isToolSelected(tool: MCPTool): boolean {
    return selectedTools.value.some((t) => t.name === tool.name && t.serverName === tool.serverName)
  }

  function toggleTool(tool: MCPTool): void {
    const index = selectedTools.value.findIndex(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )

    if (index >= 0) {
      selectedTools.value.splice(index, 1)
    } else {
      selectedTools.value.push(tool)
    }

    console.log('[MCPManager] 工具选择变更:', {
      action: index >= 0 ? 'removed' : 'added',
      tool: `${tool.serverName}/${tool.name}`,
      selectedCount: selectedTools.value.length,
      selectedTools: selectedTools.value.map((t) => `${t.serverName}/${t.name}`)
    })
  }

  function removeTool(tool: MCPTool): void {
    const index = selectedTools.value.findIndex(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )
    if (index >= 0) {
      selectedTools.value.splice(index, 1)
    }
  }

  function clearSelection(): void {
    selectedTools.value = []
  }

  function getSelectedTools(): MCPTool[] {
    return [...selectedTools.value]
  }

  return {
    // 工具数据
    toolsByServer,
    connectionStatuses,
    totalToolsCount,
    connectedServersCount,
    loadTools,
    isServerConnected,
    getServerTools,

    // 搜索
    searchQuery,
    expandedServers,
    filteredToolsByServer,
    toggleServer,
    isServerExpanded,
    clearSearch,

    // 选择
    selectedTools,
    selectedToolsCount,
    isToolSelected,
    toggleTool,
    removeTool,
    clearSelection,
    getSelectedTools
  }
}
