import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
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

export type ViewMode = 'paper' | 'knowledge' | 'lab'
export type LabDetailTab = 'stats' | 'terminal' | 'logs'

export interface ThemeMeta {
  id: string
  name: string
  description?: string
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

export interface UIStateStore {
  labSidebarCollapsed: boolean
  knowledgeSidebarCollapsed: boolean
  paperSidebarCollapsed: boolean
  paperSidebarWidth: number
  paperChatPanelOpen: boolean
  paperChatPanelWidth: number
  lastPaperId: string | null
  currentView: ViewMode

  labDetailTab: LabDetailTab
  lastLabId: string | null
  showLabCreator: boolean
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
  isLabView: () => boolean
  isPaperView: () => boolean
  isCurrentSidebarCollapsed: () => boolean
  currentThemeMeta: () => ThemeMeta | undefined

  toggleLabSidebar: () => void
  setLabSidebarCollapsed: (collapsed: boolean) => void
  setKnowledgeSidebarCollapsed: (collapsed: boolean) => void
  setPaperSidebarCollapsed: (collapsed: boolean) => void
  setPaperSidebarWidth: (width: number) => void
  setPaperChatPanelOpen: (open: boolean) => void
  togglePaperChatPanel: () => void
  setPaperChatPanelWidth: (width: number) => void
  setLastPaperId: (paperId: string | null) => void
  setLastLabId: (labId: string | null) => void
  toggleCurrentSidebar: () => void
  setCurrentSidebarCollapsed: (collapsed: boolean) => void

  setLabDetailTab: (tab: LabDetailTab) => void
  openLabCreator: () => void
  closeLabCreator: () => void
  openConfigManager: () => void
  closeConfigManager: () => void
  openKnowledgeFileManager: () => void
  closeKnowledgeFileManager: () => void

  switchToKnowledgeView: () => Promise<void>
  switchToLabView: () => Promise<void>
  switchToPaperView: () => Promise<void>
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

export const useUIStateStore = create<UIStateStore>()(
  persist(
    (set, get) => {
      function resolveCurrentTheme(): ThemeId {
        const state = get()
        return resolveEffectiveTheme(state.themeMode, state.selectedTheme, state.systemTheme)
      }

      async function syncNativeTheme(): Promise<void> {
        const state = get()
        const nativeSource = resolveNativeThemeSource(state.themeMode, state.selectedTheme)
        await window.api.window.setNativeTheme(nativeSource)
      }

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

      async function updateSystemTheme(nextTheme: SystemTheme): Promise<void> {
        set({ systemTheme: nextTheme })
        const state = get()
        if (state.themeMode !== 'system') return
        await applyResolvedTheme(false)
      }

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
        labSidebarCollapsed: false,
        knowledgeSidebarCollapsed: false,
        paperSidebarCollapsed: false,
        paperSidebarWidth: 320,
        paperChatPanelOpen: false,
        paperChatPanelWidth: 420,
        lastPaperId: null,
        currentView: 'paper',

        labDetailTab: 'stats',
        lastLabId: null,
        showLabCreator: false,
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
        isLabView: () => get().currentView === 'lab',
        isPaperView: () => get().currentView === 'paper',
        isCurrentSidebarCollapsed: () =>
          get().currentView === 'paper' && get().paperSidebarCollapsed,
        currentThemeMeta: () => AVAILABLE_THEMES.find((t) => t.id === get().currentTheme),

        toggleLabSidebar: () => set((s) => ({ labSidebarCollapsed: !s.labSidebarCollapsed })),
        setLabSidebarCollapsed: (collapsed) => set({ labSidebarCollapsed: collapsed }),
        setKnowledgeSidebarCollapsed: (collapsed) => set({ knowledgeSidebarCollapsed: collapsed }),
        setPaperSidebarCollapsed: (collapsed) => set({ paperSidebarCollapsed: collapsed }),
        setPaperSidebarWidth: (width) =>
          set({ paperSidebarWidth: Math.min(480, Math.max(260, Math.round(width))) }),
        setPaperChatPanelOpen: (open) => set({ paperChatPanelOpen: open }),
        togglePaperChatPanel: () => set((s) => ({ paperChatPanelOpen: !s.paperChatPanelOpen })),
        setPaperChatPanelWidth: (width) =>
          set({ paperChatPanelWidth: Math.min(680, Math.max(340, Math.round(width))) }),
        setLastPaperId: (paperId) => set({ lastPaperId: paperId }),
        setLastLabId: (labId) => set({ lastLabId: labId }),
        toggleCurrentSidebar: () => {
          const state = get()
          if (state.currentView !== 'paper') return
          set({ paperSidebarCollapsed: !state.paperSidebarCollapsed })
        },
        setCurrentSidebarCollapsed: (collapsed) => {
          if (get().currentView !== 'paper') return
          set({ paperSidebarCollapsed: collapsed })
        },

        setLabDetailTab: (tab) => set({ labDetailTab: tab }),
        openLabCreator: () => set({ showLabCreator: true }),
        closeLabCreator: () => set({ showLabCreator: false }),
        openConfigManager: () => set({ showConfigManager: true }),
        closeConfigManager: () => set({ showConfigManager: false }),
        openKnowledgeFileManager: () => set({ showKnowledgeFileManager: true }),
        closeKnowledgeFileManager: () => set({ showKnowledgeFileManager: false }),

        switchToKnowledgeView: async () => {
          set({ knowledgeSidebarCollapsed: false, currentView: 'knowledge' })
          window.api.logger.info('[UIStateStore] 切换到知识库视图')
        },
        switchToLabView: async () => {
          set({ labSidebarCollapsed: false, currentView: 'lab' })
          window.api.logger.info('[UIStateStore] 切换到实验室视图')
        },
        switchToPaperView: async () => {
          set({ currentView: 'paper' })
          window.api.logger.info('[UIStateStore] 切换到论文视图')
        },
        setCurrentView: async (view) => {
          const state = get()
          if (state.currentView === view) return
          if (view === 'knowledge') await state.switchToKnowledgeView()
          else if (view === 'paper') await state.switchToPaperView()
          else await state.switchToLabView()
        },

        notifyConfigUpdate: () => set((s) => ({ configUpdateKey: s.configUpdateKey + 1 })),
        notifyMcpUpdate: () => set((s) => ({ mcpUpdateKey: s.mcpUpdateKey + 1 })),

        loadConfigStatus: async () => {
          try {
            const status = await window.api.config.getStatus()
            if (!status.success && status.error) {
              useNotificationCenterStore
                .getState()
                .add('error', '配置错误', status.error, { source: 'config', sticky: true })
            }
          } catch (error) {
            const msg = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
            useNotificationCenterStore
              .getState()
              .add('error', '配置错误', msg, { source: 'config', sticky: true })
          }
        },

        initTheme: async () => {
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
        labSidebarCollapsed: state.labSidebarCollapsed,
        paperSidebarCollapsed: state.paperSidebarCollapsed,
        paperSidebarWidth: state.paperSidebarWidth,
        paperChatPanelWidth: state.paperChatPanelWidth,
        lastPaperId: state.lastPaperId,
        lastLabId: state.lastLabId,
        currentView: state.currentView
      })
    }
  )
)
