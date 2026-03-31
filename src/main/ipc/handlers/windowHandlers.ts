import { ipcMain, shell, nativeTheme } from 'electron'
import { getMainWindow } from '@main/core'

/**
 * 注册窗口控制相关处理程序
 */
export function registerWindowHandlers(): void {
  const sendSystemThemeChanged = (): void => {
    const window = getMainWindow()
    if (!window) {
      return
    }

    window.webContents.send(
      'window:system-theme-changed',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  }

  // 最小化窗口
  ipcMain.handle('window:minimize', () => {
    const window = getMainWindow()
    if (window) {
      window.minimize()
    }
  })

  // 最大化或还原窗口
  ipcMain.handle('window:maximize', () => {
    const window = getMainWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  // 关闭窗口
  ipcMain.handle('window:close', () => {
    const window = getMainWindow()
    if (window) {
      window.close()
    }
  })

  // 检查窗口是否最大化
  ipcMain.handle('window:isMaximized', () => {
    const window = getMainWindow()
    if (window) {
      return window.isMaximized()
    }
    return false
  })

  // 使用系统默认浏览器打开外部链接
  ipcMain.handle('window:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // 设置 Electron 原生主题
  ipcMain.handle('window:setNativeTheme', (_event, themeSource: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = themeSource
  })

  // 获取当前系统主题
  ipcMain.handle('window:getSystemTheme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  // 监听窗口最大化状态变化
  const window = getMainWindow()
  if (window) {
    window.on('maximize', () => {
      window.webContents.send('window:maximized-changed', true)
    })

    window.on('unmaximize', () => {
      window.webContents.send('window:maximized-changed', false)
    })
  }

  nativeTheme.on('updated', () => {
    sendSystemThemeChanged()
  })
}
