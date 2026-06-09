/**
 * 窗口控制相关的 API
 */
export interface WindowApi {
  /** 最小化窗口 */
  minimize: () => Promise<void>
  /** 最大化或还原窗口 */
  maximize: () => Promise<void>
  /** 关闭窗口 */
  close: () => Promise<void>
  /** 检查窗口是否处于最大化状态 */
  isMaximized: () => Promise<boolean>
  /** 设置 Electron 原生主题 */
  setNativeTheme: (themeSource: 'dark' | 'light' | 'system') => Promise<void>
  /** 获取当前系统的主题 */
  getSystemTheme: () => Promise<'dark' | 'light'>
  /** 使用系统默认浏览器打开外部链接 */
  openExternal: (url: string) => Promise<void>
  /** 监听窗口最大化状态变化事件 */
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
  /** 监听系统主题变化（跟随系统主题时自动触发） */
  onSystemThemeChanged: (callback: (theme: 'dark' | 'light') => void) => () => void
}
