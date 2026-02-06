/**
 * MCP Tools - 工具数据加载
 * 作为 mcpStore 的包装层，保持向后兼容
 */

import { computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { MCPTool, MCPConnectionStatus } from '@renderer/types'
import { useMCPStore } from '@renderer/stores'

export function useMCPTools(): {
  toolsByServer: Ref<Record<string, MCPTool[]>>
  connectionStatuses: Ref<MCPConnectionStatus[]>
  totalToolsCount: ComputedRef<number>
  connectedServersCount: ComputedRef<number>
  loadTools: () => Promise<void>
  isServerConnected: (serverName: string) => boolean
  getServerTools: (serverName: string) => MCPTool[]
} {
  const mcpStore = useMCPStore()

  // 从 Store 获取响应式引用
  const { toolsByServer, statuses } = storeToRefs(mcpStore)

  // 兼容旧的命名
  const connectionStatuses = statuses

  // 计算属性
  const totalToolsCount = computed(() => mcpStore.totalToolsCount)
  const connectedServersCount = computed(() => mcpStore.connectedServersCount)

  // 方法
  const loadTools = mcpStore.loadAllTools
  const isServerConnected = mcpStore.isServerConnected
  const getServerTools = mcpStore.getServerTools

  return {
    toolsByServer,
    connectionStatuses,
    totalToolsCount,
    connectedServersCount,
    loadTools,
    isServerConnected,
    getServerTools
  }
}
