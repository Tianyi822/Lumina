import assert from 'node:assert/strict'
import test from 'node:test'

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

  class FakeWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 3
    static latest: FakeWebSocket | null = null

    readonly url: string
    readonly protocols: string[]
    readyState = FakeWebSocket.CONNECTING
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null

    constructor(url: string, protocols: string[]) {
      this.url = url
      this.protocols = protocols
      FakeWebSocket.latest = this
    }

    close(): void {
      this.readyState = FakeWebSocket.CLOSED
    }

    open(): void {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.()
    }
  }

  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: FakeWebSocket
  })
  setConnectedState()

  useSyncStore.getState().setupEventStream()
  await Promise.resolve()
  await Promise.resolve()
  const socket = FakeWebSocket.latest
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

test('session_file_updated 事件转发给主进程并触发对账', async () => {
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
  assert.equal(reconciled, 1)
})
