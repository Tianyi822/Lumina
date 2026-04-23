import type { ThemeMode } from '../types/config'

export type ThemeId = 'lumina-dark' | 'lumina-light'
export type SystemTheme = 'dark' | 'light'
export type NativeThemeSource = SystemTheme | 'system'

export const DEFAULT_THEME_ID: ThemeId = 'lumina-dark'
export const DEFAULT_THEME_MODE: ThemeMode = 'manual'

const THEME_BACKGROUND_COLORS: Record<ThemeId, string> = {
  'lumina-dark': '#121212',
  'lumina-light': '#f5f5f7'
}

export function isThemeId(value: string): value is ThemeId {
  return value === 'lumina-dark' || value === 'lumina-light'
}

export function normalizeThemeId(value?: string): ThemeId {
  return value && isThemeId(value) ? value : DEFAULT_THEME_ID
}

export function normalizeThemeMode(value?: ThemeMode): ThemeMode {
  return value === 'system' ? 'system' : DEFAULT_THEME_MODE
}

export function resolveThemeFromSystem(systemTheme: SystemTheme): ThemeId {
  return systemTheme === 'dark' ? 'lumina-dark' : 'lumina-light'
}

export function resolveEffectiveTheme(
  mode: ThemeMode,
  manualTheme: ThemeId,
  systemTheme: SystemTheme
): ThemeId {
  if (mode === 'system') {
    return resolveThemeFromSystem(systemTheme)
  }

  return manualTheme
}

export function resolveNativeThemeSource(mode: ThemeMode, manualTheme: ThemeId): NativeThemeSource {
  if (mode === 'system') {
    return 'system'
  }

  return manualTheme === 'lumina-light' ? 'light' : 'dark'
}

export function getThemeBackgroundColor(themeId: ThemeId): string {
  return THEME_BACKGROUND_COLORS[themeId]
}
