import { ref, nextTick, onMounted, onUnmounted, type Ref } from 'vue'
import type { MCPTool } from '@renderer/types'

/**
 * MCP UI - 整合面板状态、描述展开和工具高亮功能
 */
export function useMCPUI(
  loadToolsCallback: () => Promise<void>,
  expandedServers: Ref<Set<string>>
): {
  // 面板
  showPanel: Ref<boolean>
  mcpContainerRef: Ref<HTMLElement | null>
  togglePanel: () => void

  // 描述
  expandedDescriptions: Ref<Set<string>>
  showExpandButton: Ref<Set<string>>
  descriptionRefs: Ref<Map<string, HTMLElement>>
  toggleDescription: (tool: MCPTool) => void
  isDescriptionExpanded: (tool: MCPTool) => boolean
  shouldShowExpandButton: (tool: MCPTool) => boolean
  setDescriptionRef: (tool: MCPTool, element: unknown) => void
  refreshAllOverflowChecks: () => void
  clearAllStates: () => void

  // 高亮
  scrollToTool: (tool: MCPTool) => void
} {
  // ==================== 面板 ====================
  const showPanel = ref(false)
  const mcpContainerRef = ref<HTMLElement | null>(null)

  function togglePanel(): void {
    showPanel.value = !showPanel.value
    if (showPanel.value) {
      loadToolsCallback()
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    if (showPanel.value && mcpContainerRef.value) {
      const target = event.target as Node
      if (!mcpContainerRef.value.contains(target)) {
        showPanel.value = false
      }
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  // ==================== 描述 ====================
  const expandedDescriptions = ref<Set<string>>(new Set())
  const showExpandButton = ref<Set<string>>(new Set())
  const descriptionRefs = ref<Map<string, HTMLElement>>(new Map())

  function toggleDescription(tool: MCPTool): void {
    const key = `${tool.serverName}-${tool.name}`
    if (expandedDescriptions.value.has(key)) {
      expandedDescriptions.value.delete(key)
    } else {
      expandedDescriptions.value.add(key)
    }
  }

  function isDescriptionExpanded(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return expandedDescriptions.value.has(key)
  }

  function shouldShowExpandButton(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return showExpandButton.value.has(key)
  }

  function checkDescriptionOverflow(tool: MCPTool, element: HTMLElement | null): void {
    if (!element) {
      return
    }

    const key = `${tool.serverName}-${tool.name}`

    // 临时移除expanded类来检测真实溢出状态
    const wasExpanded = element.classList.contains('expanded')
    if (wasExpanded) {
      element.classList.remove('expanded')
    }

    // 检测内容是否溢出（scrollHeight > clientHeight）
    const hasOverflow = element.scrollHeight > element.clientHeight

    // 恢复expanded状态
    if (wasExpanded) {
      element.classList.add('expanded')
    }

    // 只有在内容溢出时才显示按钮，且一旦显示就不再隐藏
    if (hasOverflow) {
      showExpandButton.value.add(key)
    }
  }

  function setDescriptionRef(tool: MCPTool, element: unknown): void {
    if (!element || typeof element === 'function') return

    const domElement = element as HTMLElement
    const key = `${tool.serverName}-${tool.name}`
    descriptionRefs.value.set(key, domElement)

    nextTick(() => {
      checkDescriptionOverflow(tool, domElement)
    })
  }

  function refreshAllOverflowChecks(): void {
    nextTick(() => {
      descriptionRefs.value.forEach((element, key) => {
        const [serverName, toolName] = key.split('-')
        const tool: MCPTool = {
          name: toolName,
          serverName,
          description: '',
          inputSchema: { type: 'object' }
        }
        checkDescriptionOverflow(tool, element)
      })
    })
  }

  function clearAllStates(): void {
    showExpandButton.value.clear()
    descriptionRefs.value.clear()
    expandedDescriptions.value.clear()
  }

  // ==================== 高亮 ====================
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
            element.classList.add('highlight')
            setTimeout(() => {
              element.classList.remove('highlight')
            }, 1500)
          }
        }, 100)
      } else {
        // 直接滚动
        toolElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        toolElement.classList.add('highlight')
        setTimeout(() => {
          toolElement.classList.remove('highlight')
        }, 1500)
      }
    }
  }

  return {
    // 面板
    showPanel,
    mcpContainerRef,
    togglePanel,

    // 描述
    expandedDescriptions,
    showExpandButton,
    descriptionRefs,
    toggleDescription,
    isDescriptionExpanded,
    shouldShowExpandButton,
    setDescriptionRef,
    refreshAllOverflowChecks,
    clearAllStates,

    // 高亮
    scrollToTool
  }
}
