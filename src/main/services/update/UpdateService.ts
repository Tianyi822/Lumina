import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { logger } from '../logger'
import type { UpdateStatus, UpdateStatusEvent, CheckUpdateResult } from '@shared/types/update'

export class UpdateService {
  private mainWindow: BrowserWindow | null = null
  private status: UpdateStatus = 'idle'
  private lastCheckResult: { hasUpdate: boolean; version?: string } | null = null
  private lastCheckTime = 0
  private static readonly CHECK_CACHE_MS = 5 * 60 * 1000

  constructor() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setStatus('available', {
        version: info.version,
        releaseNotes: info.releaseNotes as string | undefined
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.lastCheckResult = { hasUpdate: false }
      this.setStatus('not-available')
    })

    autoUpdater.on('download-progress', (progressInfo) => {
      this.sendToRenderer('update:on-progress', {
        percent: progressInfo.percent,
        bytesPerSecond: progressInfo.bytesPerSecond,
        transferred: progressInfo.transferred,
        total: progressInfo.total
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.setStatus('downloaded')
    })

    autoUpdater.on('error', (error: Error) => {
      logger.error('自动更新错误', 'main', { error: error.message })
      this.setStatus('error', { message: error.message })
    })
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async checkForUpdate(): Promise<CheckUpdateResult> {
    if (!app.isPackaged) {
      return { success: false, error: '开发模式下不可用' }
    }

    if (this.lastCheckResult && Date.now() - this.lastCheckTime < UpdateService.CHECK_CACHE_MS) {
      return { success: true, ...this.lastCheckResult }
    }

    try {
      this.setStatus('checking')
      const result = await autoUpdater.checkForUpdates()
      const hasUpdate = result?.updateInfo != null
      const version = result?.updateInfo.version
      const releaseNotes = result?.updateInfo.releaseNotes as string | undefined

      this.lastCheckResult = { hasUpdate, version }
      this.lastCheckTime = Date.now()

      return { success: true, hasUpdate, version, releaseNotes }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('检查更新失败', 'main', { error: message })
      this.setStatus('error', { message })
      return { success: false, error: message }
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      this.setStatus('downloading')
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('下载更新失败', 'main', { error: message })
      this.setStatus('error', { message })
      return { success: false, error: message }
    }
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  private setStatus(status: UpdateStatus, data?: Partial<UpdateStatusEvent>): void {
    this.status = status
    const event: UpdateStatusEvent = { status, ...data }
    this.sendToRenderer('update:on-status', event)
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}
