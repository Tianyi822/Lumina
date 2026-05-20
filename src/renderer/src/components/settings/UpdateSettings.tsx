import { useState, useMemo, useEffect, useCallback } from 'react'
import MarkdownIt from 'markdown-it'
import { useUpdateStore } from '@renderer/stores/updateStore'
import styles from './UpdateSettings.module.css'

const currentVersion = __APP_VERSION__
const isDev = import.meta.env.DEV

export default function UpdateSettings() {
  const status = useUpdateStore((s) => s.status)
  const progress = useUpdateStore((s) => s.progress)
  const latestVersion = useUpdateStore((s) => s.latestVersion)
  const manualDownloadUrl = useUpdateStore((s) => s.manualDownloadUrl)
  const releases = useUpdateStore((s) => s.releases)
  const loadingReleases = useUpdateStore((s) => s.loadingReleases)
  const releasesError = useUpdateStore((s) => s.releasesError)
  const errorMessage = useUpdateStore((s) => s.errorMessage)

  const setupListeners = useUpdateStore((s) => s.setupListeners)
  const cleanupListeners = useUpdateStore((s) => s.cleanupListeners)
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate)
  const downloadUpdate = useUpdateStore((s) => s.downloadUpdate)
  const quitAndInstall = useUpdateStore((s) => s.quitAndInstall)
  const openManualDownload = useUpdateStore((s) => s.openManualDownload)
  const fetchReleases = useUpdateStore((s) => s.fetchReleases)

  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)

  const md = useMemo(() => new MarkdownIt({ html: false, linkify: true, breaks: true }), [])

  const canCheck = useMemo(
    () => !isDev && status !== 'checking' && status !== 'downloading' && status !== 'installing',
    [status]
  )

  const canUpdate = useMemo(() => status === 'available', [status])

  const canInstall = useMemo(() => status === 'downloaded', [status])

  const canManualDownload = useMemo(
    () => !!manualDownloadUrl && status === 'error',
    [manualDownloadUrl, status]
  )

  const updateButtonText = useMemo(() => {
    if (status === 'downloading') {
      return progress ? `${Math.round(progress.percent)}%` : '下载中...'
    }
    if (status === 'downloaded') return '重启安装'
    if (status === 'installing') return '正在安装...'
    return '立即更新'
  }, [status, progress])

  const statusText = useMemo(() => {
    switch (status) {
      case 'checking':
        return '正在检查更新...'
      case 'available':
        return latestVersion ? `发现新版本 v${latestVersion}` : '发现新版本'
      case 'not-available':
        return '已是最新版本'
      case 'downloaded':
        return '下载完成，点击"重启安装"完成更新'
      case 'installing':
        return '正在重启安装...'
      case 'error':
        return errorMessage || '检查更新失败，请稍后重试'
      default:
        return ''
    }
  }, [status, latestVersion, errorMessage])

  const handleCheck = useCallback(() => {
    checkForUpdate()
  }, [checkForUpdate])

  const handleUpdate = useCallback(async () => {
    if (status === 'downloaded') {
      quitAndInstall()
    } else if (status === 'available') {
      if (manualDownloadUrl) {
        await openManualDownload()
        return
      }
      await downloadUpdate()
    }
  }, [status, manualDownloadUrl, quitAndInstall, openManualDownload, downloadUpdate])

  const handleManualDownload = useCallback(() => {
    openManualDownload()
  }, [openManualDownload])

  const toggleExpand = useCallback((version: string) => {
    setExpandedVersion((prev) => (prev === version ? null : version))
  }, [])

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }, [])

  useEffect(() => {
    setupListeners()
    fetchReleases(currentVersion)
    return () => cleanupListeners()
  }, [setupListeners, cleanupListeners, fetchReleases])

  return (
    <div className={styles['update-settings']}>
      {/* 当前版本 */}
      <div className={styles['update-settings__section']}>
        <h3 className={styles['update-settings__section-title']}>当前版本</h3>
        <p className={styles['update-settings__version']}>v{currentVersion}</p>
      </div>

      {/* 更新操作 */}
      <div className={styles['update-settings__section']}>
        <div className={styles['update-settings__actions']}>
          <button className="sm-button" disabled={!canCheck} onClick={handleCheck}>
            {status === 'checking' ? '检查中...' : '检查更新'}
          </button>
          <button
            className="sm-button sm-button--primary"
            disabled={!canUpdate && !canInstall}
            onClick={handleUpdate}
          >
            {updateButtonText}
          </button>
          {canManualDownload && (
            <button
              className={[
                'sm-button',
                'sm-button--primary',
                styles['update-settings__manual-link']
              ].join(' ')}
              onClick={handleManualDownload}
            >
              下载最新版本
            </button>
          )}
        </div>

        {/* 进度条 */}
        {status === 'downloading' && progress && (
          <div className={styles['update-settings__progress']}>
            <div className={styles['update-settings__progress-bar']}>
              <div
                className={styles['update-settings__progress-fill']}
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>
            <span className={styles['update-settings__progress-text']}>
              {(progress.transferred / 1048576).toFixed(1)} /{' '}
              {(progress.total / 1048576).toFixed(1)} MB
            </span>
          </div>
        )}

        {/* 状态提示 */}
        {statusText && (
          <p className={[styles['update-settings__status'], styles[`is-${status}`]].join(' ')}>
            {statusText}
          </p>
        )}

        {/* 开发模式提示 */}
        {isDev && <p className={styles['update-settings__dev-hint']}>开发模式下更新功能不可用</p>}
      </div>

      {/* 版本历史 */}
      <div className={styles['update-settings__section']}>
        <h3 className={styles['update-settings__section-title']}>历史版本</h3>

        {loadingReleases && (
          <div className={styles['update-settings__loading']}>正在加载版本历史...</div>
        )}

        {releasesError && <div className={styles['update-settings__error']}>{releasesError}</div>}

        {!loadingReleases && !releasesError && (
          <div className={styles['update-settings__releases']}>
            {releases.map((release) => (
              <div
                key={release.version}
                className={[
                  styles['update-settings__release'],
                  expandedVersion === release.version && styles['is-expanded']
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  className={styles['update-settings__release-header']}
                  onClick={() => toggleExpand(release.version)}
                >
                  <span className={styles['update-settings__release-toggle']}>
                    {expandedVersion === release.version ? '▼' : '▶'}
                  </span>
                  <span className={styles['update-settings__release-version']}>
                    v{release.version}
                  </span>
                  <span className={styles['update-settings__release-date']}>
                    {formatDate(release.publishedAt)}
                  </span>
                  {release.version === currentVersion && (
                    <span className={styles['update-settings__current-badge']}>当前版本</span>
                  )}
                </button>

                {expandedVersion === release.version && (
                  <div className={styles['update-settings__release-body']}>
                    <div
                      className={styles['update-settings__release-content']}
                      dangerouslySetInnerHTML={{ __html: md.render(release.body) }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
