import { useState, useMemo, useEffect, useCallback } from 'react'
import MarkdownIt from 'markdown-it'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@renderer/i18n'
import { useUpdateStore } from '@renderer/stores/updateStore'
import styles from './UpdateSettings.module.css'

const currentVersion = __APP_VERSION__
const isDev = import.meta.env.DEV

/** 自动更新设置页面：检查更新、下载进度、版本历史和手动安装 */
export default function UpdateSettings() {
  const { t } = useTranslation()
  const status = useUpdateStore((s) => s.status)
  const progress = useUpdateStore((s) => s.progress)
  const latestVersion = useUpdateStore((s) => s.latestVersion)
  const manualDownloadUrl = useUpdateStore((s) => s.manualDownloadUrl)
  const releases = useUpdateStore((s) => s.releases)
  const loadingReleases = useUpdateStore((s) => s.loadingReleases)
  const releasesError = useUpdateStore((s) => s.releasesError)
  const errorMessage = useUpdateStore((s) => s.errorMessage)

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
      return progress ? `${Math.round(progress.percent)}%` : t('settings.update.downloading')
    }
    if (status === 'downloaded') return t('settings.update.restartInstall')
    if (status === 'installing') return t('settings.update.installing')
    return t('settings.update.updateNow')
  }, [status, progress, t])

  const statusText = useMemo(() => {
    switch (status) {
      case 'checking':
        return t('settings.update.statusChecking')
      case 'available':
        return latestVersion
          ? t('settings.update.statusAvailableVersion', { version: latestVersion })
          : t('settings.update.statusAvailable')
      case 'not-available':
        return t('settings.update.statusLatest')
      case 'downloaded':
        return t('settings.update.statusDownloaded')
      case 'installing':
        return t('settings.update.statusInstalling')
      case 'error':
        return errorMessage || t('settings.update.statusError')
      default:
        return ''
    }
  }, [status, latestVersion, errorMessage, t])

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
    return date.toLocaleDateString(getDateLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }, [])

  useEffect(() => {
    void fetchReleases(currentVersion)
  }, [fetchReleases])

  return (
    <div className={styles['update-settings']}>
      {/* 当前版本 */}
      <div className={styles['update-settings__section']}>
        <h3 className={styles['update-settings__section-title']}>
          {t('settings.update.currentVersion')}
        </h3>
        <p className={styles['update-settings__version']}>v{currentVersion}</p>
      </div>

      {/* 更新操作 */}
      <div className={styles['update-settings__section']}>
        <div className={styles['update-settings__actions']}>
          <button className="sm-button" disabled={!canCheck} onClick={handleCheck}>
            {status === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
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
              {t('settings.update.downloadLatest')}
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
        {isDev && (
          <p className={styles['update-settings__dev-hint']}>{t('settings.update.devHint')}</p>
        )}
      </div>

      {/* 版本历史 */}
      <div className={styles['update-settings__section']}>
        <h3 className={styles['update-settings__section-title']}>{t('settings.update.history')}</h3>

        {loadingReleases && (
          <div className={styles['update-settings__loading']}>
            {t('settings.update.loadingReleases')}
          </div>
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
                    <span className={styles['update-settings__current-badge']}>
                      {t('settings.update.currentBadge')}
                    </span>
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
