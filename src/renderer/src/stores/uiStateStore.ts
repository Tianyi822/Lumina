/**
 * UI 状态 Store
 * 管理应用界面状态（侧边栏、视图模式、配置通知、错误提示等）
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

    // ==================== State: 基础 UI ====================

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

    // ==================== State: 配置更新通知 ====================

    /**
     * 配置更新计数器（用于触发组件刷新）
     */
    const configUpdateKey = ref(0)

    /**
     * MCP 配置更新计数器
     */
    const mcpUpdateKey = ref(0)

    // ==================== State: 错误提示 ====================

    /**
     * 配置错误信息
     */
    const configError = ref<string | null>(null)

    /**
     * 是否显示配置错误
     */
    const showConfigError = ref(false)

    /**
     * 聊天错误信息
     */
    const chatError = ref<string | null>(null)

    /**
     * 是否显示聊天错误
     */
    const showChatError = ref(false)

    // ==================== Getters ====================

    /**
     * 是否在聊天视图
     */
    const isChatView = computed(() => currentView.value === 'chat')

    /**
     * 是否在知识库视图
     */
    const isKnowledgeView = computed(() => currentView.value === 'knowledge')

    /**
     * 是否有任何错误显示
     */
    const hasAnyError = computed(() => showConfigError.value || showChatError.value)

    // ==================== Actions: 侧边栏 ====================

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

    // ==================== Actions: 配置更新通知 ====================

    /**
     * 触发配置更新通知
     */
    function notifyConfigUpdate(): void {
      configUpdateKey.value++
      window.api.logger?.debug('[UIStateStore] 配置更新通知', { key: configUpdateKey.value })
    }

    /**
     * 触发 MCP 配置更新通知
     */
    function notifyMcpUpdate(): void {
      mcpUpdateKey.value++
      window.api.logger?.debug('[UIStateStore] MCP 配置更新通知', { key: mcpUpdateKey.value })
    }

    // ==================== Actions: 错误管理 ====================

    /**
     * 显示配置错误
     */
    function showConfigErrorMessage(message: string): void {
      configError.value = message
      showConfigError.value = true
      window.api.logger?.warn('[UIStateStore] 显示配置错误', { message })
    }

    /**
     * 显示聊天错误
     */
    function showChatErrorMessage(message: string): void {
      chatError.value = message
      showChatError.value = true
      window.api.logger?.warn('[UIStateStore] 显示聊天错误', { message })
    }

    /**
     * 处理聊天错误（根据错误类型路由到不同的提示）
     */
    function handleChatError(error: string): void {
      if (error.includes('请先选择一个模型') || error.includes('配置')) {
        configError.value = error
        showConfigError.value = true
      } else {
        showChatErrorMessage(error)
      }
    }

    /**
     * 关闭配置错误
     */
    function dismissConfigError(): void {
      showConfigError.value = false
      configError.value = null
    }

    /**
     * 关闭聊天错误
     */
    function dismissChatError(): void {
      showChatError.value = false
      chatError.value = null
    }

    /**
     * 简化方法名：关闭聊天错误（别名）
     */
    function closeChatError(): void {
      dismissChatError()
    }

    /**
     * 关闭所有错误
     */
    function dismissAllErrors(): void {
      dismissConfigError()
      dismissChatError()
    }

    /**
     * 加载配置状态并检查错误
     */
    async function loadConfigStatus(): Promise<void> {
      try {
        const status = await window.api.config.getStatus()
        if (!status.success && status.error) {
          showConfigErrorMessage(status.error)
        }
      } catch (error) {
        showConfigErrorMessage(
          `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
        )
      }
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
      // State: 基础 UI
      sidebarCollapsed,
      currentView,
      currentModel,
      lastChatSessionId,

      // State: 配置更新通知
      configUpdateKey,
      mcpUpdateKey,

      // State: 错误提示
      configError,
      showConfigError,
      chatError,
      showChatError,

      // Getters
      isChatView,
      isKnowledgeView,
      hasAnyError,

      // Actions: 侧边栏
      toggleSidebar,
      setSidebarCollapsed,
      setCurrentModel,

      // Actions: 视图切换
      switchToChatView,
      switchToKnowledgeView,
      setCurrentView,
      updateLastChatSessionId,

      // Actions: 配置更新通知
      notifyConfigUpdate,
      notifyMcpUpdate,

      // Actions: 错误管理
      showConfigErrorMessage,
      showChatErrorMessage,
      handleChatError,
      dismissConfigError,
      dismissChatError,
      closeChatError,
      dismissAllErrors,
      loadConfigStatus
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
