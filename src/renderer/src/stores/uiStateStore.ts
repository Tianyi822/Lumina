import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { i18n } from '@renderer/i18n'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import type { ViewMode } from '@renderer/components/chrome/workspaceNavigation'
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

export type { ViewMode } from '@renderer/components/chrome/workspaceNavigation'

export interface ThemeMeta {
  id: string
  name: string
  previewColors?: {
    primary: string
    secondary: string
    accent: string
    extra1?: string
    extra2?: string
  }
}

export const AVAILABLE_THEMES: ThemeMeta[] = [
  {
    id: 'lumina-dark',
    name: 'Lumina Dark',
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
    previewColors: {
      primary: '#f5f5f7',
      secondary: '#ffffff',
      accent: '#5f6b7a',
      extra1: '#f7f7f8',
      extra2: '#4d5866'
    }
  }
]

export interface UIStateStore {
  knowledgeSidebarCollapsed: boolean
  paperSidebarCollapsed: boolean
  paperSidebarWidth: number
  writerSidebarCollapsed: boolean
  writerSidebarWidth: number
  paperChatPanelOpen: boolean
  paperChatPanelWidth: number
  writerChatPanelOpen: boolean
  writerChatPanelWidth: number
  lastPaperId: string | null
  currentView: ViewMode

  showConfigManager: boolean
  showKnowledgeFileManager: boolean

  configUpdateKey: number
  mcpUpdateKey: number

  currentTheme: string
  selectedTheme: ThemeId
  themeMode: ThemeMode
  systemTheme: SystemTheme
  themeInitialized: boolean

  isKnowledgeView: () => boolean
  isPaperView: () => boolean
  isWriterView: () => boolean
  isCurrentSidebarCollapsed: () => boolean
  currentThemeMeta: () => ThemeMeta | undefined

  setKnowledgeSidebarCollapsed: (collapsed: boolean) => void
  setPaperSidebarCollapsed: (collapsed: boolean) => void
  setPaperSidebarWidth: (width: number) => void
  setWriterSidebarCollapsed: (collapsed: boolean) => void
  setWriterSidebarWidth: (width: number) => void
  setPaperChatPanelOpen: (open: boolean) => void
  togglePaperChatPanel: () => void
  setPaperChatPanelWidth: (width: number) => void
  setWriterChatPanelOpen: (open: boolean) => void
  toggleWriterChatPanel: () => void
  setWriterChatPanelWidth: (width: number) => void
  setLastPaperId: (paperId: string | null) => void
  toggleCurrentSidebar: () => void
  setCurrentSidebarCollapsed: (collapsed: boolean) => void

  openConfigManager: () => void
  closeConfigManager: () => void
  openKnowledgeFileManager: () => void
  closeKnowledgeFileManager: () => void

  switchToKnowledgeView: () => Promise<void>
  switchToPaperView: () => Promise<void>
  switchToWriterView: () => Promise<void>
  setCurrentView: (view: ViewMode) => Promise<void>

  notifyConfigUpdate: () => void
  notifyMcpUpdate: () => void

  loadConfigStatus: () => Promise<void>

  initTheme: () => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
  getAvailableThemes: () => ThemeMeta[]
}

let cleanupSystemThemeListener: (() => void) | null = null
let systemThemeMediaQuery: MediaQueryList | null = null
let isViewChangeListenerSetup = false

/** 将主题应用到 DOM（data-theme 属性 + localStorage 持久化） */
function applyThemeToDom(themeId: string, themeMode: ThemeMode, selectedTheme: ThemeId): void {
  const html = document.documentElement
  html.setAttribute('data-theme', themeId)
  html.style.colorScheme = themeId === 'lumina-light' ? 'light' : 'dark'
  localStorage.setItem(
    'lumina-theme-preference',
    JSON.stringify({
      mode: themeMode,
      name: selectedTheme,
      effectiveTheme: themeId
    })
  )
}

/**
 * UI 状态 Store
 * 管理视图切换、侧边栏折叠、主题、弹窗等全局 UI 状态
 */
export const useUIStateStore = create<UIStateStore>()(
  persist(
    (set, get) => {
      /** 根据主题模式和系统主题解析当前生效的主题 ID */
      function resolveCurrentTheme(): ThemeId {
        const state = get()
        return resolveEffectiveTheme(state.themeMode, state.selectedTheme, state.systemTheme)
      }

      /** 同步原生窗口主题（标题栏、滚动条等） */
      async function syncNativeTheme(): Promise<void> {
        const state = get()
        const nativeSource = resolveNativeThemeSource(state.themeMode, state.selectedTheme)
        await window.api.window.setNativeTheme(nativeSource)
      }

      /** 应用解析后的主题到 DOM，并选择性地持久化到配置文件 */
      async function applyResolvedTheme(persist: boolean): Promise<void> {
        const state = get()
        const resolvedTheme = resolveCurrentTheme()
        set({ currentTheme: resolvedTheme })
        applyThemeToDom(resolvedTheme, state.themeMode, state.selectedTheme)

        try {
          await syncNativeTheme()
        } catch {
          window.api.logger?.warn('[UIStateStore] 同步原生主题失败')
        }

        if (!persist) return

        try {
          const themeConfig: ThemeConfig = {
            name: state.selectedTheme,
            mode: state.themeMode
          }
          await window.api.config.updateConfig({ theme: themeConfig })
        } catch (error) {
          window.api.logger?.error('[UIStateStore] 保存主题配置失败', {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      /** 响应系统主题变化，仅在 themeMode 为 system 时自动切换 */
      async function updateSystemTheme(nextTheme: SystemTheme): Promise<void> {
        set({ systemTheme: nextTheme })
        const state = get()
        if (state.themeMode !== 'system') return
        await applyResolvedTheme(false)
      }

      /** 注册系统主题变化监听器（优先使用 addEventListener） */
      function ensureSystemThemeListener(): void {
        if (cleanupSystemThemeListener) return

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

      /** 设置视图切换日志监听器 */
      function setupViewChangeLogger(): void {
        if (isViewChangeListenerSetup) return
        isViewChangeListenerSetup = true

        let previousView = get().currentView
        useUIStateStore.subscribe((state) => {
          if (state.currentView !== previousView) {
            window.api.logger.debug('[UIStateStore] 视图变化', {
              from: previousView,
              to: state.currentView
            })
            previousView = state.currentView
          }
        })
      }

      return {
        knowledgeSidebarCollapsed: false,
        paperSidebarCollapsed: false,
        paperSidebarWidth: 320,
        writerSidebarCollapsed: false,
        writerSidebarWidth: 320,
        paperChatPanelOpen: false,
        paperChatPanelWidth: 420,
        writerChatPanelOpen: false,
        writerChatPanelWidth: 420,
        lastPaperId: null,
        currentView: 'paper',

        showConfigManager: false,
        showKnowledgeFileManager: false,

        configUpdateKey: 0,
        mcpUpdateKey: 0,

        currentTheme: 'lumina-dark',
        selectedTheme: DEFAULT_THEME_ID,
        themeMode: DEFAULT_THEME_MODE,
        systemTheme: 'dark' as SystemTheme,
        themeInitialized: false,

        isKnowledgeView: () => get().currentView === 'knowledge',
        isPaperView: () => get().currentView === 'paper',
        isWriterView: () => get().currentView === 'writer',
        isCurrentSidebarCollapsed: () => {
          const state = get()
          if (state.currentView === 'paper') return state.paperSidebarCollapsed
          if (state.currentView === 'writer') return state.writerSidebarCollapsed
          return state.knowledgeSidebarCollapsed
        },
        currentThemeMeta: () => AVAILABLE_THEMES.find((t) => t.id === get().currentTheme),

        setKnowledgeSidebarCollapsed: (collapsed) => set({ knowledgeSidebarCollapsed: collapsed }),
        setPaperSidebarCollapsed: (collapsed) => set({ paperSidebarCollapsed: collapsed }),
        setPaperSidebarWidth: (width) =>
          set({ paperSidebarWidth: Math.min(480, Math.max(260, Math.round(width))) }),
        setWriterSidebarCollapsed: (collapsed) => set({ writerSidebarCollapsed: collapsed }),
        setWriterSidebarWidth: (width) =>
          set({ writerSidebarWidth: Math.min(480, Math.max(260, Math.round(width))) }),
        setPaperChatPanelOpen: (open) => set({ paperChatPanelOpen: open }),
        togglePaperChatPanel: () => set((s) => ({ paperChatPanelOpen: !s.paperChatPanelOpen })),
        setPaperChatPanelWidth: (width) =>
          set({ paperChatPanelWidth: Math.min(680, Math.max(340, Math.round(width))) }),
        setWriterChatPanelOpen: (open) => set({ writerChatPanelOpen: open }),
        toggleWriterChatPanel: () => set((s) => ({ writerChatPanelOpen: !s.writerChatPanelOpen })),
        setWriterChatPanelWidth: (width) =>
          set({ writerChatPanelWidth: Math.min(680, Math.max(340, Math.round(width))) }),
        setLastPaperId: (paperId) => set({ lastPaperId: paperId }),
        toggleCurrentSidebar: () => {
          const state = get()
          if (state.currentView === 'paper') {
            set({ paperSidebarCollapsed: !state.paperSidebarCollapsed })
            return
          }
          if (state.currentView === 'writer') {
            set({ writerSidebarCollapsed: !state.writerSidebarCollapsed })
            return
          }
          set({ knowledgeSidebarCollapsed: !state.knowledgeSidebarCollapsed })
        },
        setCurrentSidebarCollapsed: (collapsed) => {
          const state = get()
          if (state.currentView === 'paper') {
            set({ paperSidebarCollapsed: collapsed })
            return
          }
          if (state.currentView === 'writer') {
            set({ writerSidebarCollapsed: collapsed })
            return
          }
          set({ knowledgeSidebarCollapsed: collapsed })
        },

        openConfigManager: () => set({ showConfigManager: true }),
        closeConfigManager: () => set({ showConfigManager: false }),
        openKnowledgeFileManager: () => set({ showKnowledgeFileManager: true }),
        closeKnowledgeFileManager: () => set({ showKnowledgeFileManager: false }),

        switchToKnowledgeView: async () => {
          set({ currentView: 'knowledge' })
          window.api.logger.info('[UIStateStore] 切换到知识库视图')
        },
        switchToPaperView: async () => {
          set({ currentView: 'paper' })
          window.api.logger.info('[UIStateStore] 切换到论文视图')
        },
        switchToWriterView: async () => {
          set({ currentView: 'writer' })
          window.api.logger.info('[UIStateStore] 切换到写作视图')
        },
        setCurrentView: async (view) => {
          const state = get()
          if (state.currentView === view) return
          if (view === 'knowledge') await state.switchToKnowledgeView()
          else if (view === 'paper') await state.switchToPaperView()
          else await state.switchToWriterView()
        },

        notifyConfigUpdate: () => set((s) => ({ configUpdateKey: s.configUpdateKey + 1 })),
        notifyMcpUpdate: () => set((s) => ({ mcpUpdateKey: s.mcpUpdateKey + 1 })),

        loadConfigStatus: async () => {
          // 加载配置状态，失败时显示错误通知
          try {
            const status = await window.api.config.getStatus()
            if (!status.success && status.error) {
              useNotificationCenterStore
                .getState()
                .add('error', i18n.t('notifications.config.statusErrorTitle'), status.error, {
                  source: 'config',
                  sticky: true
                })
            }
          } catch (error) {
            const msg = `${i18n.t('notifications.config.statusFetchFailedPrefix')}${error instanceof Error ? error.message : String(error)}`
            useNotificationCenterStore
              .getState()
              .add('error', i18n.t('notifications.config.statusErrorTitle'), msg, {
                source: 'config',
                sticky: true
              })
          }
        },

        initTheme: async () => {
          // 避免重复初始化
          const state = get()
          if (state.themeInitialized) return

          try {
            const config = (await window.api.config.getConfig()) as { theme?: ThemeConfig } | null
            set({
              selectedTheme: normalizeThemeId(config?.theme?.name),
              themeMode: normalizeThemeMode(config?.theme?.mode)
            })
          } catch {
            set({ selectedTheme: DEFAULT_THEME_ID, themeMode: DEFAULT_THEME_MODE })
          }

          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          set({ systemTheme: isDark ? 'dark' : 'light' })

          ensureSystemThemeListener()
          await applyResolvedTheme(false)
          set({ themeInitialized: true })

          setupViewChangeLogger()
        },

        setTheme: async (themeId) => {
          // 验证主题是否在可用列表中
          if (!AVAILABLE_THEMES.some((t) => t.id === themeId)) {
            window.api.logger?.warn('[UIStateStore] 未知主题', { themeId })
            return
          }
          set({ selectedTheme: normalizeThemeId(themeId) })
          await applyResolvedTheme(true)
        },

        setThemeMode: async (mode) => {
          set({ themeMode: normalizeThemeMode(mode) })
          await applyResolvedTheme(true)
        },

        getAvailableThemes: () => AVAILABLE_THEMES
      }
    },
    {
      name: 'lumina-ui-state',
      partialize: (state) => ({
        knowledgeSidebarCollapsed: state.knowledgeSidebarCollapsed,
        paperSidebarCollapsed: state.paperSidebarCollapsed,
        paperSidebarWidth: state.paperSidebarWidth,
        writerSidebarCollapsed: state.writerSidebarCollapsed,
        writerSidebarWidth: state.writerSidebarWidth,
        paperChatPanelWidth: state.paperChatPanelWidth,
        writerChatPanelWidth: state.writerChatPanelWidth,
        lastPaperId: state.lastPaperId,
        currentView: state.currentView
      })
    }
  )
)
