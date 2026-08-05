import { useEffect, useMemo, useState } from 'react'

import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { useSyncStore } from '@renderer/stores/syncStore'
import type { RelayEvent } from '@shared/types/sync'
import styles from './SyncSettings.module.css'

function formatTimestamp(unixSeconds: number | null): string {
  if (!unixSeconds) return '未知'
  return new Date(unixSeconds * 1000).toLocaleString('zh-CN')
}

function formatIsoDateTime(iso: string | null): string {
  if (!iso) return '从未'
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '从未'
  return new Date(time).toLocaleString('zh-CN')
}

function formatLastSeen(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('zh-CN')
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function describeEvent(event: RelayEvent | null): string {
  if (!event) return '尚未收到事件'
  switch (event.type) {
    case 'ready':
      return `事件通道已就绪 · 组版本 ${event.groupRevision}`
    case 'manifest_updated':
      return `设备 ${event.deviceId} 更新了 Manifest v${event.version}`
    case 'session_file_updated':
      return `会话 ${event.sessionId} 已更新至 v${event.version}`
    case 'session_file_deleted':
      return `会话 ${event.sessionId} 已删除`
    case 'sync_group_merged':
      return `同步组已合并 · 组版本 ${event.groupRevision}`
    case 'device_revoked':
      return `设备 ${event.deviceId} 已吊销`
  }
}

/** Lumina Relay 数据同步设置页（Scope A：连接、设备、同步组与事件状态）。 */
export default function SyncSettings() {
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
  const syncSessionsNow = useSyncStore((state) => state.syncSessionsNow)
  const syncConfigNow = useSyncStore((state) => state.syncConfigNow)
  const bindConfigSyncState = useSyncStore((state) => state.bindConfigSyncState)
  const syncWriterNow = useSyncStore((state) => state.syncWriterNow)
  const bindWriterSyncState = useSyncStore((state) => state.bindWriterSyncState)
  const syncKnowledgeNow = useSyncStore((state) => state.syncKnowledgeNow)
  const bindKnowledgeSyncState = useSyncStore((state) => state.bindKnowledgeSyncState)
  const syncPaperNow = useSyncStore((state) => state.syncPaperNow)
  const bindPaperSyncState = useSyncStore((state) => state.bindPaperSyncState)
  const requestConfirm = useNotificationCenterStore((state) => state.requestConfirm)

  const [relayUrl, setRelayUrl] = useState(storedRelayUrl)
  const [username, setUsername] = useState(storedUsername)
  const [password, setPassword] = useState('')
  const [redeemCode, setRedeemCode] = useState('')

  const connected = status === 'connected'
  const connecting = status === 'connecting'
  const connectionLabel = useMemo(() => {
    if (status === 'connecting') return '连接中'
    if (status === 'connected') return eventConnected ? '已连接 · 事件在线' : '已连接 · 事件重连中'
    if (status === 'error') return '连接异常'
    return '未连接'
  }, [eventConnected, status])

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
      '这会清除本机保存的设备身份和会话 Token。远端设备记录不会自动吊销。',
      '断开数据同步',
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
      `吊销“${deviceName}”后，该设备会立即失去当前同步组访问权限。`,
      '吊销设备',
      true
    )
    if (confirmed) await revokeDevice(deviceId)
  }

  async function handleDiscardGroups(): Promise<void> {
    const confirmed = await requestConfirm(
      '其他同步组中的设备、Manifest、block 引用和会话快照将被永久删除，无法恢复。',
      '永久放弃其他同步组',
      true
    )
    if (confirmed) await discardOtherGroups()
  }

  return (
    <div className={['sm-settings-page', styles['sync-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <div className="sm-settings-page__section-title-row">
          <h2 className="sm-settings-page__title">数据同步</h2>
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
        <p className="sm-settings-page__description">
          连接自建 Lumina Relay。密码学和密钥只在主进程处理，Relay 仅保存端到端加密数据。
        </p>
      </header>

      <section
        className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
      >
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">连接配置</h3>
            <p className="sm-settings-page__section-description">
              后端会根据账号是否存在自动选择注册或登录。
            </p>
          </div>
        </div>

        <div className={styles['sync-settings__form-grid']}>
          <label className={styles['sync-settings__field']}>
            <span>Relay 地址</span>
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
            <span>用户名</span>
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
              <span>密码</span>
              <input
                className="sm-input"
                type="password"
                value={password}
                disabled={connecting}
                autoComplete="current-password"
                placeholder="输入账号密码"
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
              {pendingAction === 'discover' ? '检测中...' : '检测 Relay'}
            </button>
          )}
          {!connected ? (
            <button
              className="sm-button sm-button--primary"
              disabled={!relayUrl.trim() || !username.trim() || !password || connecting}
              onClick={() => void handleConnect()}
            >
              {connecting ? '正在连接...' : '连接 / 登录'}
            </button>
          ) : (
            <>
              <button
                className="sm-button"
                disabled={pendingAction === 'renew'}
                onClick={() => void renewSession()}
              >
                续期会话
              </button>
              <button
                className="sm-button sm-button--danger"
                onClick={() => void handleDisconnect()}
              >
                断开
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
                <h3 className="sm-settings-page__section-title">当前设备</h3>
                <p className="sm-settings-page__section-description">
                  本机身份、同步组与会话有效期。
                </p>
              </div>
            </div>
            <dl className={styles['sync-settings__details']}>
              <div>
                <dt>账号</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>设备</dt>
                <dd>{deviceInfo.deviceName}</dd>
              </div>
              <div>
                <dt>设备 ID</dt>
                <dd>{deviceInfo.deviceId}</dd>
              </div>
              <div>
                <dt>同步组</dt>
                <dd>{syncGroupId}</dd>
              </div>
              <div>
                <dt>组版本</dt>
                <dd>{groupRevision ?? '未知'}</dd>
              </div>
              <div>
                <dt>会话到期</dt>
                <dd>{formatTimestamp(deviceInfo.sessionExpiresAt)}</dd>
              </div>
            </dl>
            {!deviceInfo.secureStorageAvailable && (
              <div className="sm-settings-banner sm-settings-banner--warning">
                系统安全存储不可用：身份仅在本次会话内存中保留，退出应用后需要重新登录。
              </div>
            )}
            {hasOtherSyncData && (
              <div className="sm-settings-banner sm-settings-banner--warning">
                账号的其他同步组中存在数据。请从旧设备生成六位同步码并在本机兑换，或确认放弃旧数据。
              </div>
            )}
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">同步组配对</h3>
                <p className="sm-settings-page__section-description">
                  六位码五分钟内有效且只能使用一次，用于永久合并同账号设备的同步组。
                </p>
              </div>
            </div>
            <div className={styles['sync-settings__pairing']}>
              <div className="sm-settings-card">
                <strong>邀请另一台设备</strong>
                {generatedCode && codeSecondsRemaining > 0 ? (
                  <div className={styles['sync-settings__code-row']}>
                    <code className={styles['sync-settings__code']}>{generatedCode.code}</code>
                    <span>{formatDuration(codeSecondsRemaining)}</span>
                  </div>
                ) : (
                  <p>生成一个新的六位同步码。</p>
                )}
                <button
                  className="sm-button"
                  disabled={pendingAction === 'generate-code'}
                  onClick={() => void generateSyncCode()}
                >
                  {pendingAction === 'generate-code' ? '生成中...' : '生成同步码'}
                </button>
              </div>
              <div className="sm-settings-card">
                <strong>加入已有同步组</strong>
                <input
                  className={['sm-input', styles['sync-settings__redeem-input']].join(' ')}
                  value={redeemCode}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="输入六位同步码"
                  onChange={(event) => setRedeemCode(event.target.value.replace(/\D/g, ''))}
                />
                <button
                  className="sm-button sm-button--primary"
                  disabled={redeemCode.length !== 6 || pendingAction === 'redeem-code'}
                  onClick={() => void handleRedeem()}
                >
                  {pendingAction === 'redeem-code' ? '正在加入...' : '加入同步组'}
                </button>
              </div>
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">设备管理</h3>
                <p className="sm-settings-page__section-description">管理当前同步组中的设备。</p>
              </div>
              <button className="sm-button" onClick={() => void listDevices()}>
                刷新
              </button>
            </div>
            {devices.length === 0 ? (
              <div className="sm-settings-empty">当前同步组暂无设备信息。</div>
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
                            <span className="sm-settings-chip sm-settings-chip--accent">本机</span>
                          )}
                          <span className="sm-settings-chip">{device.status}</span>
                        </div>
                        <p>最近在线：{formatLastSeen(device.lastSeenAt)}</p>
                      </div>
                      <button
                        className="sm-button sm-button--danger"
                        disabled={current || pendingAction === `revoke:${device.deviceId}`}
                        onClick={() => void handleRevoke(device.deviceId, device.deviceName)}
                      >
                        吊销
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
                <h3 className="sm-settings-page__section-title">事件与对账</h3>
                <p className="sm-settings-page__section-description">
                  WebSocket 事件仅作通知；断线后以 HTTP 全量对账结果为准。
                </p>
              </div>
              <button className="sm-button" onClick={() => void reconcile()}>
                立即对账
              </button>
            </div>
            <div className={styles['sync-settings__event-status']}>
              <span className={eventConnected ? styles['is-online'] : styles['is-offline']}>
                {eventConnected ? '事件通道在线' : '事件通道重连中'}
              </span>
              <span>{describeEvent(lastEvent)}</span>
              {lastReconcile && (
                <span>
                  最近对账：{lastReconcile.manifestHeads.length} 个 Manifest head，
                  {lastReconcile.sessionFiles.length} 个会话快照
                </span>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">会话同步</h3>
                <p className="sm-settings-page__section-description">
                  会话以整文件密文快照同步，冲突按消息合并；每 60 秒自动一轮。
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={pendingAction === 'session-sync' || sessionSync.phase === 'running'}
                onClick={() => void syncSessionsNow()}
              >
                {sessionSync.phase === 'running' || pendingAction === 'session-sync'
                  ? '同步中...'
                  : '立即同步'}
              </button>
            </div>
            <div className={styles['sync-settings__session-sync']}>
              <span>
                状态：
                {sessionSync.phase === 'running'
                  ? '同步中'
                  : sessionSync.phase === 'error'
                    ? '失败'
                    : '空闲'}
                {' · '}最近同步：{formatIsoDateTime(sessionSync.lastSyncAt)}
              </span>
              {sessionSync.lastResult && (
                <span>
                  上次结果：↑{sessionSync.lastResult.uploaded} 上行 · ↓
                  {sessionSync.lastResult.downloaded} 下行 · ⇄{sessionSync.lastResult.merged} 合并 ·
                  ✕{sessionSync.lastResult.deletedLocal + sessionSync.lastResult.deletedRemote} 删除
                  · 跳过 {sessionSync.lastResult.skipped}
                </span>
              )}
              {sessionSync.lastError && (
                <span className={styles['sync-settings__error']}>{sessionSync.lastError}</span>
              )}
              {sessionSync.lastResult && sessionSync.lastResult.errors.length > 0 && (
                <ul className={styles['sync-settings__session-errors']}>
                  {sessionSync.lastResult.errors.slice(0, 5).map((item) => (
                    <li key={item.sessionId}>
                      {item.sessionId}：{item.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">配置同步</h3>
                <p className="sm-settings-page__section-description">
                  应用配置以端到端加密同步，机器相关条目（本地 MCP/嵌入模型）本机优先保留；每 60
                  秒自动一轮。
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={pendingAction === 'config-sync' || configSync.phase === 'running'}
                onClick={() => void syncConfigNow()}
              >
                {configSync.phase === 'running' || pendingAction === 'config-sync'
                  ? '同步中...'
                  : '立即同步'}
              </button>
            </div>
            <div className={styles['sync-settings__session-sync']}>
              <span>
                状态：
                {configSync.phase === 'running'
                  ? '同步中'
                  : configSync.phase === 'error'
                    ? '失败'
                    : '空闲'}
                {' · '}最近同步：{formatIsoDateTime(configSync.lastSyncAt)}
              </span>
              {configSync.lastResult && (
                <span>
                  上次结果：↑{configSync.lastResult.uploaded} 上行 · ↓
                  {configSync.lastResult.downloaded} 下行 · ⇄{configSync.lastResult.merged} 合并 ·
                  跳过 {configSync.lastResult.skipped}
                </span>
              )}
              {configSync.lastError && (
                <span className={styles['sync-settings__error']}>{configSync.lastError}</span>
              )}
              {configSync.lastResult && configSync.lastResult.errors.length > 0 && (
                <ul className={styles['sync-settings__session-errors']}>
                  {configSync.lastResult.errors.slice(0, 5).map((item, index) => (
                    <li key={index}>{item.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">写作同步</h3>
                <p className="sm-settings-page__section-description">
                  写作文档以端到端加密同步，冲突按 revision 判定；每 60 秒自动一轮。
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={pendingAction === 'writer-sync' || writerSync.phase === 'running'}
                onClick={() => void syncWriterNow()}
              >
                {writerSync.phase === 'running' || pendingAction === 'writer-sync'
                  ? '同步中...'
                  : '立即同步'}
              </button>
            </div>
            <div className={styles['sync-settings__session-sync']}>
              <span>
                状态：
                {writerSync.phase === 'running'
                  ? '同步中'
                  : writerSync.phase === 'error'
                    ? '失败'
                    : '空闲'}
                {' · '}最近同步：{formatIsoDateTime(writerSync.lastSyncAt)}
              </span>
              {writerSync.lastResult && (
                <span>
                  上次结果：↑{writerSync.lastResult.uploaded} 上行 · ↓
                  {writerSync.lastResult.downloaded} 下行 · ✕
                  {writerSync.lastResult.deletedLocal + writerSync.lastResult.deletedRemote} 删除 ·
                  跳过 {writerSync.lastResult.skipped}
                </span>
              )}
              {writerSync.lastError && (
                <span className={styles['sync-settings__error']}>{writerSync.lastError}</span>
              )}
              {writerSync.lastResult && writerSync.lastResult.errors.length > 0 && (
                <ul className={styles['sync-settings__session-errors']}>
                  {writerSync.lastResult.errors.slice(0, 5).map((item, index) => (
                    <li key={index}>
                      {item.key}：{item.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">知识库同步</h3>
                <p className="sm-settings-page__section-description">
                  知识库元数据与上传文件以端到端加密同步；向量索引在目标设备自动重建。每 60 秒一轮。
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={pendingAction === 'knowledge-sync' || knowledgeSync.phase === 'running'}
                onClick={() => void syncKnowledgeNow()}
              >
                {knowledgeSync.phase === 'running' || pendingAction === 'knowledge-sync'
                  ? '同步中...'
                  : '立即同步'}
              </button>
            </div>
            <div className={styles['sync-settings__session-sync']}>
              <span>
                状态：
                {knowledgeSync.phase === 'running'
                  ? '同步中'
                  : knowledgeSync.phase === 'error'
                    ? '失败'
                    : '空闲'}
                {' · '}最近同步：{formatIsoDateTime(knowledgeSync.lastSyncAt)}
              </span>
              {knowledgeSync.lastResult && (
                <span>
                  上次结果：↑{knowledgeSync.lastResult.uploaded} 上行 · ↓
                  {knowledgeSync.lastResult.downloaded} 下行 · ⟳{knowledgeSync.lastResult.reindexed}{' '}
                  重建索引 · ✕
                  {knowledgeSync.lastResult.deletedLocal + knowledgeSync.lastResult.deletedRemote}{' '}
                  删除 · 跳过 {knowledgeSync.lastResult.skipped}
                </span>
              )}
              {knowledgeSync.lastError && (
                <span className={styles['sync-settings__error']}>{knowledgeSync.lastError}</span>
              )}
              {knowledgeSync.lastResult && knowledgeSync.lastResult.errors.length > 0 && (
                <ul className={styles['sync-settings__session-errors']}>
                  {knowledgeSync.lastResult.errors.slice(0, 5).map((item, index) => (
                    <li key={index}>
                      {item.key}：{item.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className={['sm-settings-page__section', styles['sync-settings__section']].join(' ')}
          >
            <div className="sm-settings-page__section-header">
              <div>
                <h3 className="sm-settings-page__section-title">论文同步</h3>
                <p className="sm-settings-page__section-description">
                  论文元数据与批注实时同步；PDF、页图等大文件在打开论文时按需下载。每 60 秒一轮。
                </p>
              </div>
              <button
                className="sm-button sm-button--primary"
                disabled={pendingAction === 'paper-sync' || paperSync.phase === 'running'}
                onClick={() => void syncPaperNow()}
              >
                {paperSync.phase === 'running' || pendingAction === 'paper-sync'
                  ? '同步中...'
                  : '立即同步'}
              </button>
            </div>
            <div className={styles['sync-settings__session-sync']}>
              <span>
                状态：
                {paperSync.phase === 'running'
                  ? '同步中'
                  : paperSync.phase === 'error'
                    ? '失败'
                    : '空闲'}
                {' · '}最近同步：{formatIsoDateTime(paperSync.lastSyncAt)}
              </span>
              {paperSync.lastResult && (
                <span>
                  上次结果：↑{paperSync.lastResult.uploaded} 文件上行 · ↓
                  {paperSync.lastResult.downloaded} 下行 · ⟁{paperSync.lastResult.blocksUploaded}{' '}
                  块上行 · ⇊{paperSync.lastResult.blocksDownloaded} 块下行 · ✕
                  {paperSync.lastResult.deletedLocal + paperSync.lastResult.deletedRemote} 删除 ·
                  跳过 {paperSync.lastResult.skipped}
                </span>
              )}
              {paperSync.lastError && (
                <span className={styles['sync-settings__error']}>{paperSync.lastError}</span>
              )}
              {paperSync.lastResult && paperSync.lastResult.errors.length > 0 && (
                <ul className={styles['sync-settings__session-errors']}>
                  {paperSync.lastResult.errors.slice(0, 5).map((item, index) => (
                    <li key={index}>
                      {item.key}：{item.message}
                    </li>
                  ))}
                </ul>
              )}
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
                <h3 className="sm-settings-page__section-title">危险操作</h3>
                <p className="sm-settings-page__section-description">
                  永久删除当前组以外的同步组数据，并吊销其中全部设备。
                </p>
              </div>
              <button
                className="sm-button sm-button--danger"
                disabled={pendingAction === 'discard-groups'}
                onClick={() => void handleDiscardGroups()}
              >
                {pendingAction === 'discard-groups' ? '正在处理...' : '放弃其他同步组'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
