import { ipcMain, shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'

const execAsync = promisify(exec)

export interface DockerCheckResult {
  installed: boolean
  version?: string
  error?: string
}

export type PlatformType = 'darwin' | 'win32' | 'linux'

/**
 * 注册沙箱相关的 IPC 处理程序
 */
export function registerSandboxHandlers(): void {
  ipcMain.handle('sandbox:checkDocker', async (): Promise<DockerCheckResult> => {
    try {
      const { stdout } = await execAsync('docker --version', { timeout: 5000 })
      const versionMatch = stdout.match(/Docker version ([\d.]+)/)
      const version = versionMatch ? versionMatch[1] : stdout.trim()

      logger.info('Docker 检测成功', 'main', { version })

      return {
        installed: true,
        version
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (
        errorMessage.includes('command not found') ||
        errorMessage.includes('not recognized') ||
        errorMessage.includes('ENOENT')
      ) {
        logger.info('Docker 未安装', 'main')
        return {
          installed: false,
          error: 'Docker 未安装'
        }
      }

      logger.warn('Docker 检测失败', 'main', { error: errorMessage })
      return {
        installed: false,
        error: errorMessage
      }
    }
  })

  ipcMain.handle('sandbox:getPlatform', (): PlatformType => {
    return process.platform as PlatformType
  })

  ipcMain.handle('sandbox:openExternal', async (_event, url: string): Promise<void> => {
    try {
      await shell.openExternal(url)
      logger.info('打开外部链接', 'main', { url })
    } catch (error) {
      logger.error('打开外部链接失败', 'main', { url, error })
      throw error
    }
  })
}
