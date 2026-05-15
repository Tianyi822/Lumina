import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'
import type { UpdateStatus, UpdateStatusEvent, CheckUpdateResult } from '@shared/types/update'

import { logger } from '../logger'
import {
  classifyUpdateError,
  configurePlatformUpdateChannel,
  hasAvailableUpdate
} from './updateDiagnostics'

const MANUAL_DOWNLOAD_URL = 'https://github.com/Tianyi822/Lumina/releases/latest'

function isNewerVersion(newVersion: string, currentVersion: string): boolean {
  const parse = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0)
  const [a1, a2, a3] = parse(newVersion)
  const [b1, b2, b3] = parse(currentVersion)
  if (a1 !== b1) return a1 > b1
  if (a2 !== b2) return a2 > b2
  return a3 > b3
}

function usesManualInstallerUpdate(): boolean {
  return process.platform === 'darwin'
}

export class UpdateService {
  private mainWindow: BrowserWindow | null = null
  private status: UpdateStatus = 'idle'
  private lastCheckResult: Omit<CheckUpdateResult, 'success'> | null = null
  private lastCheckTime = 0
  private static readonly CHECK_CACHE_MS = 5 * 60 * 1000
  private _isQuittingForUpdate = false

  get isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate
  }

  constructor() {
    configurePlatformUpdateChannel(autoUpdater)

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
      const diagnostic = classifyUpdateError(error.message)
      logger.error('自动更新错误', 'main', { error: error.message })
      if (this.shouldSurfaceUpdaterError()) {
        this._isQuittingForUpdate = false
        this.setStatus('error', {
          ...diagnostic,
          manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode)
        })
      }
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
      this.emitCachedCheckResult(this.lastCheckResult)
      return { success: true, ...this.lastCheckResult }
    }

    this.setStatus('checking')

    if (usesManualInstallerUpdate()) {
      return this.checkForManualInstallerUpdate()
    }

    try {
      const result = await autoUpdater.checkForUpdates()
      const hasUpdate = hasAvailableUpdate(result)
      const version = result?.updateInfo.version
      const releaseNotes = result?.updateInfo.releaseNotes as string | undefined

      this.lastCheckResult = { hasUpdate, version, releaseNotes }
      this.lastCheckTime = Date.now()

      // electron-updater resolve 不代表有更新，hasUpdate 判断当前状态是否需要覆盖
      if (!hasUpdate && this.status === 'checking') {
        this.setStatus('not-available')
      }

      return { success: true, hasUpdate, version, releaseNotes }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const diagnostic = classifyUpdateError(message)
      let latestVersion: string | undefined
      let manualDownloadUrl: string | undefined

      logger.error('检查更新失败', 'main', { error: message })

      // autoUpdater 检查失败时，回退到 GitHub Releases API 判断是否真的没有新版本
      try {
        const { releaseNotesService } = await import('./index')
        const releasesResult = await releaseNotesService.getReleases()
        if (releasesResult.success && releasesResult.data && releasesResult.data.length > 0) {
          const latestRelease = releasesResult.data[0]
          latestVersion = latestRelease.version
          manualDownloadUrl = latestRelease.htmlUrl
          const currentVersion = app.getVersion()
          if (!isNewerVersion(latestVersion, currentVersion)) {
            this.lastCheckResult = { hasUpdate: false }
            this.lastCheckTime = Date.now()
            this.setStatus('not-available')
            return { success: true, hasUpdate: false }
          }
          logger.info('通过 Releases API 发现新版本，但 autoUpdater 检查失败', 'main', {
            latestVersion
          })
        }
      } catch (fallbackError) {
        logger.error('回退 Releases API 检查也失败', 'main', { error: String(fallbackError) })
      }

      this.setStatus('error', {
        ...diagnostic,
        version: latestVersion,
        manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode, manualDownloadUrl)
      })
      return {
        success: false,
        hasUpdate: latestVersion ? true : undefined,
        version: latestVersion,
        error: diagnostic.message,
        message: diagnostic.message,
        diagnosticCode: diagnostic.diagnosticCode,
        manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode, manualDownloadUrl)
      }
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (usesManualInstallerUpdate()) {
      return { success: false, error: '当前平台使用手动下载安装包更新' }
    }

    try {
      this.setStatus('downloading')
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const diagnostic = classifyUpdateError(message)
      logger.error('下载更新失败', 'main', { error: message })
      this.setStatus('error', {
        ...diagnostic,
        manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode)
      })
      return { success: false, error: diagnostic.message }
    }
  }

  quitAndInstall(): void {
    if (this.status === 'installing') {
      return
    }

    if (this.status !== 'downloaded') {
      logger.warn('忽略非下载完成状态的安装请求', 'main', { status: this.status })
      return
    }

    try {
      this._isQuittingForUpdate = true
      this.setStatus('installing')
      logger.info('开始退出并安装更新', 'main')
      autoUpdater.quitAndInstall()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const diagnostic = classifyUpdateError(message)
      logger.error('退出安装更新失败', 'main', {
        error: message
      })
      this._isQuittingForUpdate = false
      this.setStatus('error', {
        ...diagnostic,
        manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode)
      })
    }
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

  private shouldSurfaceUpdaterError(): boolean {
    return ['checking', 'downloading', 'downloaded', 'installing'].includes(this.status)
  }

  private emitCachedCheckResult(result: Omit<CheckUpdateResult, 'success'>): void {
    this.setStatus(result.hasUpdate ? 'available' : 'not-available', {
      version: result.version,
      releaseNotes: result.releaseNotes,
      message: result.message,
      diagnosticCode: result.diagnosticCode,
      manualDownloadUrl: result.manualDownloadUrl
    })
  }

  private async checkForManualInstallerUpdate(): Promise<CheckUpdateResult> {
    try {
      const { releaseNotesService } = await import('./index')
      const releasesResult = await releaseNotesService.getReleases()

      if (!releasesResult.success || !releasesResult.data || releasesResult.data.length === 0) {
        const message = releasesResult.error || '无法获取最新版本信息'
        this.setStatus('error', {
          diagnosticCode: 'unknown',
          message,
          manualDownloadUrl: MANUAL_DOWNLOAD_URL
        })
        return {
          success: false,
          error: message,
          message,
          diagnosticCode: 'unknown',
          manualDownloadUrl: MANUAL_DOWNLOAD_URL
        }
      }

      const latestRelease = releasesResult.data[0]
      const latestVersion = latestRelease.version
      const currentVersion = app.getVersion()

      if (!isNewerVersion(latestVersion, currentVersion)) {
        this.lastCheckResult = { hasUpdate: false }
        this.lastCheckTime = Date.now()
        this.setStatus('not-available')
        return { success: true, hasUpdate: false }
      }

      const result: Omit<CheckUpdateResult, 'success'> = {
        hasUpdate: true,
        version: latestVersion,
        releaseNotes: latestRelease.body,
        manualDownloadUrl: latestRelease.htmlUrl
      }

      this.lastCheckResult = result
      this.lastCheckTime = Date.now()
      this.setStatus('available', {
        version: latestVersion,
        releaseNotes: latestRelease.body,
        manualDownloadUrl: latestRelease.htmlUrl
      })

      return { success: true, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const diagnostic = classifyUpdateError(message)
      logger.error('手动安装包更新检查失败', 'main', { error: message })
      this.setStatus('error', {
        ...diagnostic,
        manualDownloadUrl: this.getManualDownloadUrl(diagnostic.diagnosticCode, MANUAL_DOWNLOAD_URL)
      })
      return {
        success: false,
        error: diagnostic.message,
        message: diagnostic.message,
        diagnosticCode: diagnostic.diagnosticCode,
        manualDownloadUrl: MANUAL_DOWNLOAD_URL
      }
    }
  }

  private getManualDownloadUrl(
    diagnosticCode: UpdateStatusEvent['diagnosticCode'],
    fallback?: string
  ): string | undefined {
    if (fallback) {
      return fallback
    }
    return diagnosticCode === 'signature-invalid' ? MANUAL_DOWNLOAD_URL : undefined
  }
}
