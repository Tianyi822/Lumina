import type { Ref } from 'vue'
import type { MCPTool } from '@renderer/types'

export function useMCPToolHighlight(expandedServers: Ref<Set<string>>): {
  scrollToTool: (tool: MCPTool) => void
} {
  /**
   * 滚动到指定工具的位置
   */
  function scrollToTool(tool: MCPTool): void {
    const toolElementId = `tool-${tool.serverName}-${tool.name}`
    const toolElement = document.getElementById(toolElementId)

    if (toolElement) {
      // 确保服务器已展开
      if (!expandedServers.value.has(tool.serverName)) {
        expandedServers.value.add(tool.serverName)
        // 等待 DOM 更新后再滚动
        setTimeout(() => {
          const element = document.getElementById(toolElementId)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // 添加高亮动画
            element.classList.add('highlight')
            setTimeout(() => {
              element.classList.remove('highlight')
            }, 1500)
          }
        }, 100)
      } else {
        // 直接滚动
        toolElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 添加高亮动画
        toolElement.classList.add('highlight')
        setTimeout(() => {
          toolElement.classList.remove('highlight')
        }, 1500)
      }
    }
  }

  return {
    scrollToTool
  }
}
