// UI 状态 Store
// 管理应用界面状态（侧边栏、视图模式、配置通知、错误提示、主题等）

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useSessionStore } from './sessionStore'
import type { ThemeConfig } from '@shared/types/config'

// 视图类型
export type ViewMode = 'chat' | 'knowledge' | 'sandbox'

// 沙箱详情 Tab 类型
export type SandboxDetailTab = 'stats' | 'terminal' | 'logs'

/**
 * 主题元数据
 */
export interface ThemeMeta {
  /** 主题 ID (对应 data-theme 属性值) */
  id: string
  /** 主题显示名称 */
  name: string
  /** 主题描述 */
  description?: string
  /** 主题预览色（用于显示主题色块，最多5种） */
  previewColors?: {
    primary: string
    secondary: string
    accent: string
    extra1?: string
    extra2?: string
  }
}

/**
 * 可用主题列表
 * 这里定义所有可用的主题，与 themes/ 目录下的 CSS 文件对应
 */
export const AVAILABLE_THEMES: ThemeMeta[] = [
  {
    id: 'sparrow-dark',
    name: 'Sparrow Dark',
    description: '当前重构阶段唯一基准主题，旧主题不再驱动新界面',
    previewColors: {
      primary: '#121212',
      secondary: '#1b1f26',
      accent: '#8e95d9',
      extra1: '#272c36',
      extra2: '#a1a7e6'
    }
  }
]

export const useUIStateStore = defineStore(
  'uiState',
  () => {
    // ==================== Dependencies ====================

    const sessionStore = useSessionStore()

    // ==================== State: 基础 UI ====================

    // 侧边栏是否折叠
    const sidebarCollapsed = ref(false)

    // 沙箱侧边栏是否折叠
    const sandboxSidebarCollapsed = ref(false)

    // 知识库侧边栏是否折叠
    const knowledgeSidebarCollapsed = ref(false)

    // 当前视图模式
    const currentView = ref<ViewMode>('chat')

    // 当前模型
    const currentModel = ref('')

    // 最后访问的聊天会话 ID
    const lastChatSessionId = ref<string | null>(null)

    // ==================== State: 沙箱页面 UI ====================

    // 沙箱详情当前 Tab
    const sandboxDetailTab = ref<SandboxDetailTab>('stats')

    // 是否显示创建沙箱弹窗
    const showSandboxCreator = ref(false)

    // 是否显示配置管理器弹窗
    const showConfigManager = ref(false)

    // ==================== State: 配置更新通知 ====================

    // 配置更新计数器（用于触发组件刷新）
    const configUpdateKey = ref(0)

    // MCP 配置更新计数器
    const mcpUpdateKey = ref(0)

    // ==================== State: 错误提示 ====================

    // 配置错误信息
    const configError = ref<string | null>(null)

    // 是否显示配置错误
    const showConfigError = ref(false)

    // 聊天错误信息
    const chatError = ref<string | null>(null)

    // 是否显示聊天错误
    const showChatError = ref(false)

    // ==================== State: 主题 ====================

    // 当前主题 ID
    const currentTheme = ref<string>('sparrow-dark')

    // 主题是否已初始化（从配置文件加载）
    const themeInitialized = ref(false)

    // ==================== Getters ====================

    // 是否在聊天视图
    const isChatView = computed(() => currentView.value === 'chat')

    // 是否在知识库视图
    const isKnowledgeView = computed(() => currentView.value === 'knowledge')

    // 是否在沙箱视图
    const isSandboxView = computed(() => currentView.value === 'sandbox')

    // 是否有任何错误显示
    const hasAnyError = computed(() => showConfigError.value || showChatError.value)

    // ==================== Getters: 主题 ====================

    // 获取当前主题的元数据
    const currentThemeMeta = computed(() =>
      AVAILABLE_THEMES.find((t) => t.id === currentTheme.value)
    )

    // ==================== Actions: 侧边栏 ====================

    // 切换侧边栏状态
    function toggleSidebar(): void {
      sidebarCollapsed.value = !sidebarCollapsed.value
      window.api.logger.debug('[UIStateStore] 切换侧边栏', {
        collapsed: sidebarCollapsed.value
      })
    }

    // 切换沙箱侧边栏状态
    function toggleSandboxSidebar(): void {
      sandboxSidebarCollapsed.value = !sandboxSidebarCollapsed.value
      window.api.logger.debug('[UIStateStore] 切换沙箱侧边栏', {
        collapsed: sandboxSidebarCollapsed.value
      })
    }

    // 设置侧边栏折叠状态
    function setSidebarCollapsed(collapsed: boolean): void {
      sidebarCollapsed.value = collapsed
    }

    // 设置沙箱侧边栏折叠状态
    function setSandboxSidebarCollapsed(collapsed: boolean): void {
      sandboxSidebarCollapsed.value = collapsed
    }

    // 设置知识库侧边栏折叠状态
    function setKnowledgeSidebarCollapsed(collapsed: boolean): void {
      knowledgeSidebarCollapsed.value = collapsed
    }

    // ==================== Actions: 沙箱页面 UI ====================

    // 设置沙箱详情当前 Tab
    function setSandboxDetailTab(tab: SandboxDetailTab): void {
      sandboxDetailTab.value = tab
      window.api.logger.debug('[UIStateStore] 切换沙箱详情 Tab', { tab })
    }

    // 打开创建沙箱弹窗
    function openSandboxCreator(): void {
      showSandboxCreator.value = true
    }

    // 关闭创建沙箱弹窗
    function closeSandboxCreator(): void {
      showSandboxCreator.value = false
    }

    // 打开配置管理器弹窗
    function openConfigManager(): void {
      showConfigManager.value = true
    }

    // 关闭配置管理器弹窗
    function closeConfigManager(): void {
      showConfigManager.value = false
    }

    // 设置当前模型
    function setCurrentModel(model: string): void {
      currentModel.value = model
      window.api.logger.debug('[UIStateStore] 设置当前模型', { model })
    }

    // ==================== Actions: 视图切换 ====================

    // 切换到聊天视图
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

    // 切换到知识库视图
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

    // 切换到沙箱视图
    async function switchToSandboxView(saveSessionState: boolean = true): Promise<void> {
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

      currentView.value = 'sandbox'
      window.api.logger.info('[UIStateStore] 切换到沙箱视图')
    }

    // 设置当前视图
    async function setCurrentView(view: ViewMode, autoHandleState: boolean = true): Promise<void> {
      if (currentView.value === view) return

      if (view === 'chat') {
        await switchToChatView(autoHandleState)
      } else if (view === 'knowledge') {
        await switchToKnowledgeView(autoHandleState)
      } else {
        await switchToSandboxView(autoHandleState)
      }
    }

    // 更新最后访问的会话 ID
    function updateLastChatSessionId(sessionId: string | null): void {
      lastChatSessionId.value = sessionId
    }

    // ==================== Actions: 配置更新通知 ====================

    // 触发配置更新通知
    function notifyConfigUpdate(): void {
      configUpdateKey.value++
      window.api.logger?.debug('[UIStateStore] 配置更新通知', { key: configUpdateKey.value })
    }

    // 触发 MCP 配置更新通知
    function notifyMcpUpdate(): void {
      mcpUpdateKey.value++
      window.api.logger?.debug('[UIStateStore] MCP 配置更新通知', { key: mcpUpdateKey.value })
    }

    // ==================== Actions: 错误管理 ====================

    // 显示配置错误
    function showConfigErrorMessage(message: string): void {
      configError.value = message
      showConfigError.value = true
      window.api.logger?.warn('[UIStateStore] 显示配置错误', { message })
    }

    // 显示聊天错误
    function showChatErrorMessage(message: string): void {
      chatError.value = message
      showChatError.value = true
      window.api.logger?.warn('[UIStateStore] 显示聊天错误', { message })
    }

    // 处理聊天错误（根据错误类型路由到不同的提示）
    function handleChatError(error: string): void {
      if (error.includes('请先选择一个模型') || error.includes('配置')) {
        configError.value = error
        showConfigError.value = true
      } else {
        showChatErrorMessage(error)
      }
    }

    // 关闭配置错误
    function dismissConfigError(): void {
      showConfigError.value = false
      configError.value = null
    }

    // 关闭聊天错误
    function dismissChatError(): void {
      showChatError.value = false
      chatError.value = null
    }

    // 简化方法名：关闭聊天错误（别名）
    function closeChatError(): void {
      dismissChatError()
    }

    // 关闭所有错误
    function dismissAllErrors(): void {
      dismissConfigError()
      dismissChatError()
    }

    // 加载配置状态并检查错误
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

    // ==================== Actions: 主题管理 ====================

    /**
     * 应用主题到 DOM
     */
    function applyThemeToDom(themeId: string): void {
      const html = document.documentElement
      html.setAttribute('data-theme', themeId)
    }

    /**
     * 初始化主题（从配置文件加载）
     */
    async function initTheme(): Promise<void> {
      if (themeInitialized.value) {
        return
      }

      try {
        const config = (await window.api.config.getConfig()) as { theme?: ThemeConfig } | null
        if (config?.theme?.name && AVAILABLE_THEMES.some((t) => t.id === config.theme!.name)) {
          currentTheme.value = config.theme.name
        } else {
          currentTheme.value = 'sparrow-dark'
        }
      } catch (error) {
        window.api.logger?.warn('[UIStateStore] 无法从配置文件加载主题，使用默认主题', {
          error: error instanceof Error ? error.message : String(error)
        })
        currentTheme.value = 'sparrow-dark'
      }

      applyThemeToDom(currentTheme.value)
      themeInitialized.value = true
    }

    /**
     * 设置主题（同时保存到配置文件）
     */
    async function setTheme(themeId: string): Promise<void> {
      if (!AVAILABLE_THEMES.some((t) => t.id === themeId)) {
        window.api.logger?.warn('[UIStateStore] 未知主题', { themeId })
        return
      }

      currentTheme.value = themeId
      applyThemeToDom(themeId)

      // 保存主题到配置文件
      try {
        const themeConfig: ThemeConfig = { name: themeId }
        await window.api.config.updateConfig({ theme: themeConfig })
        window.api.logger?.info('[UIStateStore] 主题已保存', { themeId })
      } catch (error) {
        window.api.logger?.error('[UIStateStore] 保存主题配置失败', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    /**
     * 获取所有可用主题
     */
    function getAvailableThemes(): ThemeMeta[] {
      return AVAILABLE_THEMES
    }

    // ==================== View Change Watchers ====================

    // 监听视图变化，确保状态正确保存
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
      sandboxSidebarCollapsed,
      knowledgeSidebarCollapsed,
      currentView,
      currentModel,
      lastChatSessionId,

      // State: 沙箱页面 UI
      sandboxDetailTab,
      showSandboxCreator,
      showConfigManager,

      // State: 配置更新通知
      configUpdateKey,
      mcpUpdateKey,

      // State: 错误提示
      configError,
      showConfigError,
      chatError,
      showChatError,

      // State: 主题
      currentTheme,
      themeInitialized,

      // Getters
      isChatView,
      isKnowledgeView,
      isSandboxView,
      hasAnyError,
      currentThemeMeta,

      // Actions: 侧边栏
      toggleSidebar,
      toggleSandboxSidebar,
      setSidebarCollapsed,
      setSandboxSidebarCollapsed,
      setKnowledgeSidebarCollapsed,
      setCurrentModel,

      // Actions: 沙箱页面 UI
      setSandboxDetailTab,
      openSandboxCreator,
      closeSandboxCreator,
      openConfigManager,
      closeConfigManager,

      // Actions: 视图切换
      switchToChatView,
      switchToKnowledgeView,
      switchToSandboxView,
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
      loadConfigStatus,

      // Actions: 主题管理
      initTheme,
      setTheme,
      getAvailableThemes
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
