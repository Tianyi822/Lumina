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
