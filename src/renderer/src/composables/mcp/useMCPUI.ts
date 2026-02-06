import { ref, nextTick, onMounted, onUnmounted, type Ref } from 'vue'
import type { MCPTool } from '@renderer/types'

/**
 * MCP 工具面板的 UI 交互管理
 *
 * 这个 Composable 管理了 MCP 工具面板的所有 UI 交互，包括面板开关、工具描述展开/收起、工具滚动高亮等功能。
 * 之前这些功能分散在三个独立的 composable 中（useMCPPanelState、useMCPDescription、useMCPToolHighlight），
 * 现在整合在一起，简化了组件的使用。
 *
 * @param loadToolsCallback - 打开面板时加载工具列表的回调函数
 * @param expandedServers - 服务器展开状态的响应式引用，用于检测服务器是否已展开
 * @returns 包含面板状态、描述管理、工具高亮等功能的对象
 */
export function useMCPUI(
  loadToolsCallback: () => Promise<void>,
  expandedServers: Ref<Set<string>>
): {
  /** 面板是否显示 */
  showPanel: Ref<boolean>
  /** 面板容器的 DOM 引用，用于点击外部检测 */
  mcpContainerRef: Ref<HTMLElement | null>
  /** 切换面板显示/隐藏，打开时自动加载工具列表 */
  togglePanel: () => void

  /** 已展开描述的工具列表（key 格式：{serverName}-{toolName}） */
  expandedDescriptions: Ref<Set<string>>
  /** 需要显示展开按钮的工具列表（溢出检测通过后自动加入） */
  showExpandButton: Ref<Set<string>>
  /** 工具描述元素的 DOM 引用映射，用于溢出检测 */
  descriptionRefs: Ref<Map<string, HTMLElement>>
  /** 切换工具描述的展开/收起状态 */
  toggleDescription: (tool: MCPTool) => void
  /** 检查工具描述是否已展开 */
  isDescriptionExpanded: (tool: MCPTool) => boolean
  /** 检查工具描述是否需要显示展开按钮 */
  shouldShowExpandButton: (tool: MCPTool) => boolean
  /** 设置工具描述元素的 DOM 引用，触发溢出检测 */
  setDescriptionRef: (tool: MCPTool, element: unknown) => void
  /** 刷新所有工具描述的溢出状态，在 DOM 更新后调用 */
  refreshAllOverflowChecks: () => void
  /** 清空所有描述相关状态，用于工具列表刷新后重置 */
  clearAllStates: () => void

  /** 滚动到指定工具并高亮显示 */
  scrollToTool: (tool: MCPTool) => void
} {
  // 面板管理
  const showPanel = ref(false)
  const mcpContainerRef = ref<HTMLElement | null>(null)

  /**
   * 切换面板的显示/隐藏状态
   * 打开面板时自动调用 loadToolsCallback 加载工具列表
   */
  function togglePanel(): void {
    showPanel.value = !showPanel.value
    if (showPanel.value) {
      loadToolsCallback()
    }
  }

  /**
   * 处理点击外部区域关闭面板
   * 当用户点击面板外部时自动关闭面板
   */
  function handleClickOutside(event: MouseEvent): void {
    if (showPanel.value && mcpContainerRef.value) {
      const target = event.target as Node
      if (!mcpContainerRef.value.contains(target)) {
        showPanel.value = false
      }
    }
  }

  /**
   * 组件挂载时注册全局点击监听
   */
  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })

  /**
   * 组件卸载时移除全局点击监听，避免内存泄漏
   */
  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  // 描述展开/收起管理
  const expandedDescriptions = ref<Set<string>>(new Set())
  const showExpandButton = ref<Set<string>>(new Set())
  const descriptionRefs = ref<Map<string, HTMLElement>>(new Map())

  /**
   * 切换工具描述的展开/收起状态
   * @param tool - 要切换的工具对象
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
   * 检查工具描述是否已展开
   * @param tool - 要检查的工具对象
   * @returns 是否已展开
   */
  function isDescriptionExpanded(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return expandedDescriptions.value.has(key)
  }

  /**
   * 检查工具描述是否需要显示展开按钮
   * @param tool - 要检查的工具对象
   * @returns 是否需要显示展开按钮
   */
  function shouldShowExpandButton(tool: MCPTool): boolean {
    const key = `${tool.serverName}-${tool.name}`
    return showExpandButton.value.has(key)
  }

  /**
   * 检测工具描述是否溢出，决定是否显示展开按钮
   * 溢出检测逻辑：临时移除 expanded 类，检测真实高度，然后恢复状态
   * @param tool - 要检测的工具对象
   * @param element - 描述元素的 DOM 引用
   */
  function checkDescriptionOverflow(tool: MCPTool, element: HTMLElement | null): void {
    if (!element) {
      return
    }

    const key = `${tool.serverName}-${tool.name}`

    // 先保存当前的展开状态，然后临时移除 expanded 类
    const wasExpanded = element.classList.contains('expanded')
    if (wasExpanded) {
      element.classList.remove('expanded')
    }

    // 检测内容是否溢出：scrollHeight > clientHeight 表示内容超出了可见区域
    const hasOverflow = element.scrollHeight > element.clientHeight

    // 恢复原来的展开状态
    if (wasExpanded) {
      element.classList.add('expanded')
    }

    // 只有内容溢出时才显示展开按钮，且一旦显示就不再隐藏
    if (hasOverflow) {
      showExpandButton.value.add(key)
    }
  }

  /**
   * 设置工具描述元素的 DOM 引用，并在下一帧执行溢出检测
   * @param tool - 要设置引用的工具对象
   * @param element - Vue ref 传递的元素，可能是函数或 DOM 元素
   */
  function setDescriptionRef(tool: MCPTool, element: unknown): void {
    if (!element || typeof element === 'function') return

    const domElement = element as HTMLElement
    const key = `${tool.serverName}-${tool.name}`
    descriptionRefs.value.set(key, domElement)

    // 等待 DOM 更新后检测溢出状态
    nextTick(() => {
      checkDescriptionOverflow(tool, domElement)
    })
  }

  /**
   * 刷新所有工具描述的溢出状态
   * 在搜索、筛选等操作改变列表布局后调用，重新检测哪些描述需要展开按钮
   */
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

  /**
   * 清空所有描述相关状态
   * 在工具列表刷新时调用，清除旧的 DOM 引用和状态
   */
  function clearAllStates(): void {
    showExpandButton.value.clear()
    descriptionRefs.value.clear()
    expandedDescriptions.value.clear()
  }

  // 工具滚动高亮
  /**
   * 滚动到指定工具并高亮显示
   * 如果工具所在的服务器未展开，先展开服务器，等待 DOM 更新后再滚动
   * 高亮效果持续 1.5 秒后自动消失
   * @param tool - 要滚动到的工具对象
   */
  function scrollToTool(tool: MCPTool): void {
    const toolElementId = `tool-${tool.serverName}-${tool.name}`
    const toolElement = document.getElementById(toolElementId)

    if (toolElement) {
      // 检查工具所在的服务器是否已展开
      if (!expandedServers.value.has(tool.serverName)) {
        // 如果未展开，先展开服务器
        expandedServers.value.add(tool.serverName)

        // 等待 DOM 更新后再滚动（100ms 足够让 Vue 完成重新渲染）
        setTimeout(() => {
          const element = document.getElementById(toolElementId)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            element.classList.add('highlight')

            // 1.5 秒后移除高亮样式
            setTimeout(() => {
              element.classList.remove('highlight')
            }, 1500)
          }
        }, 100)
      } else {
        // 服务器已展开，直接滚动到工具位置
        toolElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        toolElement.classList.add('highlight')

        // 1.5 秒后移除高亮样式
        setTimeout(() => {
          toolElement.classList.remove('highlight')
        }, 1500)
      }
    }
  }

  return {
    // 面板管理相关
    showPanel,
    mcpContainerRef,
    togglePanel,

    // 描述展开相关
    expandedDescriptions,
    showExpandButton,
    descriptionRefs,
    toggleDescription,
    isDescriptionExpanded,
    shouldShowExpandButton,
    setDescriptionRef,
    refreshAllOverflowChecks,
    clearAllStates,

    // 工具滚动高亮
    scrollToTool
  }
}
