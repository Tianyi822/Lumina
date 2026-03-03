/**
 * 主题管理 composable
 * 封装 uiStateStore 中的主题功能，提供便捷的主题操作接口
 */

import { type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore, type ThemeMeta } from '@renderer/stores/uiStateStore'

/**
 * 主题管理 composable
 * 通过 Pinia Store 管理主题状态，主题通过配置文件持久化
 */
export function useTheme(): {
  currentTheme: Ref<string>
  initTheme: () => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  getCurrentTheme: () => string
  getAvailableThemes: () => ThemeMeta[]
  getCurrentThemeMeta: () => ThemeMeta | undefined
  onThemeChange: (callback: (theme: string) => void) => () => void
} {
  const store = useUIStateStore()
  const { currentTheme } = storeToRefs(store)

  // 主题变更回调集合
  const themeChangeCallbacks: Set<(theme: string) => void> = new Set()

  /**
   * 获取当前主题
   */
  function getCurrentTheme(): string {
    return store.currentTheme
  }

  /**
   * 获取所有可用主题
   */
  function getAvailableThemes(): ThemeMeta[] {
    return store.getAvailableThemes()
  }

  /**
   * 获取当前主题的元数据
   */
  function getCurrentThemeMeta(): ThemeMeta | undefined {
    return store.currentThemeMeta
  }

  /**
   * 监听主题变化
   */
  function onThemeChange(callback: (theme: string) => void): () => void {
    themeChangeCallbacks.add(callback)
    return () => {
      themeChangeCallbacks.delete(callback)
    }
  }

  return {
    currentTheme,
    initTheme: store.initTheme,
    setTheme: async (themeId: string) => {
      await store.setTheme(themeId)
      // 触发回调
      themeChangeCallbacks.forEach((cb) => cb(themeId))
    },
    getCurrentTheme,
    getAvailableThemes,
    getCurrentThemeMeta,
    onThemeChange
  }
}
