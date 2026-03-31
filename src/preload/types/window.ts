/**
 * 窗口控制相关的 API
 */
export interface WindowApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  setNativeTheme: (themeSource: 'dark' | 'light' | 'system') => Promise<void>
  getSystemTheme: () => Promise<'dark' | 'light'>
  openExternal: (url: string) => Promise<void>
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
  onSystemThemeChanged: (callback: (theme: 'dark' | 'light') => void) => () => void
}
