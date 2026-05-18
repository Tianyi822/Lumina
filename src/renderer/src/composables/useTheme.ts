import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useUIStateStore, type ThemeMeta } from '@renderer/stores/uiStateStore'
import type { ThemeMode } from '@shared/types/config'
import type { SystemTheme } from '@shared/utils'
import { createThemeCallbacks } from './themeCore'

export type { ThemeChangeCallback } from './themeCore'

export function useTheme(): {
  currentTheme: string
  selectedTheme: string
  themeMode: ThemeMode
  systemTheme: SystemTheme
  initTheme: () => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
  getCurrentTheme: () => string
  getAvailableThemes: () => ThemeMeta[]
  getCurrentThemeMeta: () => ThemeMeta | undefined
  onThemeChange: (callback: (theme: string) => void) => () => void
} {
  const store = useZustandStore(useUIStateStore)
  const { notify, subscribe } = createThemeCallbacks()

  function getCurrentTheme(): string {
    return store.currentTheme
  }

  function getAvailableThemes(): ThemeMeta[] {
    return store.getAvailableThemes()
  }

  function getCurrentThemeMeta(): ThemeMeta | undefined {
    return store.currentThemeMeta()
  }

  return {
    get currentTheme() {
      return store.currentTheme
    },
    get selectedTheme() {
      return store.selectedTheme
    },
    get themeMode() {
      return store.themeMode
    },
    get systemTheme() {
      return store.systemTheme
    },
    initTheme: store.initTheme,
    setTheme: async (themeId: string) => {
      await store.setTheme(themeId)
      notify(store.currentTheme)
    },
    setThemeMode: async (mode: ThemeMode) => {
      await store.setThemeMode(mode)
      notify(store.currentTheme)
    },
    getCurrentTheme,
    getAvailableThemes,
    getCurrentThemeMeta,
    onThemeChange: subscribe
  }
}
