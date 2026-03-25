/**
 * 窗口控制相关的 API
 */
export interface WindowApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
}
