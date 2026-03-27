import { BrowserWindow, shell, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

/**
 * 主窗口实例
 */
let mainWindow: BrowserWindow | null = null

/**
 * 默认主题背景色
 * 使用默认主题 sparrow-dark 的背景色
 * 注意：主题颜色现在由 CSS 主题文件管理，窗口背景色仅用于启动时的初始显示
 */
const DEFAULT_BACKGROUND_COLOR = '#121212'

/**
 * 创建主窗口
 */
export function createMainWindow(): BrowserWindow {
  // 设置为深色模式，与默认主题 sparrow-dark 一致
  nativeTheme.themeSource = 'dark'

  // 获取主显示器的工作区尺寸（排除任务栏/Dock）
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    // 根据平台设置不同的标题栏样式
    // macOS: hidden 表示隐藏原生标题栏，但仍保留窗口控制按钮
    // Windows/Linux: frame: false 完全移除标题栏
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', frame: true }
      : { frame: false }),
    // 设置窗口背景色，使用默认深色主题的背景色
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
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

  // 拦截页面内导航，将外部 http/https 链接用系统默认浏览器打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      // 开发环境允许 localhost 热重载导航
      if (is.dev && parsedUrl.hostname === 'localhost') return
      event.preventDefault()
      shell.openExternal(url)
    }
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
 * 更新窗口背景色
 * 注意：新的主题系统由 CSS 管理，此函数仅用于设置窗口初始背景色
 * @param backgroundColor - 背景颜色（十六进制格式）
 */
export function updateWindowBackgroundColor(backgroundColor: string): void {
  if (mainWindow) {
    mainWindow.setBackgroundColor(backgroundColor)
  }
}
