import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境下使用 electron-vite cli 的热模块替换
  // 生产环境加载本地 html 文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
// 某些 API 只能在此事件发生后使用
app.whenReady().then(() => {
  // 为 Windows 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 开发环境下默认按 F12 打开或关闭开发者工具
  // 生产环境下忽略 CommandOrControl + R
  // 参见 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 处理程序可以在此注册

  createWindow()

  app.on('activate', function () {
    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，
    // 通常会重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 当所有窗口都关闭时退出应用，macOS 除外
// 在 macOS 上，应用和菜单栏通常会保持活动状态，直到用户使用 Cmd + Q 显式退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在此文件中，你可以包含应用特定的主进程代码的其余部分
// 也可以将它们放在单独的文件中并在此引入
