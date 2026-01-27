import { BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { DEFAULT_THEME_COLORS } from '../services/config/ConfigManager'
import type { ThemeColors } from '../types/config'

/**
 * 主窗口实例
 */
let mainWindow: BrowserWindow | null = null

/**
 * 当前主题颜色
 */
let currentThemeColors: ThemeColors = DEFAULT_THEME_COLORS

/**
 * 创建主窗口
 */
export function createMainWindow(): BrowserWindow {
  // 设置为深色模式，与终端主题一致
  nativeTheme.themeSource = 'dark'

  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // 根据平台设置不同的标题栏样式
    // macOS: hidden 表示隐藏原生标题栏，但仍保留窗口控制按钮
    // Windows/Linux: frame: false 完全移除标题栏
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', frame: true }
      : { frame: false }),
    // 设置窗口背景色，与主题一致
    backgroundColor: currentThemeColors.background,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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

  return mainWindow
}

/**
 * 获取主窗口实例
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * 更新主题颜色
 * 当配置加载后调用此函数更新窗口背景色
 */
export function updateThemeColors(colors: ThemeColors): void {
  currentThemeColors = colors
  if (mainWindow) {
    mainWindow.setBackgroundColor(colors.background)
  }
}

/**
 * 获取当前主题颜色
 */
export function getThemeColors(): ThemeColors {
  return currentThemeColors
}
