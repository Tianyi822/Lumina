import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import type { SyncApi } from '../../../preload/types/sync'
import type { SyncStatus } from '@shared/types/sync'
import { useNotificationCenterStore } from './notificationCenterStore'
import { useSyncStore } from './syncStore'

const DEVICE_ID = '22222222-2222-4222-8222-222222222222'
const GROUP_ID = '33333333-3333-4333-8333-333333333333'

const connectedStatus: SyncStatus = {
  connected: true,
  relayUrl: 'https://relay.example',
  instanceId: 'instance-1',
  accountId: '11111111-1111-4111-8111-111111111111',
  deviceId: DEVICE_ID,
  deviceName: 'Laptop',
  username: 'alice',
  syncGroupId: GROUP_ID,
  groupRevision: 2,
  hasOtherSyncData: false,
  sessionExpiresAt: 1_900_000_000,
  secureStorageAvailable: true
}

function createSyncApi(overrides: Partial<SyncApi> = {}): SyncApi {
  return {
    discover: async () => ({ success: true }),
    connect: async () => ({ success: false, code: 'unknown_error' }),
    renewSession: async () => ({ success: true, data: connectedStatus }),
    getStatus: async () => ({ success: true, data: connectedStatus }),
    disconnect: async () => ({ success: true }),
    refreshBootstrap: async () => ({ success: true, data: connectedStatus }),
    generateSyncCode: async () => ({ success: true, data: { code: '123456', expiresAt: 1 } }),
    redeemSyncCode: async () => ({
      success: true,
      data: { joined: true, syncGroupId: GROUP_ID, groupRevision: 2 }
    }),
    listDevices: async () => ({ success: true, data: [] }),
    revokeDevice: async () => ({ success: true, data: { revoked: true } }),
    discardOtherGroups: async () => ({
      success: true,
      data: { discardedDevices: 0, reclaimedBytes: 0 }
    }),
    createEventTicket: async () => ({
      success: true,
      data: {
        wsUrl: 'wss://relay.example/events',
        ticket: 'ticket-value',
        subprotocol: 'lumina-events',
        expiresAtMs: Date.now() + 30_000
      }
    }),
    reconcile: async () => ({
      success: true,
      data: { groupRevision: 2, manifestHeads: [], sessionFiles: [] }
    }),
    sessionSyncNow: async () => ({
      success: true,
      data: {
        uploaded: 1,
        downloaded: 0,
        merged: 0,
        deletedLocal: 0,
        deletedRemote: 0,
        skipped: 2,
        errors: []
      }
    }),
    getSessionSyncState: async () => ({
      success: true,
      data: { phase: 'idle', lastSyncAt: null, lastResult: null, lastError: null }
    }),
    onSessionSyncState: () => () => {},
    notifySessionFileEvent: () => {},
    configSyncNow: async () => ({
      success: true,
      data: { uploaded: 0, downloaded: 0, merged: 0, skipped: 1, errors: [] }
    }),
    getConfigSyncState: async () => ({
      success: true,
      data: { phase: 'idle', lastSyncAt: null, lastResult: null, lastError: null }
    }),
    onConfigSyncState: () => () => {},
    notifyConfigManifestEvent: () => {},
    writerSyncNow: async () => ({
      success: true,
      data: {
        uploaded: 0,
        downloaded: 0,
        deletedLocal: 0,
        deletedRemote: 0,
        skipped: 1,
        errors: []
      }
    }),
    getWriterSyncState: async () => ({
      success: true,
      data: { phase: 'idle', lastSyncAt: null, lastResult: null, lastError: null }
    }),
    onWriterSyncState: () => () => {},
    notifyWriterFileEvent: () => {},
    knowledgeSyncNow: async () => ({
      success: true,
      data: {
        uploaded: 0,
        downloaded: 0,
        deletedLocal: 0,
        deletedRemote: 0,
        reindexed: 0,
        skipped: 1,
        errors: []
      }
    }),
    getKnowledgeSyncState: async () => ({
      success: true,
      data: { phase: 'idle', lastSyncAt: null, lastResult: null, lastError: null }
    }),
    onKnowledgeSyncState: () => () => {},
    notifyKnowledgeFileEvent: () => {},
    paperSyncNow: async () => ({
      success: true,
      data: {
        uploaded: 0,
        downloaded: 0,
        deletedLocal: 0,
        deletedRemote: 0,
        blocksUploaded: 0,
        blocksDownloaded: 0,
        skipped: 1,
        errors: []
      }
    }),
    getPaperSyncState: async () => ({
      success: true,
      data: { phase: 'idle', lastSyncAt: null, lastResult: null, lastError: null, downloads: {} }
    }),
    onPaperSyncState: () => () => {},
    requestPaperPackDownload: async () => ({ success: true }),
    notifyPaperFileEvent: () => {},
    ...overrides
  }
}

function installWindow(sync: SyncApi): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        sync,
        logger: {
          info: async () => ({ success: true }),
          warn: async () => ({ success: true }),
          error: async () => ({ success: true })
        }
      }
    }
  })
}

/**
 * 全局 WebSocket 桩：防止测试经 setupEventStream 创建真实 WebSocket
 * 连接 mock 里的 wss://relay.example（真实外网连接会挂住事件循环约 30s）。
 * 需要模拟打开的测试用 StubWebSocket.latest + open()。
 */
class StubWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static latest: StubWebSocket | null = null

  readonly url: string
  readonly protocols: string[]
  readyState = StubWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string, protocols: string[]) {
    this.url = url
    this.protocols = protocols
    StubWebSocket.latest = this
  }

  close(): void {
    this.readyState = StubWebSocket.CLOSED
  }

  open(): void {
    this.readyState = StubWebSocket.OPEN
    this.onopen?.()
  }
}

test.beforeEach(() => {
  StubWebSocket.latest = null
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: StubWebSocket })
})

function setConnectedState(): void {
  useSyncStore.setState({
    status: 'connected',
    relayUrl: connectedStatus.relayUrl ?? '',
    username: connectedStatus.username ?? '',
    deviceInfo: {
      accountId: connectedStatus.accountId,
      deviceId: connectedStatus.deviceId,
      deviceName: connectedStatus.deviceName,
      sessionExpiresAt: connectedStatus.sessionExpiresAt,
      secureStorageAvailable: true
    },
    syncGroupId: GROUP_ID,
    groupRevision: 1,
    hasOtherSyncData: false,
    devices: [],
    lastEvent: null,
    lastReconcile: null,
    eventConnected: false,
    pendingAction: null,
    error: null
  })
}

test.afterEach(() => {
  useSyncStore.getState().cleanupEventStream()
  useNotificationCenterStore.getState().dismissAll()
})

test('sync_group_merged 事件刷新 bootstrap、设备和对账摘要', async () => {
  let statusCalls = 0
  let deviceCalls = 0
  let reconcileCalls = 0
  installWindow(
    createSyncApi({
      getStatus: async () => {
        statusCalls += 1
        return { success: true, data: connectedStatus }
      },
      listDevices: async () => {
        deviceCalls += 1
        return { success: true, data: [] }
      },
      reconcile: async () => {
        reconcileCalls += 1
        return {
          success: true,
          data: { groupRevision: 2, manifestHeads: [], sessionFiles: [] }
        }
      }
    })
  )
  setConnectedState()

  await useSyncStore.getState().handleRelayEvent({
    type: 'sync_group_merged',
    groupRevision: 2,
    serverTimeMs: Date.now()
  })

  assert.equal(statusCalls, 1)
  assert.equal(deviceCalls, 1)
  assert.equal(reconcileCalls, 1)
  assert.equal(useSyncStore.getState().groupRevision, 2)
  assert.equal(useSyncStore.getState().lastEvent?.type, 'sync_group_merged')
})

test('当前设备收到 device_revoked 后断开并清除连接态', async () => {
  let disconnectCalls = 0
  installWindow(
    createSyncApi({
      disconnect: async () => {
        disconnectCalls += 1
        return { success: true }
      }
    })
  )
  setConnectedState()

  await useSyncStore.getState().handleRelayEvent({
    type: 'device_revoked',
    deviceId: DEVICE_ID,
    serverTimeMs: Date.now()
  })

  assert.equal(disconnectCalls, 1)
  assert.equal(useSyncStore.getState().status, 'disconnected')
  assert.equal(useSyncStore.getState().deviceInfo, null)
})

test('事件流使用 ticket 子协议连接，open 后执行全量对账', async () => {
  let reconcileCalls = 0
  installWindow(
    createSyncApi({
      reconcile: async () => {
        reconcileCalls += 1
        return {
          success: true,
          data: { groupRevision: 2, manifestHeads: [], sessionFiles: [] }
        }
      }
    })
  )

  // WebSocket 由 beforeEach 全局桩接（StubWebSocket）
  setConnectedState()

  useSyncStore.getState().setupEventStream()
  await Promise.resolve()
  await Promise.resolve()
  const socket = StubWebSocket.latest
  assert.ok(socket)
  assert.equal(socket.url, 'wss://relay.example/events')
  assert.deepEqual(socket.protocols, ['lumina-events', 'ticket.ticket-value'])

  socket.open()
  await Promise.resolve()
  assert.equal(useSyncStore.getState().eventConnected, true)
  assert.equal(reconcileCalls, 1)
})

test('syncSessionsNow 成功后更新 sessionSync 状态', async () => {
  installWindow(createSyncApi())
  setConnectedState()
  const ok = await useSyncStore.getState().syncSessionsNow()
  assert.equal(ok, true)
  const state = useSyncStore.getState().sessionSync
  assert.equal(state.phase, 'idle')
  assert.equal(state.lastResult?.uploaded, 1)
})

test('syncSessionsNow 失败写 error 并返回 false', async () => {
  installWindow(
    createSyncApi({
      sessionSyncNow: async () => ({
        success: false,
        code: 'not_connected',
        error: '尚未连接同步服务'
      })
    })
  )
  setConnectedState()
  const ok = await useSyncStore.getState().syncSessionsNow()
  assert.equal(ok, false)
  assert.equal(useSyncStore.getState().error, '尚未连接同步服务')
})

test('bindSessionSyncState 订阅推送并应用状态', async () => {
  const listeners: ((state: import('@shared/types/sync').SessionSyncState) => void)[] = []
  installWindow(
    createSyncApi({
      onSessionSyncState: (callback) => {
        listeners.push(callback)
        return () => {}
      }
    })
  )
  setConnectedState()
  useSyncStore.getState().bindSessionSyncState()
  assert.equal(listeners.length, 1)
  const pushed = {
    phase: 'running' as const,
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  }
  listeners[0](pushed)
  assert.equal(useSyncStore.getState().sessionSync.phase, 'running')
})

test('session_file_updated 事件转发给主进程，对账经去抖窗口合并触发', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  let notified = 0
  let reconciled = 0
  installWindow(
    createSyncApi({
      notifySessionFileEvent: () => {
        notified += 1
      },
      reconcile: async () => {
        reconciled += 1
        return { success: true, data: { groupRevision: 2, manifestHeads: [], sessionFiles: [] } }
      }
    })
  )
  setConnectedState()
  await useSyncStore.getState().handleRelayEvent({
    type: 'session_file_updated',
    deviceId: 'other-device',
    sessionId: 'session-1-abc',
    version: 3,
    serverTimeMs: Date.now()
  })
  assert.equal(notified, 1)
  // 去抖窗口内不立即对账；窗口内的第二条事件被合并
  assert.equal(reconciled, 0)
  await useSyncStore.getState().handleRelayEvent({
    type: 'session_file_updated',
    deviceId: 'other-device',
    sessionId: 'session-2-def',
    version: 4,
    serverTimeMs: Date.now()
  })
  assert.equal(notified, 2)
  mock.timers.tick(2_000)
  assert.equal(reconciled, 1)
})

test('断开重连后五个模块的状态推送订阅恢复', async () => {
  const subscribeCounts = { session: 0, config: 0, writer: 0, knowledge: 0, paper: 0 }
  installWindow(
    createSyncApi({
      connect: async () => ({
        success: true,
        data: { accountExists: true, status: connectedStatus }
      }),
      onSessionSyncState: () => {
        subscribeCounts.session += 1
        return () => {}
      },
      onConfigSyncState: () => {
        subscribeCounts.config += 1
        return () => {}
      },
      onWriterSyncState: () => {
        subscribeCounts.writer += 1
        return () => {}
      },
      onKnowledgeSyncState: () => {
        subscribeCounts.knowledge += 1
        return () => {}
      },
      onPaperSyncState: () => {
        subscribeCounts.paper += 1
        return () => {}
      }
    })
  )
  // 桩掉 WebSocket：connect 会建立事件流，本测试只关心订阅计数
  // （WebSocket 由 beforeEach 全局桩接，无需真实网络）

  // fresh connect：五个模块的订阅全部建立
  assert.equal(await useSyncStore.getState().connect('https://relay.example', 'alice', 'pw'), true)
  assert.deepEqual(subscribeCounts, { session: 1, config: 1, writer: 1, knowledge: 1, paper: 1 })

  // 断开（退订并重置 bound 标记）后重连：订阅必须恢复而不是停留在失效状态
  await useSyncStore.getState().disconnect()
  assert.equal(await useSyncStore.getState().connect('https://relay.example', 'alice', 'pw'), true)
  assert.deepEqual(subscribeCounts, { session: 2, config: 2, writer: 2, knowledge: 2, paper: 2 })
})

test('畸形 session_file 事件（缺 sessionId）经 socket 消息解析时被丢弃', async () => {
  let notified = 0
  installWindow(
    createSyncApi({
      notifySessionFileEvent: () => {
        notified += 1
      },
      notifyPaperFileEvent: () => {
        notified += 1
      },
      notifyKnowledgeFileEvent: () => {
        notified += 1
      },
      notifyWriterFileEvent: () => {
        notified += 1
      }
    })
  )
  setConnectedState()
  useSyncStore.getState().setupEventStream()
  await Promise.resolve()
  await Promise.resolve()
  const socket = StubWebSocket.latest
  assert.ok(socket)
  // 不抛错、不转发、不对账
  socket.onmessage?.({ data: JSON.stringify({ type: 'session_file_updated', version: 1 }) })
  socket.onmessage?.({ data: JSON.stringify({ type: 'device_revoked' }) })
  await Promise.resolve()
  assert.equal(notified, 0)
})

test('syncAllNow 的 pendingAction 在全部模块完成前保持 sync-all', async () => {
  let releaseWriter: (() => void) | null = null
  installWindow(
    createSyncApi({
      writerSyncNow: async () => {
        await new Promise<void>((resolve) => {
          releaseWriter = resolve
        })
        return {
          success: true,
          data: {
            uploaded: 0,
            downloaded: 0,
            deletedLocal: 0,
            deletedRemote: 0,
            skipped: 0,
            errors: []
          }
        }
      }
    })
  )
  setConnectedState()
  const allDone = useSyncStore.getState().syncAllNow()
  // 让四个快速模块跑完（它们不再触碰全局 pendingAction）
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  assert.equal(useSyncStore.getState().pendingAction, 'sync-all')
  releaseWriter!()
  assert.equal(await allDone, true)
  assert.equal(useSyncStore.getState().pendingAction, null)
})
