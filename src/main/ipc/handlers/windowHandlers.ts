import { ipcMain } from 'electron'
import { getMainWindow } from '@main/core'

/**
 * 注册窗口控制相关处理程序
 */
export function registerWindowHandlers(): void {
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
}
