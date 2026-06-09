import type { ThemeMode } from '../types/config'

/** 主题标识：深色或浅色 */
export type ThemeId = 'lumina-dark' | 'lumina-light'
/** 系统级主题偏好 */
export type SystemTheme = 'dark' | 'light'
/** 原生主题来源：跟随系统、浅色或深色 */
export type NativeThemeSource = SystemTheme | 'system'

/** 默认主题：深色 */
export const DEFAULT_THEME_ID: ThemeId = 'lumina-dark'
/** 默认主题切换模式：手动 */
export const DEFAULT_THEME_MODE: ThemeMode = 'manual'

/** 各主题对应的背景色映射表 */
const THEME_BACKGROUND_COLORS: Record<ThemeId, string> = {
  'lumina-dark': '#121212',
  'lumina-light': '#f5f5f7'
}

/** 判断字符串是否为合法的主题标识 */
export function isThemeId(value: string): value is ThemeId {
  return value === 'lumina-dark' || value === 'lumina-light'
}

/** 规范化主题标识，无效值回退到默认主题 */
export function normalizeThemeId(value?: string): ThemeId {
  return value && isThemeId(value) ? value : DEFAULT_THEME_ID
}

/** 规范化主题模式，非 system 值回退到手动模式 */
export function normalizeThemeMode(value?: ThemeMode): ThemeMode {
  return value === 'system' ? 'system' : DEFAULT_THEME_MODE
}

/** 根据系统主题解析对应的应用主题 */
export function resolveThemeFromSystem(systemTheme: SystemTheme): ThemeId {
  return systemTheme === 'dark' ? 'lumina-dark' : 'lumina-light'
}

/** 根据模式和手动选择计算最终生效的主题 */
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

/** 解析原生主题来源，用于 Tray/菜单栏跟随系统切换 */
export function resolveNativeThemeSource(mode: ThemeMode, manualTheme: ThemeId): NativeThemeSource {
  if (mode === 'system') {
    return 'system'
  }

  return manualTheme === 'lumina-light' ? 'light' : 'dark'
}

/** 获取主题对应的背景色值 */
export function getThemeBackgroundColor(themeId: ThemeId): string {
  return THEME_BACKGROUND_COLORS[themeId]
}
