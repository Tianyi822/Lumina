type StartupThemeMode = 'manual' | 'system'
type StartupThemeId = 'sparrow-dark' | 'sparrow-light'

interface ThemeSnapshot {
  mode?: StartupThemeMode
  name?: StartupThemeId
  effectiveTheme?: StartupThemeId
}

const STORAGE_KEY = 'sparrow-theme-preference'

function resolveStartupTheme(): StartupThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return 'sparrow-dark'
    }

    const snapshot = JSON.parse(raw) as ThemeSnapshot
    if (snapshot.mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'sparrow-dark'
        : 'sparrow-light'
    }

    if (snapshot.name === 'sparrow-light' || snapshot.name === 'sparrow-dark') {
      return snapshot.name
    }

    if (snapshot.effectiveTheme === 'sparrow-light' || snapshot.effectiveTheme === 'sparrow-dark') {
      return snapshot.effectiveTheme
    }
  } catch {
    // 忽略本地缓存异常，回退到默认主题
  }

  return 'sparrow-dark'
}

const startupTheme = resolveStartupTheme()
const html = document.documentElement

html.setAttribute('data-theme', startupTheme)
html.style.colorScheme = startupTheme === 'sparrow-light' ? 'light' : 'dark'
