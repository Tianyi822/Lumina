import { ref, computed } from 'vue'
import type { MCPTool } from '@renderer/types'

export function useMCPToolsSelection() {
  // 选中的工具列表(支持多选)
  const selectedTools = ref<MCPTool[]>([])

  // 已选择的工具数量
  const selectedToolsCount = computed(() => {
    return selectedTools.value.length
  })

  /**
   * 检查工具是否被选中
   */
  function isToolSelected(tool: MCPTool): boolean {
    return selectedTools.value.some((t) => t.name === tool.name && t.serverName === tool.serverName)
  }

  /**
   * 选择/取消选择工具(多选模式)
   */
  function toggleTool(tool: MCPTool): void {
    const index = selectedTools.value.findIndex(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )

    if (index >= 0) {
      // 取消选择
      selectedTools.value.splice(index, 1)
    } else {
      // 添加选择
      selectedTools.value.push(tool)
    }

    // 调试日志
    console.log('[MCPToolsPanel] 工具选择变更:', {
      action: index >= 0 ? 'removed' : 'added',
      tool: `${tool.serverName}/${tool.name}`,
      selectedCount: selectedTools.value.length,
      selectedTools: selectedTools.value.map((t) => `${t.serverName}/${t.name}`)
    })
  }

  /**
   * 移除单个工具
   */
  function removeTool(tool: MCPTool): void {
    const index = selectedTools.value.findIndex(
      (t) => t.name === tool.name && t.serverName === tool.serverName
    )
    if (index >= 0) {
      selectedTools.value.splice(index, 1)
    }
  }

  /**
   * 清除所有选择
   */
  function clearSelection(): void {
    selectedTools.value = []
  }

  /**
   * 获取选中的工具列表
   */
  function getSelectedTools(): MCPTool[] {
    return [...selectedTools.value]
  }

  return {
    selectedTools,
    selectedToolsCount,
    isToolSelected,
    toggleTool,
    removeTool,
    clearSelection,
    getSelectedTools
  }
}
