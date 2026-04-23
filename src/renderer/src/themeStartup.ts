type StartupThemeMode = 'manual' | 'system'
type StartupThemeId = 'lumina-dark' | 'lumina-light'

interface ThemeSnapshot {
  mode?: StartupThemeMode
  name?: StartupThemeId
  effectiveTheme?: StartupThemeId
}

const STORAGE_KEY = 'lumina-theme-preference'

function resolveStartupTheme(): StartupThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return 'lumina-dark'
    }

    const snapshot = JSON.parse(raw) as ThemeSnapshot
    if (snapshot.mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'lumina-dark'
        : 'lumina-light'
    }

    if (snapshot.name === 'lumina-light' || snapshot.name === 'lumina-dark') {
      return snapshot.name
    }

    if (snapshot.effectiveTheme === 'lumina-light' || snapshot.effectiveTheme === 'lumina-dark') {
      return snapshot.effectiveTheme
    }
  } catch {
    // 忽略本地缓存异常，回退到默认主题
  }

  return 'lumina-dark'
}

const startupTheme = resolveStartupTheme()
const html = document.documentElement

html.setAttribute('data-theme', startupTheme)
html.style.colorScheme = startupTheme === 'lumina-light' ? 'light' : 'dark'
