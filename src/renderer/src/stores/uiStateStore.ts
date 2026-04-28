// UI 状态 Store
// 管理应用界面状态（侧边栏、视图模式、配置通知、错误提示、主题等）

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useNotification } from '@renderer/composables/useNotification'
import type { ThemeConfig, ThemeMode } from '@shared/types/config'
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  normalizeThemeId,
  normalizeThemeMode,
  resolveEffectiveTheme,
  resolveNativeThemeSource,
  type SystemTheme,
  type ThemeId
} from '@shared/utils'

// 视图类型
export type ViewMode = 'paper' | 'knowledge' | 'sandbox'

// 实验室详情 Tab 类型
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
    id: 'lumina-dark',
    name: 'Lumina Dark',
    description: '深色基准主题，统一整个应用的深色、平面和受控交互基线',
    previewColors: {
      primary: '#121212',
      secondary: '#1b1f26',
      accent: '#9ca9ba',
      extra1: '#2d333b',
      extra2: '#b1bdcc'
    }
  },
  {
    id: 'lumina-light',
    name: 'Lumina Light',
    description: '浅色主题，清新明亮的界面风格',
    previewColors: {
      primary: '#f5f5f7',
      secondary: '#ffffff',
      accent: '#5f6b7a',
      extra1: '#f7f7f8',
      extra2: '#4d5866'
    }
  }
]

export const useUIStateStore = defineStore(
  'uiState',
  () => {
    // ==================== State: 基础 UI ====================

    // 实验室侧边栏是否折叠
    const sandboxSidebarCollapsed = ref(false)

    // 知识库侧边栏是否折叠
    const knowledgeSidebarCollapsed = ref(false)

    // 论文侧边栏是否折叠
    const paperSidebarCollapsed = ref(false)

    const paperChatPanelOpen = ref(false)
    const paperChatPanelWidth = ref(420)
    const lastPaperId = ref<string | null>(null)

    // 当前视图模式
    const currentView = ref<ViewMode>('paper')

    // ==================== State: 实验室页面 UI ====================

    // 实验室详情当前 Tab
    const sandboxDetailTab = ref<SandboxDetailTab>('stats')

    // 上次选中的实验室 ID（持久化，用于恢复上次浏览状态）
    const lastSandboxId = ref<string | null>(null)

    // 是否显示创建实验室弹窗
    const showSandboxCreator = ref(false)

    // 是否显示配置管理器弹窗
    const showConfigManager = ref(false)

    // 是否显示知识库文件管理弹窗
    const showKnowledgeFileManager = ref(false)

    // ==================== State: 配置更新通知 ====================

    // 配置更新计数器（用于触发组件刷新）
    const configUpdateKey = ref(0)

    // MCP 配置更新计数器
    const mcpUpdateKey = ref(0)

    // ==================== State: 主题 ====================

    // 当前主题 ID
    const currentTheme = ref<string>('lumina-dark')

    // 手动模式下选中的主题
    const selectedTheme = ref<ThemeId>(DEFAULT_THEME_ID)

    // 主题模式：手动 or 跟随系统
    const themeMode = ref<ThemeMode>(DEFAULT_THEME_MODE)

    // 当前系统主题
    const systemTheme = ref<SystemTheme>('dark')

    // 主题是否已初始化（从配置文件加载）
    const themeInitialized = ref(false)

    // 系统主题监听解绑函数
    let cleanupSystemThemeListener: (() => void) | null = null
    let systemThemeMediaQuery: MediaQueryList | null = null

    // ==================== Getters ====================

    // 是否在知识库视图
    const isKnowledgeView = computed(() => currentView.value === 'knowledge')

    // 是否在实验室视图
    const isSandboxView = computed(() => currentView.value === 'sandbox')

    // 是否在论文视图
    const isPaperView = computed(() => currentView.value === 'paper')

    // 只有论文页允许折叠侧边栏，知识库和实验室页始终展开。
    const isCurrentSidebarCollapsed = computed(() => {
      return currentView.value === 'paper' && paperSidebarCollapsed.value
    })

    // ==================== Getters: 主题 ====================

    // 获取当前主题的元数据
    const currentThemeMeta = computed(() =>
      AVAILABLE_THEMES.find((t) => t.id === currentTheme.value)
    )

    // ==================== Actions: 侧边栏 ====================

    // 切换实验室侧边栏状态
    function toggleSandboxSidebar(): void {
      sandboxSidebarCollapsed.value = !sandboxSidebarCollapsed.value
      window.api.logger.debug('[UIStateStore] 切换实验室侧边栏', {
        collapsed: sandboxSidebarCollapsed.value
      })
    }

    // 设置实验室侧边栏折叠状态
    function setSandboxSidebarCollapsed(collapsed: boolean): void {
      sandboxSidebarCollapsed.value = collapsed
    }

    // 设置知识库侧边栏折叠状态
    function setKnowledgeSidebarCollapsed(collapsed: boolean): void {
      knowledgeSidebarCollapsed.value = collapsed
    }

    // 设置论文侧边栏折叠状态
    function setPaperSidebarCollapsed(collapsed: boolean): void {
      paperSidebarCollapsed.value = collapsed
    }

    function setPaperChatPanelOpen(open: boolean): void {
      paperChatPanelOpen.value = open
    }

    function togglePaperChatPanel(): void {
      paperChatPanelOpen.value = !paperChatPanelOpen.value
    }

    function setPaperChatPanelWidth(width: number): void {
      paperChatPanelWidth.value = Math.min(680, Math.max(340, Math.round(width)))
    }

    function setLastPaperId(paperId: string | null): void {
      lastPaperId.value = paperId
    }

    function setLastSandboxId(sandboxId: string | null): void {
      lastSandboxId.value = sandboxId
    }

    // 切换当前视图对应的侧边栏状态
    function toggleCurrentSidebar(): void {
      if (currentView.value !== 'paper') {
        return
      }

      const nextCollapsed = !isCurrentSidebarCollapsed.value
      setCurrentSidebarCollapsed(nextCollapsed)

      window.api.logger.debug('[UIStateStore] 切换当前视图侧边栏', {
        view: currentView.value,
        collapsed: nextCollapsed
      })
    }

    // 设置当前视图对应的侧边栏状态
    function setCurrentSidebarCollapsed(collapsed: boolean): void {
      if (currentView.value !== 'paper') {
        return
      }

      setPaperSidebarCollapsed(collapsed)
    }

    // ==================== Actions: 实验室页面 UI ====================

    // 设置实验室详情当前 Tab
    function setSandboxDetailTab(tab: SandboxDetailTab): void {
      sandboxDetailTab.value = tab
      window.api.logger.debug('[UIStateStore] 切换实验室详情 Tab', { tab })
    }

    // 打开创建实验室弹窗
    function openSandboxCreator(): void {
      showSandboxCreator.value = true
    }

    // 关闭创建实验室弹窗
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

    // 打开知识库文件管理弹窗
    function openKnowledgeFileManager(): void {
      showKnowledgeFileManager.value = true
    }

    // 关闭知识库文件管理弹窗
    function closeKnowledgeFileManager(): void {
      showKnowledgeFileManager.value = false
    }

    // ==================== Actions: 视图切换 ====================

    // 切换到知识库视图
    async function switchToKnowledgeView(): Promise<void> {
      knowledgeSidebarCollapsed.value = false
      currentView.value = 'knowledge'
      window.api.logger.info('[UIStateStore] 切换到知识库视图')
    }

    // 切换到实验室视图
    async function switchToSandboxView(): Promise<void> {
      sandboxSidebarCollapsed.value = false
      currentView.value = 'sandbox'
      window.api.logger.info('[UIStateStore] 切换到实验室视图')
    }

    // 切换到论文视图
    async function switchToPaperView(): Promise<void> {
      currentView.value = 'paper'
      window.api.logger.info('[UIStateStore] 切换到论文视图')
    }

    // 设置当前视图
    async function setCurrentView(view: ViewMode): Promise<void> {
      if (currentView.value === view) return

      if (view === 'knowledge') {
        await switchToKnowledgeView()
      } else if (view === 'paper') {
        await switchToPaperView()
      } else {
        await switchToSandboxView()
      }
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

    // 加载配置状态并检查错误
    async function loadConfigStatus(): Promise<void> {
      try {
        const status = await window.api.config.getStatus()
        if (!status.success && status.error) {
          const notify = useNotification()
          notify.error('配置错误', status.error, { source: 'config', sticky: true })
          window.api.logger?.warn('[UIStateStore] 配置加载失败', { error: status.error })
        }
      } catch (error) {
        const msg = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
        const notify = useNotification()
        notify.error('配置错误', msg, { source: 'config', sticky: true })
      }
    }

    // ==================== Actions: 主题管理 ====================

    /**
     * 应用主题到 DOM
     */
    function applyThemeToDom(themeId: string): void {
      const html = document.documentElement
      html.setAttribute('data-theme', themeId)
      html.style.colorScheme = themeId === 'lumina-light' ? 'light' : 'dark'
      localStorage.setItem(
        'lumina-theme-preference',
        JSON.stringify({
          mode: themeMode.value,
          name: selectedTheme.value,
          effectiveTheme: themeId
        })
      )
    }

    function resolveCurrentTheme(): ThemeId {
      return resolveEffectiveTheme(themeMode.value, selectedTheme.value, systemTheme.value)
    }

    async function syncNativeTheme(): Promise<void> {
      const nativeSource = resolveNativeThemeSource(themeMode.value, selectedTheme.value)
      await window.api.window.setNativeTheme(nativeSource)
    }

    async function applyResolvedTheme(persist: boolean): Promise<void> {
      const resolvedTheme = resolveCurrentTheme()
      currentTheme.value = resolvedTheme
      applyThemeToDom(resolvedTheme)

      try {
        await syncNativeTheme()
      } catch {
        window.api.logger?.warn('[UIStateStore] 同步原生主题失败')
      }

      if (!persist) {
        return
      }

      try {
        const themeConfig: ThemeConfig = {
          name: selectedTheme.value,
          mode: themeMode.value
        }
        await window.api.config.updateConfig({ theme: themeConfig })
        window.api.logger?.info('[UIStateStore] 主题偏好已保存', {
          mode: themeMode.value,
          selectedTheme: selectedTheme.value,
          currentTheme: resolvedTheme
        })
      } catch (error) {
        window.api.logger?.error('[UIStateStore] 保存主题配置失败', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    async function updateSystemTheme(nextTheme: SystemTheme): Promise<void> {
      systemTheme.value = nextTheme

      if (themeMode.value !== 'system') {
        return
      }

      await applyResolvedTheme(false)
      window.api.logger?.info('[UIStateStore] 跟随系统主题更新', {
        systemTheme: nextTheme,
        currentTheme: currentTheme.value
      })
    }

    function ensureSystemThemeListener(): void {
      if (cleanupSystemThemeListener) {
        return
      }

      systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

      const listener = (event: MediaQueryListEvent): void => {
        void updateSystemTheme(event.matches ? 'dark' : 'light')
      }

      if (typeof systemThemeMediaQuery.addEventListener === 'function') {
        systemThemeMediaQuery.addEventListener('change', listener)
        cleanupSystemThemeListener = () => {
          systemThemeMediaQuery?.removeEventListener('change', listener)
        }
        return
      }

      systemThemeMediaQuery.addListener(listener)
      cleanupSystemThemeListener = () => {
        systemThemeMediaQuery?.removeListener(listener)
      }
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
        selectedTheme.value = normalizeThemeId(config?.theme?.name)
        themeMode.value = normalizeThemeMode(config?.theme?.mode)
      } catch (error) {
        window.api.logger?.warn('[UIStateStore] 无法从配置文件加载主题，使用默认主题', {
          error: error instanceof Error ? error.message : String(error)
        })
        selectedTheme.value = DEFAULT_THEME_ID
        themeMode.value = DEFAULT_THEME_MODE
      }

      systemTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

      ensureSystemThemeListener()
      await applyResolvedTheme(false)
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

      selectedTheme.value = normalizeThemeId(themeId)
      await applyResolvedTheme(true)
    }

    /**
     * 设置主题模式（手动或跟随系统）
     */
    async function setThemeMode(mode: ThemeMode): Promise<void> {
      themeMode.value = normalizeThemeMode(mode)
      await applyResolvedTheme(true)
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
      sandboxSidebarCollapsed,
      knowledgeSidebarCollapsed,
      paperSidebarCollapsed,
      paperChatPanelOpen,
      paperChatPanelWidth,
      lastPaperId,
      currentView,

      // State: 实验室页面 UI
      sandboxDetailTab,
      lastSandboxId,
      showSandboxCreator,
      showConfigManager,
      showKnowledgeFileManager,

      // State: 配置更新通知
      configUpdateKey,
      mcpUpdateKey,

      // State: 主题
      currentTheme,
      selectedTheme,
      themeMode,
      systemTheme,
      themeInitialized,

      // Getters
      isKnowledgeView,
      isSandboxView,
      isPaperView,
      isCurrentSidebarCollapsed,
      currentThemeMeta,

      // Actions: 侧边栏
      toggleSandboxSidebar,
      setSandboxSidebarCollapsed,
      setKnowledgeSidebarCollapsed,
      setPaperSidebarCollapsed,
      setPaperChatPanelOpen,
      togglePaperChatPanel,
      setPaperChatPanelWidth,
      setLastPaperId,
      setLastSandboxId,
      toggleCurrentSidebar,
      setCurrentSidebarCollapsed,

      // Actions: 实验室页面 UI
      setSandboxDetailTab,
      openSandboxCreator,
      closeSandboxCreator,
      openConfigManager,
      closeConfigManager,
      openKnowledgeFileManager,
      closeKnowledgeFileManager,

      // Actions: 视图切换
      switchToKnowledgeView,
      switchToSandboxView,
      switchToPaperView,
      setCurrentView,

      // Actions: 配置更新通知
      notifyConfigUpdate,
      notifyMcpUpdate,

      // Actions: 错误管理
      loadConfigStatus,

      // Actions: 主题管理
      initTheme,
      setTheme,
      setThemeMode,
      getAvailableThemes
    }
  },
  {
    // 持久化配置
    persist: {
      key: 'lumina-ui-state',
      // 只持久化 UI 偏好设置
      pick: [
        'knowledgeSidebarCollapsed',
        'sandboxSidebarCollapsed',
        'paperSidebarCollapsed',
        'paperChatPanelWidth',
        'lastPaperId',
        'lastSandboxId'
      ]
    }
  }
)
