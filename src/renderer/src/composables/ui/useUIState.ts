import { ref } from 'vue'

/**
 * 视图类型
 */
export type ViewMode = 'chat' | 'knowledge'

/**
 * UI 状态管理 Composable
 * 负责应用界面状态（侧边栏、视图模式等）
 */
export function useUIState() {
  // 侧边栏是否折叠
  const sidebarCollapsed = ref(false)

  // 当前视图模式
  const currentView = ref<ViewMode>('chat')

  // 当前模型
  const currentModel = ref('')

  /**
   * 切换侧边栏状态
   */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /**
   * 设置当前模型
   */
  function setCurrentModel(model: string): void {
    currentModel.value = model
  }

  /**
   * 切换到聊天视图
   */
  function switchToChatView(): void {
    currentView.value = 'chat'
  }

  /**
   * 切换到知识库视图
   */
  function switchToKnowledgeView(): void {
    currentView.value = 'knowledge'
  }

  return {
    sidebarCollapsed,
    currentView,
    currentModel,
    toggleSidebar,
    setCurrentModel,
    switchToChatView,
    switchToKnowledgeView
  }
}
