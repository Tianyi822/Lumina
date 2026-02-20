import { ref } from 'vue'

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
  }
]

// 当前主题
const currentTheme = ref<string>('blooming-flowers')

// 存储主题变更回调
const themeChangeCallbacks: Set<(theme: string) => void> = new Set()

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
export function useTheme() {
  /**
   * 初始化主题（从 localStorage 恢复）
   */
  function initTheme(): void {
    const savedTheme = localStorage.getItem('app-theme')
    if (savedTheme && AVAILABLE_THEMES.some((t) => t.id === savedTheme)) {
      currentTheme.value = savedTheme
    }
    applyThemeToDom(currentTheme.value)
  }

  /**
   * 设置主题
   */
  function setTheme(themeId: string): void {
    if (!AVAILABLE_THEMES.some((t) => t.id === themeId)) {
      console.warn(`[useTheme] Unknown theme: ${themeId}`)
      return
    }

    currentTheme.value = themeId
    applyThemeToDom(themeId)
    localStorage.setItem('app-theme', themeId)

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
