import { BrowserWindow, shell, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { ThemeConfig } from '@shared/types/config'
import {
  getThemeBackgroundColor,
  normalizeThemeId,
  normalizeThemeMode,
  resolveEffectiveTheme,
  resolveNativeThemeSource
} from '@shared/utils'
import icon from '../../../resources/icon.png?asset'

/**
 * 主窗口实例
 */
let mainWindow: BrowserWindow | null = null

function formatLoadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getInitialThemeState(themeConfig?: ThemeConfig): {
  backgroundColor: string
  nativeSource: 'dark' | 'light' | 'system'
} {
  const mode = normalizeThemeMode(themeConfig?.mode)
  const manualTheme = normalizeThemeId(themeConfig?.name)
  const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const effectiveTheme = resolveEffectiveTheme(mode, manualTheme, systemTheme)

  return {
    backgroundColor: getThemeBackgroundColor(effectiveTheme),
    nativeSource: resolveNativeThemeSource(mode, manualTheme)
  }
}

/**
 * 创建主窗口
 */
export function createMainWindow(): BrowserWindow {
  const config = configManager.getConfig()
  nativeTheme.themeSource = 'system'
  const { backgroundColor, nativeSource } = getInitialThemeState(config?.theme)
  nativeTheme.themeSource = nativeSource
  const isMac = process.platform === 'darwin'

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
    ...(isMac
      ? {
          titleBarStyle: 'hidden',
          frame: true,
          trafficLightPosition: {
            x: 8,
            y: 8
          }
        }
      : { frame: false }),
    // 设置窗口背景色，尽量与首屏实际主题保持一致，减少闪烁
    backgroundColor,
    ...(!isMac ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
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

  const htmlFile = 'index.html'

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return

      logger.error('主窗口页面加载失败', 'main', {
        htmlFile,
        errorCode,
        errorDescription,
        validatedURL
      })
    }
  )

  // 开发环境下使用 electron-vite cli 的热模块替换
  // 生产环境加载本地 html 文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    void mainWindow.loadURL(rendererUrl).catch((error: unknown) => {
      logger.error('主窗口页面加载请求失败', 'main', {
        htmlFile,
        rendererUrl,
        error: formatLoadError(error)
      })
    })
  } else {
    const rendererFile = join(__dirname, `../renderer/${htmlFile}`)
    void mainWindow.loadFile(rendererFile).catch((error: unknown) => {
      logger.error('主窗口页面加载请求失败', 'main', {
        htmlFile,
        rendererFile,
        error: formatLoadError(error)
      })
    })
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
