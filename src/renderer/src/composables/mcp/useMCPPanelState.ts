import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export function useMCPPanelState(loadToolsCallback: () => Promise<void>): {
  showPanel: Ref<boolean>
  mcpContainerRef: Ref<HTMLElement | null>
  togglePanel: () => void
} {
  // 是否显示面板
  const showPanel = ref(false)

  // MCP 工具容器引用
  const mcpContainerRef = ref<HTMLElement | null>(null)

  /**
   * 切换面板显示
   */
  function togglePanel(): void {
    showPanel.value = !showPanel.value
    if (showPanel.value) {
      loadToolsCallback()
    }
  }

  /**
   * 处理点击外部区域，关闭面板
   */
  function handleClickOutside(event: MouseEvent): void {
    if (showPanel.value && mcpContainerRef.value) {
      const target = event.target as Node
      if (!mcpContainerRef.value.contains(target)) {
        showPanel.value = false
      }
    }
  }

  onMounted(() => {
    // 添加全局点击事件监听器
    document.addEventListener('click', handleClickOutside)
  })

  onUnmounted(() => {
    // 移除全局点击事件监听器
    document.removeEventListener('click', handleClickOutside)
  })

  return {
    showPanel,
    mcpContainerRef,
    togglePanel
  }
}
