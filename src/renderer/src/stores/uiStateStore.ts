/**
 * UI 状态 Store
 * 管理应用界面状态（侧边栏、视图模式等）
 */

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useSessionStore } from './sessionStore'

/**
 * 视图类型
 */
export type ViewMode = 'chat' | 'knowledge'

export const useUIStateStore = defineStore(
  'uiState',
  () => {
    // ==================== Dependencies ====================

    const sessionStore = useSessionStore()

    // ==================== State ====================

    /**
     * 侧边栏是否折叠
     */
    const sidebarCollapsed = ref(false)

    /**
     * 当前视图模式
     */
    const currentView = ref<ViewMode>('chat')

    /**
     * 当前模型
     */
    const currentModel = ref('')

    /**
     * 最后访问的聊天会话 ID
     */
    const lastChatSessionId = ref<string | null>(null)

    // ==================== Getters ====================

    /**
     * 是否在聊天视图
     */
    const isChatView = computed(() => currentView.value === 'chat')

    /**
     * 是否在知识库视图
     */
    const isKnowledgeView = computed(() => currentView.value === 'knowledge')

    // ==================== Actions ====================

    /**
     * 切换侧边栏状态
     */
    function toggleSidebar(): void {
      sidebarCollapsed.value = !sidebarCollapsed.value
      window.api.logger.debug('[UIStateStore] 切换侧边栏', {
        collapsed: sidebarCollapsed.value
      })
    }

    /**
     * 设置侧边栏折叠状态
     * @param collapsed - 是否折叠
     */
    function setSidebarCollapsed(collapsed: boolean): void {
      sidebarCollapsed.value = collapsed
    }

    /**
     * 设置当前模型
     * @param model - 模型名称
     */
    function setCurrentModel(model: string): void {
      currentModel.value = model
      window.api.logger.debug('[UIStateStore] 设置当前模型', { model })
    }

    /**
     * 切换到聊天视图
     * @param restoreSession - 是否恢复上次会话
     */
    async function switchToChatView(restoreSession: boolean = true): Promise<void> {
      const previousView = currentView.value

      if (previousView !== 'chat') {
        window.api.logger.info('[UIStateStore] 切换到聊天视图')
      }

      currentView.value = 'chat'

      // 恢复上次会话
      if (restoreSession && lastChatSessionId.value) {
        await sessionStore.restoreStateAfterReturn(lastChatSessionId.value)
      }
    }

    /**
     * 切换到知识库视图
     * @param saveSessionState - 是否保存当前会话状态
     */
    async function switchToKnowledgeView(saveSessionState: boolean = true): Promise<void> {
      const previousView = currentView.value

      if (previousView === 'chat' && saveSessionState) {
        // 保存当前聊天会话状态
        if (sessionStore.currentChatId) {
          lastChatSessionId.value = sessionStore.currentChatId
          await sessionStore.saveCurrentStateBeforeLeave()

          window.api.logger.info('[UIStateStore] 离开聊天视图，保存状态', {
            sessionId: sessionStore.currentChatId
          })
        }
      }

      currentView.value = 'knowledge'
      window.api.logger.info('[UIStateStore] 切换到知识库视图')
    }

    /**
     * 设置当前视图
     * @param view - 视图模式
     * @param autoHandleState - 是否自动处理状态保存/恢复
     */
    async function setCurrentView(view: ViewMode, autoHandleState: boolean = true): Promise<void> {
      if (currentView.value === view) return

      if (view === 'chat') {
        await switchToChatView(autoHandleState)
      } else {
        await switchToKnowledgeView(autoHandleState)
      }
    }

    /**
     * 更新最后访问的会话 ID
     * @param sessionId - 会话 ID
     */
    function updateLastChatSessionId(sessionId: string | null): void {
      lastChatSessionId.value = sessionId
    }

    // ==================== View Change Watchers ====================

    /**
     * 监听视图变化，确保状态正确保存
     */
    watch(
      () => currentView.value,
      async (newView, oldView) => {
        window.api.logger.debug('[UIStateStore] 视图变化', {
          from: oldView,
          to: newView
        })
      }
    )

    return {
      // State
      sidebarCollapsed,
      currentView,
      currentModel,
      lastChatSessionId,
      // Getters
      isChatView,
      isKnowledgeView,
      // Actions
      toggleSidebar,
      setSidebarCollapsed,
      setCurrentModel,
      switchToChatView,
      switchToKnowledgeView,
      setCurrentView,
      updateLastChatSessionId
    }
  },
  {
    // 持久化配置
    persist: {
      key: 'sparrow-ui-state',
      // 只持久化 UI 偏好设置
      pick: ['sidebarCollapsed', 'lastChatSessionId']
    }
  }
)
