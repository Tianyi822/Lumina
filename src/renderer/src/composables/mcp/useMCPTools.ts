import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { MCPTool, MCPConnectionStatus } from '@renderer/types'

export function useMCPTools() {
  // 工具按服务器分组
  const toolsByServer = ref<Record<string, MCPTool[]>>({})

  // 连接状态
  const connectionStatuses = ref<MCPConnectionStatus[]>([])

  // 总工具数量
  const totalToolsCount = computed(() => {
    return Object.values(toolsByServer.value).reduce((sum, tools) => sum + tools.length, 0)
  })

  // 已连接服务器数量
  const connectedServersCount = computed(() => {
    return connectionStatuses.value.filter((s) => s.connected).length
  })

  /**
   * 加载工具列表
   */
  async function loadTools(): Promise<void> {
    try {
      toolsByServer.value = await window.api.mcp.listToolsByServer()
      connectionStatuses.value = await window.api.mcp.getStatus()
    } catch (error) {
      console.error('加载 MCP 工具失败:', error)
    }
  }

  /**
   * 获取服务器连接状态
   */
  function isServerConnected(serverName: string): boolean {
    const status = connectionStatuses.value.find((s) => s.serverName === serverName)
    return status?.connected ?? false
  }

  /**
   * 获取服务器工具列表
   */
  function getServerTools(serverName: string): MCPTool[] {
    return toolsByServer.value[serverName] || []
  }

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
