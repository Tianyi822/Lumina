import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getDateLocale } from '@renderer/i18n'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { useSyncStore } from '@renderer/stores/syncStore'
import type { RelayEvent } from '@shared/types/sync'
import styles from './SyncSettings.module.css'

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Lumina Relay 数据同步设置页（Scope A：连接、设备、同步组与事件状态）。 */
export default function SyncSettings() {
  const { t } = useTranslation()
  const status = useSyncStore((state) => state.status)
  const storedRelayUrl = useSyncStore((state) => state.relayUrl)
  const storedUsername = useSyncStore((state) => state.username)
  const deviceInfo = useSyncStore((state) => state.deviceInfo)
  const syncGroupId = useSyncStore((state) => state.syncGroupId)
  const groupRevision = useSyncStore((state) => state.groupRevision)
  const hasOtherSyncData = useSyncStore((state) => state.hasOtherSyncData)
  const devices = useSyncStore((state) => state.devices)
  const generatedCode = useSyncStore((state) => state.generatedCode)
  const codeSecondsRemaining = useSyncStore((state) => state.codeSecondsRemaining)
  const eventConnected = useSyncStore((state) => state.eventConnected)
  const lastEvent = useSyncStore((state) => state.lastEvent)
  const lastReconcile = useSyncStore((state) => state.lastReconcile)
  const pendingAction = useSyncStore((state) => state.pendingAction)
  const error = useSyncStore((state) => state.error)
  const sessionSync = useSyncStore((state) => state.sessionSync)
  const configSync = useSyncStore((state) => state.configSync)
  const writerSync = useSyncStore((state) => state.writerSync)
  const knowledgeSync = useSyncStore((state) => state.knowledgeSync)
  const paperSync = useSyncStore((state) => state.paperSync)

  const discover = useSyncStore((state) => state.discover)
  const connect = useSyncStore((state) => state.connect)
  const disconnect = useSyncStore((state) => state.disconnect)
  const renewSession = useSyncStore((state) => state.renewSession)
  const refreshStatus = useSyncStore((state) => state.refreshStatus)
  const generateSyncCode = useSyncStore((state) => state.generateSyncCode)
  const redeemSyncCode = useSyncStore((state) => state.redeemSyncCode)
  const listDevices = useSyncStore((state) => state.listDevices)
  const revokeDevice = useSyncStore((state) => state.revokeDevice)
  const discardOtherGroups = useSyncStore((state) => state.discardOtherGroups)
  const reconcile = useSyncStore((state) => state.reconcile)
  const syncAllNow = useSyncStore((state) => state.syncAllNow)
  const bindConfigSyncState = useSyncStore((state) => state.bindConfigSyncState)
  const bindWriterSyncState = useSyncStore((state) => state.bindWriterSyncState)
  const bindKnowledgeSyncState = useSyncStore((state) => state.bindKnowledgeSyncState)
  const bindPaperSyncState = useSyncStore((state) => state.bindPaperSyncState)
  const requestConfirm = useNotificationCenterStore((state) => state.requestConfirm)

  function formatTimestamp(unixSeconds: number | null): string {
    if (!unixSeconds) return t('settings.sync.unknown')
    return new Date(unixSeconds * 1000).toLocaleString(getDateLocale())
  }

  function formatIsoDateTime(iso: string | null): string {
    if (!iso) return t('settings.sync.never')
    const time = Date.parse(iso)
    if (Number.isNaN(time)) return t('settings.sync.never')
    return new Date(time).toLocaleString(getDateLocale())
  }

  function formatLastSeen(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleString(getDateLocale())
  }

  function describeEvent(event: RelayEvent | null): string {
    if (!event) return t('settings.sync.eventNone')
    switch (event.type) {
      case 'ready':
        return t('settings.sync.eventReady', { revision: event.groupRevision })
      case 'manifest_updated':
        return t('settings.sync.eventManifestUpdated', {
          deviceId: event.deviceId,
          version: event.version
        })
      case 'session_file_updated':
        return t('settings.sync.eventSessionUpdated', {
          sessionId: event.sessionId,
          version: event.version
        })
      case 'session_file_deleted':
        return t('settings.sync.eventSessionDeleted', { sessionId: event.sessionId })
      case 'sync_group_merged':
        return t('settings.sync.eventGroupMerged', { revision: event.groupRevision })
      case 'device_revoked':
        return t('settings.sync.eventDeviceRevoked', { deviceId: event.deviceId })
    }
  }

  /** 同步状态的最小展示接口（5 个模块的状态共享此形状） */
  type SyncStateView = {
    phase: 'idle' | 'running' | 'error'
    lastSyncAt: string | null
    lastResult: { errors: Array<{ message: string; sessionId?: string; key?: string }> } | null
    lastError: string | null
  }

  /** 五个同步模块的展示配置（驱动统一渲染，id 为稳定 React key，name 随语言变化） */
  const SYNC_MODULES: Array<{
    id: string
    name: string
    state: SyncStateView
    resultFormat: (r: unknown) => string
  }> = [
    {
      id: 'session',
      name: t('settings.sync.moduleSession'),
      state: sessionSync,
      resultFormat: (r) => {
        const d = r as Record<string, number>
        return t('settings.sync.resultSession', {
          uploaded: d.uploaded,
          downloaded: d.downloaded,
          merged: d.merged,
          deleted: d.deletedLocal + d.deletedRemote,
          skipped: d.skipped
        })
      }
    },
    {
      id: 'config',
      name: t('settings.sync.moduleConfig'),
      state: configSync,
      resultFormat: (r) => {
        const d = r as Record<string, number>
        return t('settings.sync.resultConfig', {
          uploaded: d.uploaded,
          downloaded: d.downloaded,
          merged: d.merged,
          skipped: d.skipped
        })
      }
    },
    {
      id: 'writer',
      name: t('settings.sync.moduleWriter'),
      state: writerSync,
      resultFormat: (r) => {
        const d = r as Record<string, number>
        return t('settings.sync.resultWriter', {
          uploaded: d.uploaded,
          downloaded: d.downloaded,
          deleted: d.deletedLocal + d.deletedRemote,
          skipped: d.skipped
        })
      }
    },
    {
      id: 'knowledge',
      name: t('settings.sync.moduleKnowledge'),
      state: knowledgeSync,
      resultFormat: (r) => {
        const d = r as Record<string, number>
        return t('settings.sync.resultKnowledge', {
          uploaded: d.uploaded,
          downloaded: d.downloaded,
          reindexed: d.reindexed,
          deleted: d.deletedLocal + d.deletedRemote,
          skipped: d.skipped
        })
      }
    },
    {
      id: 'paper',
      name: t('settings.sync.modulePaper'),
      state: paperSync,
      resultFormat: (r) => {
        const d = r as Record<string, number>
        return t('settings.sync.resultPaper', {
          uploaded: d.uploaded,
          downloaded: d.downloaded,
          blocksUploaded: d.blocksUploaded,
          blocksDownloaded: d.blocksDownloaded,
          deleted: d.deletedLocal + d.deletedRemote,
          skipped: d.skipped
        })
      }
    }
  ]

  const [relayUrl, setRelayUrl] = useState(storedRelayUrl)
  const [username, setUsername] = useState(storedUsername)
  const [password, setPassword] = useState('')
  const [redeemCode, setRedeemCode] = useState('')

  const connected = status === 'connected'
  const connecting = status === 'connecting'
  /** 统一同步按钮的忙态：全局动作进行中或任一模块引擎运行中 */
  const anyRunning =
    pendingAction === 'sync-all' ||
    sessionSync.phase === 'running' ||
    configSync.phase === 'running' ||
    writerSync.phase === 'running' ||
    knowledgeSync.phase === 'running' ||
    paperSync.phase === 'running'
  const connectionLabel = useMemo(() => {
    if (status === 'connecting') return t('settings.sync.connConnecting')
    if (status === 'connected')
      return eventConnected ? t('settings.sync.connOnline') : t('settings.sync.connReconnecting')
    if (status === 'error') return t('settings.sync.connError')
    return t('settings.sync.connDisconnected')
  }, [eventConnected, status, t])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    bindConfigSyncState()
  }, [bindConfigSyncState])

  useEffect(() => {
    bindWriterSyncState()
  }, [bindWriterSyncState])

  useEffect(() => {
    bindKnowledgeSyncState()
  }, [bindKnowledgeSyncState])

  useEffect(() => {
    bindPaperSyncState()
  }, [bindPaperSyncState])

  useEffect(() => {
    if (storedRelayUrl) setRelayUrl(storedRelayUrl)
    if (storedUsername) setUsername(storedUsername)
  }, [storedRelayUrl, storedUsername])

  useEffect(() => {
    if (connected) void listDevices()
  }, [connected, listDevices])

  async function handleConnect(): Promise<void> {
    const succeeded = await connect(relayUrl, username, password)
    if (succeeded) setPassword('')
  }

  async function handleDisconnect(): Promise<void> {
    const confirmed = await requestConfirm(
      t('settings.sync.confirmDisconnect'),
      t('settings.sync.confirmDisconnectTitle'),
      true
    )
    if (confirmed) await disconnect()
  }

  async function handleRedeem(): Promise<void> {
    const succeeded = await redeemSyncCode(redeemCode.trim())
    if (succeeded) setRedeemCode('')
  }

  async function handleRevoke(deviceId: string, deviceName: string): Promise<void> {
    const confirmed = await requestConfirm(
      t('settings.sync.confirmRevoke', { name: deviceName }),
      t('settings.sync.confirmRevokeTitle'),
      true
    )
    if (confirmed) await revokeDevice(deviceId)
  }

  async function handleDiscardGroups(): Promise<void> {
    const confirmed = await requestConfirm(
      t('settings.sync.confirmDiscard'),
      t('settings.sync.confirmDiscardTitle'),
      true
    )
    if (confirmed) await discardOtherGroups()
  }

  return (
    <div className={['sm-settings-page', styles['sync-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <div className="sm-settings-page__section-title-row">
          <h2 className="sm-settings-page__title">{t('settings.sync.title')}</h2>
          <span
            className={[
              'sm-settings-chip',
              connected && 'sm-settings-chip--accent',
              styles[`is-${status}`]
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {connectionLabel}
          </span>
        </div>
        <p className="sm-settings-page__description">{t('settings.sync.description')}</p>
      </header>

      <section
        className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
      >
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">{t('settings.sync.connSection')}</h3>
            <p className="sm-settings-page__section-description">
              {t('settings.sync.connSectionDesc')}
            </p>
          </div>
        </div>

        <div className={styles['sync-settings__form-grid']}>
          <label className={styles['sync-settings__field']}>
            <span>{t('settings.sync.relayUrl')}</span>
            <input
              className="sm-input"
              type="url"
              value={relayUrl}
              disabled={connected || connecting}
              placeholder="https://relay.example.com"
              onChange={(event) => setRelayUrl(event.target.value)}
            />
          </label>
          <label className={styles['sync-settings__field']}>
            <span>{t('settings.sync.username')}</span>
            <input
              className="sm-input"
              value={username}
              disabled={connected || connecting}
              autoComplete="username"
              placeholder="alice"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {!connected && (
            <label className={styles['sync-settings__field']}>
              <span>{t('settings.sync.password')}</span>
              <input
                className="sm-input"
                type="password"
                value={password}
                disabled={connecting}
                autoComplete="current-password"
                placeholder={t('settings.sync.passwordPlaceholder')}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleConnect()
                }}
              />
            </label>
          )}
        </div>

        <div className="sm-settings-actions">
          {!connected && (
            <button
              className="sm-button"
              disabled={!relayUrl.trim() || pendingAction === 'discover' || connecting}
              onClick={() => void discover(relayUrl)}
            >
              {pendingAction === 'discover'
                ? t('settings.sync.discovering')
                : t('settings.sync.discover')}
            </button>
          )}
          {!connected ? (
            <button
              className="sm-button sm-button--primary"
              disabled={!relayUrl.trim() || !username.trim() || !password || connecting}
              onClick={() => void handleConnect()}
            >
              {connecting ? t('settings.sync.connectLoading') : t('settings.sync.connectLogin')}
            </button>
          ) : (
            <>
              <button
                className="sm-button"
                disabled={pendingAction === 'renew'}
                onClick={() => void renewSession()}
              >
                {pendingAction === 'renew' ? t('settings.sync.renewing') : t('settings.sync.renew')}
              </button>
              <button
                className="sm-button sm-button--danger"
                onClick={() => void handleDisconnect()}
              >
                {t('common.disconnect')}
              </button>
            </>
          )}
        </div>
        {error && <p className={styles['sync-settings__error']}>{error}</p>}
      </section>

      {connected && deviceInfo && (
        <>
          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">
                  {t('settings.sync.deviceTitle')}
                </h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.deviceDesc')}
                </p>
              </div>
            </div>
            <dl className={styles['sync-settings__details']}>
              <div>
                <dt>{t('settings.sync.account')}</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>{t('settings.sync.device')}</dt>
                <dd>{deviceInfo.deviceName}</dd>
              </div>
              <div>
                <dt>{t('settings.sync.deviceId')}</dt>
                <dd>{deviceInfo.deviceId}</dd>
              </div>
              <div>
                <dt>{t('settings.sync.syncGroup')}</dt>
                <dd>{syncGroupId}</dd>
              </div>
              <div>
                <dt>{t('settings.sync.groupRevision')}</dt>
                <dd>{groupRevision ?? t('settings.sync.unknown')}</dd>
              </div>
              <div>
                <dt>{t('settings.sync.sessionExpiry')}</dt>
                <dd>{formatTimestamp(deviceInfo.sessionExpiresAt)}</dd>
              </div>
            </dl>
            <p className={styles['sync-settings__auto-renew-note']}>
              {t('settings.sync.autoRenewNote')}
            </p>
            {!deviceInfo.secureStorageAvailable && (
              <div className="sm-settings-banner sm-settings-banner--warning">
                {t('settings.sync.insecureStorageBanner')}
              </div>
            )}
            {hasOtherSyncData && (
              <div className="sm-settings-banner sm-settings-banner--warning">
                {t('settings.sync.otherGroupsBanner')}
              </div>
            )}
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">
                  {t('settings.sync.pairingTitle')}
                </h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.pairingDesc')}
                </p>
              </div>
            </div>
            <div className={styles['sync-settings__pairing']}>
              <div className="sm-settings-card">
                <strong>{t('settings.sync.inviteTitle')}</strong>
                {generatedCode && codeSecondsRemaining > 0 ? (
                  <div className={styles['sync-settings__code-row']}>
                    <code className={styles['sync-settings__code']}>{generatedCode.code}</code>
                    <span>{formatDuration(codeSecondsRemaining)}</span>
                  </div>
                ) : (
                  <p>{t('settings.sync.inviteHint')}</p>
                )}
                <button
                  className="sm-button"
                  disabled={pendingAction === 'generate-code'}
                  onClick={() => void generateSyncCode()}
                >
                  {pendingAction === 'generate-code'
                    ? t('settings.sync.generating')
                    : t('settings.sync.generateCode')}
                </button>
              </div>
              <div className="sm-settings-card">
                <strong>{t('settings.sync.joinTitle')}</strong>
                <input
                  className={['sm-input', styles['sync-settings__redeem-input']].join(' ')}
                  value={redeemCode}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('settings.sync.redeemPlaceholder')}
                  onChange={(event) => setRedeemCode(event.target.value.replace(/\D/g, ''))}
                />
                <button
                  className="sm-button sm-button--primary"
                  disabled={redeemCode.length !== 6 || pendingAction === 'redeem-code'}
                  onClick={() => void handleRedeem()}
                >
                  {pendingAction === 'redeem-code'
                    ? t('settings.sync.joining')
                    : t('settings.sync.join')}
                </button>
              </div>
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">
                  {t('settings.sync.devicesTitle')}
                </h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.devicesDesc')}
                </p>
              </div>
              <button
                className="sm-button"
                disabled={pendingAction === 'list-devices'}
                onClick={() => void listDevices()}
              >
                {pendingAction === 'list-devices' ? t('common.refreshing') : t('common.refresh')}
              </button>
            </div>
            {devices.length === 0 ? (
              <div className="sm-settings-empty">{t('settings.sync.devicesEmpty')}</div>
            ) : (
              <div className={styles['sync-settings__device-list']}>
                {devices.map((device) => {
                  const current = device.deviceId === deviceInfo.deviceId
                  return (
                    <div key={device.deviceId} className={styles['sync-settings__device']}>
                      <div>
                        <div className={styles['sync-settings__device-title']}>
                          <strong>{device.deviceName}</strong>
                          {current && (
                            <span className="sm-settings-chip sm-settings-chip--accent">
                              {t('settings.sync.thisDevice')}
                            </span>
                          )}
                          <span className="sm-settings-chip">{device.status}</span>
                        </div>
                        <p>
                          {t('settings.sync.lastSeen')}
                          {formatLastSeen(device.lastSeenAt)}
                        </p>
                      </div>
                      <button
                        className="sm-button sm-button--danger"
                        disabled={current || pendingAction === `revoke:${device.deviceId}`}
                        onClick={() => void handleRevoke(device.deviceId, device.deviceName)}
                      >
                        {t('settings.sync.revoke')}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">
                  {t('settings.sync.eventsTitle')}
                </h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.eventsDesc')}
                </p>
              </div>
              <button
                className="sm-button"
                disabled={pendingAction === 'reconcile'}
                onClick={() => void reconcile(true)}
              >
                {pendingAction === 'reconcile'
                  ? t('settings.sync.reconciling')
                  : t('settings.sync.reconcile')}
              </button>
            </div>
            <div className={styles['sync-settings__event-status']}>
              <span className={eventConnected ? styles['is-online'] : styles['is-offline']}>
                {eventConnected
                  ? t('settings.sync.eventOnline')
                  : t('settings.sync.eventReconnecting')}
              </span>
              <span>{describeEvent(lastEvent)}</span>
              {lastReconcile && (
                <span>
                  {t('settings.sync.lastReconcile', {
                    manifests: lastReconcile.manifestHeads.length,
                    snapshots: lastReconcile.sessionFiles.length
                  })}
                </span>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">{t('settings.sync.dataTitle')}</h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.dataDesc')}
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={anyRunning}
                onClick={() => void syncAllNow()}
              >
                {anyRunning ? t('settings.sync.syncing') : t('settings.sync.syncNow')}
              </button>
            </div>
            <div className={styles['sync-settings__modules']}>
              {SYNC_MODULES.map((mod) => {
                const state = mod.state
                const isError = state.phase === 'error'
                const isRunning = state.phase === 'running'
                return (
                  <div key={mod.id} className={styles['sync-settings__module-row']}>
                    <div className={styles['sync-settings__module-info']}>
                      <span className={styles['sync-settings__module-name']}>
                        <span
                          className={[
                            styles['sync-settings__module-dot'],
                            isRunning
                              ? styles['is-running']
                              : isError
                                ? styles['is-error']
                                : styles['is-idle']
                          ].join(' ')}
                        />
                        {mod.name}
                      </span>
                      <span className={styles['sync-settings__module-meta']}>
                        {isRunning
                          ? t('settings.sync.phaseRunning')
                          : isError
                            ? t('settings.sync.phaseError')
                            : t('settings.sync.phaseIdle')}
                        {' · '}
                        {formatIsoDateTime(state.lastSyncAt)}
                      </span>
                    </div>
                    {state.lastResult && (
                      <span className={styles['sync-settings__module-result']}>
                        {mod.resultFormat(state.lastResult)}
                      </span>
                    )}
                    {state.lastError && (
                      <span className={styles['sync-settings__error']}>{state.lastError}</span>
                    )}
                    {state.lastResult && state.lastResult.errors.length > 0 && (
                      <ul className={styles['sync-settings__session-errors']}>
                        {state.lastResult.errors.slice(0, 5).map((item, index) => (
                          <li key={index}>
                            {item.sessionId ?? item.key ?? ''}
                            {item.sessionId || item.key ? '：' : ''}
                            {item.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section
            className={[
              'sm-settings-page__section',
              styles['sync-settings__section'],
              styles['sync-settings__danger-zone']
            ].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">
                  {t('settings.sync.dangerTitle')}
                </h3>
                <p className="sm-settings-page__section-description">
                  {t('settings.sync.dangerDesc')}
                </p>
              </div>
              <button
                className="sm-button sm-button--danger"
                disabled={pendingAction === 'discard-groups'}
                onClick={() => void handleDiscardGroups()}
              >
                {pendingAction === 'discard-groups'
                  ? t('settings.sync.discarding')
                  : t('settings.sync.discard')}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
