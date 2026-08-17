import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { useKnowledgeMCP } from './hooks/useKnowledgeMCP'
import styles from './KnowledgeMCPSettings.module.css'

/** 知识库 MCP 服务设置页：启动/停止 MCP 服务，展示服务端配置 JSON */
export default function KnowledgeMCPSettings() {
  const { t } = useTranslation()
  const {
    status,
    config: configJSON,
    loading,
    error,
    start,
    stop,
    refreshStatus
  } = useKnowledgeMCP()
  const [toggling, setToggling] = useState(false)
  const [copying, setCopying] = useState(false)

  const enabled = status.running

  // 切换服务状态
  const handleToggle = useCallback(async () => {
    if (toggling || loading) return

    setToggling(true)
    try {
      if (enabled) {
        const result = await stop()
        if (result.success) {
          notifySuccess(
            t('notifications.settings.knowledgeMcp.title'),
            t('notifications.settings.knowledgeMcp.stopped'),
            { source: 'settings' }
          )
        } else {
          notifyError(
            t('notifications.settings.knowledgeMcp.title'),
            t('notifications.settings.knowledgeMcp.stopFailed'),
            { source: 'settings' }
          )
        }
      } else {
        const result = await start()
        if (result.success) {
          notifySuccess(
            t('notifications.settings.knowledgeMcp.title'),
            t('notifications.settings.knowledgeMcp.started'),
            { source: 'settings' }
          )
        } else {
          notifyError(
            t('notifications.settings.knowledgeMcp.title'),
            `${t('notifications.settings.knowledgeMcp.startFailedPrefix')}${
              result.error || t('notifications.settings.knowledgeMcp.unknownError')
            }`,
            { source: 'settings' }
          )
        }
      }
      await refreshStatus()
    } catch (error) {
      notifyError(
        t('notifications.settings.knowledgeMcp.title'),
        `${t('notifications.settings.knowledgeMcp.operationFailedPrefix')}${
          error instanceof Error ? error.message : String(error)
        }`,
        { source: 'settings' }
      )
    } finally {
      setToggling(false)
    }
  }, [enabled, toggling, loading, start, stop, refreshStatus, t])

  // 复制配置
  const handleCopy = useCallback(async () => {
    if (!configJSON) return

    setCopying(true)
    try {
      await navigator.clipboard.writeText(configJSON)
      notifySuccess(
        t('notifications.settings.knowledgeMcp.title'),
        t('notifications.settings.knowledgeMcp.copied'),
        { source: 'settings' }
      )
    } catch (error) {
      notifyError(
        t('notifications.settings.knowledgeMcp.title'),
        `${t('notifications.settings.knowledgeMcp.copyFailedPrefix')}${
          error instanceof Error ? error.message : String(error)
        }`,
        { source: 'settings' }
      )
    } finally {
      setCopying(false)
    }
  }, [configJSON, t])

  return (
    <div className={['sm-settings-page', styles['knowledge-mcp-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.knowledgeMcp.title')}</h2>
        <p className="sm-settings-page__description">{t('settings.knowledgeMcp.description')}</p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">
              {t('settings.knowledgeMcp.statusTitle')}
            </h3>
            <p className="sm-settings-page__section-description">
              {t('settings.knowledgeMcp.statusDescription')}
            </p>
          </div>
        </div>

        <button
          className={[
            styles['mcp-toggle'],
            enabled && styles.enabled,
            (toggling || loading) && styles.disabled
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={toggling || loading}
          type="button"
          onClick={handleToggle}
        >
          <div className={styles['toggle-switch']}>
            <div className={styles['toggle-thumb']}></div>
          </div>
          <span className={styles['toggle-label']}>{t('settings.knowledgeMcp.enableToggle')}</span>
          {enabled ? (
            <span className={[styles['status-badge'], styles.active].join(' ')}>
              {t('settings.knowledgeMcp.running')}
            </span>
          ) : (
            <span className={styles['status-badge']}>{t('settings.knowledgeMcp.stopped')}</span>
          )}
        </button>
        {error && !loading && <p className={styles['mcp-error']}>{error}</p>}
      </section>

      {enabled && configJSON && (
        <section className="sm-settings-page__section">
          <div className={styles['config-header']}>
            <div>
              <h3 className="sm-settings-page__section-title">
                {t('settings.knowledgeMcp.configTitle')}
              </h3>
              <p className="sm-settings-page__section-description">
                {t('settings.knowledgeMcp.configDescription')}
              </p>
            </div>
            <button
              className={['sm-button', 'sm-button--small', styles['copy-btn']].join(' ')}
              disabled={copying}
              onClick={handleCopy}
            >
              {copying ? t('common.copying') : t('common.copy')}
            </button>
          </div>
          <div className={styles['config-url']}>
            <span className={styles['url-label']}>{t('settings.knowledgeMcp.serverUrl')}</span>
            <span className={styles['url-value']}>{status.url}</span>
          </div>
          <pre className={styles['config-json']}>
            <code>{configJSON}</code>
          </pre>
        </section>
      )}

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">
              {t('settings.knowledgeMcp.guideTitle')}
            </h3>
            <p className="sm-settings-page__section-description">
              {t('settings.knowledgeMcp.guideDescription')}
            </p>
          </div>
        </div>

        <div className={styles['description-section']}>
          <div className={styles['description-block']}>
            <h5>{t('settings.knowledgeMcp.introTitle')}</h5>
            <p>{t('settings.knowledgeMcp.introBody')}</p>
          </div>

          <div className={styles['description-block']}>
            <h5>{t('settings.knowledgeMcp.scenariosTitle')}</h5>
            <ul>
              <li>{t('settings.knowledgeMcp.scenario1')}</li>
              <li>{t('settings.knowledgeMcp.scenario2')}</li>
              <li>{t('settings.knowledgeMcp.scenario3')}</li>
            </ul>
          </div>

          <div className={styles['description-block']}>
            <h5>{t('settings.knowledgeMcp.howtoTitle')}</h5>
            <ol>
              <li>{t('settings.knowledgeMcp.howto1')}</li>
              <li>{t('settings.knowledgeMcp.howto2')}</li>
              <li>{t('settings.knowledgeMcp.howto3')}</li>
              <li>{t('settings.knowledgeMcp.howto4')}</li>
            </ol>
          </div>

          <div className={[styles['description-block'], styles.warning].join(' ')}>
            <h5>{t('settings.knowledgeMcp.securityTitle')}</h5>
            <ul>
              <li>{t('settings.knowledgeMcp.security1')}</li>
              <li>{t('settings.knowledgeMcp.security2')}</li>
              <li>{t('settings.knowledgeMcp.security3')}</li>
              <li>{t('settings.knowledgeMcp.security4')}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
