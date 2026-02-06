/**
 * MCP Manager - 整合工具数据、搜索和选择功能
 * 作为 mcpStore 和 inputStateStore 的包装层，保持向后兼容
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { MCPTool, MCPConnectionStatus } from '@renderer/types'
import { useMCPStore, useInputStateStore } from '@renderer/stores'

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

  // 选择（从 inputStateStore 获取）
  selectedTools: ComputedRef<MCPTool[]>
  selectedToolsCount: ComputedRef<number>
  isToolSelected: (tool: MCPTool) => boolean
  toggleTool: (tool: MCPTool) => void
  removeTool: (tool: MCPTool) => void
  clearSelection: () => void
  getSelectedTools: () => MCPTool[]
} {
  const mcpStore = useMCPStore()
  const inputStateStore = useInputStateStore()

  // 从 mcpStore 获取响应式引用
  const { toolsByServer, statuses, searchQuery, expandedServers, filteredToolsByServer } =
    storeToRefs(mcpStore)

  // 兼容旧的命名
  const connectionStatuses = statuses

  // 计算属性
  const totalToolsCount = computed(() => mcpStore.totalToolsCount)
  const connectedServersCount = computed(() => mcpStore.connectedServersCount)

  // 工具数据
  const loadTools = mcpStore.loadAllTools
  const isServerConnected = mcpStore.isServerConnected
  const getServerTools = mcpStore.getServerTools

  // 搜索
  const toggleServer = mcpStore.toggleServerExpanded
  const isServerExpanded = mcpStore.isServerExpanded
  const clearSearch = mcpStore.clearSearch

  // 选择（从 inputStateStore 获取）
  const selectedTools = computed(() => inputStateStore.selectedMCPTools)
  const selectedToolsCount = computed(() => inputStateStore.selectedMCPTools.length)

  function isToolSelected(tool: MCPTool): boolean {
    return inputStateStore.selectedMCPTools.some(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )
  }

  function toggleTool(tool: MCPTool): void {
    inputStateStore.toggleToolSelection(tool)
  }

  function removeTool(tool: MCPTool): void {
    const currentTools = [...inputStateStore.selectedMCPTools]
    const index = currentTools.findIndex(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )
    if (index >= 0) {
      currentTools.splice(index, 1)
      inputStateStore.updateSelectedTools(currentTools)
    }
  }

  function clearSelection(): void {
    inputStateStore.clearSelectedTools()
  }

  function getSelectedTools(): MCPTool[] {
    return [...inputStateStore.selectedMCPTools]
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
