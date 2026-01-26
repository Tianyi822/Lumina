import { ref, computed, type Ref } from 'vue'
import type { MCPTool } from '@renderer/types'

export function useMCPSearch(toolsByServer: Ref<Record<string, MCPTool[]>>) {
  // 搜索关键词
  const searchQuery = ref('')

  // 展开的服务器
  const expandedServers = ref<Set<string>>(new Set())

  /**
   * 过滤后的工具
   */
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

  /**
   * 切换服务器展开状态
   */
  function toggleServer(serverName: string): void {
    if (expandedServers.value.has(serverName)) {
      expandedServers.value.delete(serverName)
    } else {
      expandedServers.value.add(serverName)
    }
  }

  /**
   * 检查服务器是否展开
   */
  function isServerExpanded(serverName: string): boolean {
    return expandedServers.value.has(serverName)
  }

  /**
   * 清除搜索
   */
  function clearSearch(): void {
    searchQuery.value = ''
  }

  return {
    searchQuery,
    expandedServers,
    filteredToolsByServer,
    toggleServer,
    isServerExpanded,
    clearSearch
  }
}
