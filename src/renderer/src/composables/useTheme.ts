import { ref } from 'vue'
import type { AppConfig, ThemeConfig } from '@shared/types/config'

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
    id: 'blooming-flowers',
    name: 'Blooming Flowers',
    description: '繁花主题，自然清新的绿色系',
    previewColors: {
      primary: '#0a594e',
      secondary: '#46aa8f',
      accent: '#70d75c',
      extra1: '#d0ed35',
      extra2: '#ffb003'
    }
  },
  {
    id: 'sunset-coast',
    name: 'Sunset Coast',
    description: '日落海岸，海洋与天空的温暖渐变',
    previewColors: {
      primary: '#014944',
      secondary: '#347a73',
      accent: '#7c93ce',
      extra1: '#c7b6dc',
      extra2: '#fcccc9'
    }
  }
]

// 当前主题
const currentTheme = ref<string>('blooming-flowers')

// 存储主题变更回调
const themeChangeCallbacks: Set<(theme: string) => void> = new Set()

// 标记是否已初始化
let initialized = false

/**
 * 应用主题到 DOM
 */
function applyThemeToDom(themeId: string): void {
  const html = document.documentElement
  html.setAttribute('data-theme', themeId)
}

/**
 * 主题管理 composable
 */
export function useTheme(): {
  currentTheme: typeof currentTheme
  initTheme: () => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  getCurrentTheme: () => string
  getAvailableThemes: () => ThemeMeta[]
  getCurrentThemeMeta: () => ThemeMeta | undefined
  onThemeChange: (callback: (theme: string) => void) => () => void
} {
  /**
   * 初始化主题（从配置文件恢复）
   */
  async function initTheme(): Promise<void> {
    // 避免重复初始化
    if (initialized) {
      return
    }

    try {
      // 从配置文件读取主题
      const config = (await window.api.config.getConfig()) as AppConfig | null
      if (config?.theme?.name && AVAILABLE_THEMES.some((t) => t.id === config.theme.name)) {
        currentTheme.value = config.theme.name
      } else {
        // 配置文件中没有有效主题，使用默认值
        currentTheme.value = 'blooming-flowers'
      }
    } catch (error) {
      console.warn('[useTheme] 无法从配置文件加载主题，使用默认主题', error)
      currentTheme.value = 'blooming-flowers'
    }

    applyThemeToDom(currentTheme.value)
    initialized = true
  }

  /**
   * 设置主题（同时保存到配置文件）
   */
  async function setTheme(themeId: string): Promise<void> {
    if (!AVAILABLE_THEMES.some((t) => t.id === themeId)) {
      console.warn(`[useTheme] Unknown theme: ${themeId}`)
      return
    }

    currentTheme.value = themeId
    applyThemeToDom(themeId)

    // 保存主题到配置文件
    try {
      const themeConfig: ThemeConfig = {
        name: themeId
      }
      await window.api.config.updateConfig({ theme: themeConfig })
    } catch (error) {
      console.error('[useTheme] 保存主题配置失败', error)
    }

    // 触发回调
    themeChangeCallbacks.forEach((cb) => cb(themeId))
  }

  /**
   * 获取当前主题
   */
  function getCurrentTheme(): string {
    return currentTheme.value
  }

  /**
   * 获取所有可用主题
   */
  function getAvailableThemes(): ThemeMeta[] {
    return AVAILABLE_THEMES
  }

  /**
   * 获取当前主题的元数据
   */
  function getCurrentThemeMeta(): ThemeMeta | undefined {
    return AVAILABLE_THEMES.find((t) => t.id === currentTheme.value)
  }

  /**
   * 监听主题变化
   */
  function onThemeChange(callback: (theme: string) => void): () => void {
    themeChangeCallbacks.add(callback)
    // 返回取消监听函数
    return () => {
      themeChangeCallbacks.delete(callback)
    }
  }

  return {
    currentTheme,
    initTheme,
    setTheme,
    getCurrentTheme,
    getAvailableThemes,
    getCurrentThemeMeta,
    onThemeChange
  }
}

// 导出单例实例的便捷方法
let themeInstance: ReturnType<typeof useTheme> | null = null

export function getThemeInstance(): ReturnType<typeof useTheme> {
  if (!themeInstance) {
    themeInstance = useTheme()
  }
  return themeInstance
}

/**
 * 重置初始化状态（仅用于测试）
 */
export function resetThemeInit(): void {
  initialized = false
}
