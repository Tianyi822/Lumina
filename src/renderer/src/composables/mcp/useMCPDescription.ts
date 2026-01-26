import { ref, nextTick, type Ref } from 'vue'
import type { MCPTool } from '@renderer/types'

export function useMCPDescription(): {
  expandedDescriptions: Ref<Set<string>>
  showExpandButton: Ref<Set<string>>
  descriptionRefs: Ref<Map<string, HTMLElement>>
  toggleDescription: (tool: MCPTool) => void
  isDescriptionExpanded: (tool: MCPTool) => boolean
  shouldShowExpandButton: (tool: MCPTool) => boolean
  setDescriptionRef: (tool: MCPTool, element: unknown) => void
  refreshAllOverflowChecks: () => void
  clearAllStates: () => void
} {
  // 工具描述展开状态
  const expandedDescriptions = ref<Set<string>>(new Set())

  // 需要显示展开按钮的工具描述
  const showExpandButton = ref<Set<string>>(new Set())

  // 工具描述元素引用
  const descriptionRefs = ref<Map<string, HTMLElement>>(new Map())

  /**
   * 切换工具描述展开状态
   */
  function toggleDescription(tool: MCPTool): void {
    const key = `${tool.serverName}-${tool.name}`
    if (expandedDescriptions.value.has(key)) {
      expandedDescriptions.value.delete(key)
    } else {
      expandedDescriptions.value.add(key)
    }
  }

  /**
   * 检查工具描述是否展开
   */
  function isDescriptionExpanded(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return expandedDescriptions.value.has(key)
  }

  /**
   * 检查是否需要显示展开按钮
   */
  function shouldShowExpandButton(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return showExpandButton.value.has(key)
  }

  /**
   * 检查描述元素是否溢出
   */
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

  /**
   * 设置描述元素引用并检查溢出
   */
  function setDescriptionRef(tool: MCPTool, element: unknown): void {
    if (!element || typeof element === 'function') return

    // 确保是 DOM 元素
    const domElement = element as HTMLElement
    const key = `${tool.serverName}-${tool.name}`
    descriptionRefs.value.set(key, domElement)

    // 在 nextTick 中检查，确保样式已应用
    nextTick(() => {
      checkDescriptionOverflow(tool, domElement)
    })
  }

  /**
   * 切换服务器展开状态时，重新检查所有工具描述的溢出状态
   */
  function refreshAllOverflowChecks(): void {
    nextTick(() => {
      descriptionRefs.value.forEach((element, key) => {
        const [serverName, toolName] = key.split('-')
        const tool: MCPTool = {
          name: toolName,
          serverName,
          description: '',
          inputSchema: {}
        }
        checkDescriptionOverflow(tool, element)
      })
    })
  }

  /**
   * 清除所有状态
   */
  function clearAllStates(): void {
    showExpandButton.value.clear()
    descriptionRefs.value.clear()
    expandedDescriptions.value.clear()
  }

  return {
    expandedDescriptions,
    showExpandButton,
    descriptionRefs,
    toggleDescription,
    isDescriptionExpanded,
    shouldShowExpandButton,
    setDescriptionRef,
    refreshAllOverflowChecks,
    clearAllStates
  }
}
