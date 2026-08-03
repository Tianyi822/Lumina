import { create } from 'zustand'

import { notifyError, notifySuccess, notifyWarning } from '@renderer/composables/notificationCore'
import type {
  DiscoveryInfo,
  ReconcileSummary,
  RelayDevice,
  RelayEvent,
  SyncCodeResult,
  SyncResult,
  SyncStatus
} from '@shared/types/sync'

type SyncConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

interface SyncDeviceInfo {
  accountId: string | null
  deviceId: string | null
  deviceName: string | null
  sessionExpiresAt: number | null
  secureStorageAvailable: boolean
}

interface SyncStoreState {
  status: SyncConnectionState
  relayUrl: string
  username: string
  deviceInfo: SyncDeviceInfo | null
  syncGroupId: string | null
  groupRevision: number | null
  hasOtherSyncData: boolean
  devices: RelayDevice[]
  generatedCode: SyncCodeResult | null
  codeSecondsRemaining: number
  lastEvent: RelayEvent | null
  lastReconcile: ReconcileSummary | null
  eventConnected: boolean
  pendingAction: string | null
  error: string | null

  discover: (relayUrl: string) => Promise<SyncResult<DiscoveryInfo>>
  connect: (relayUrl: string, username: string, password: string) => Promise<boolean>
  disconnect: () => Promise<void>
  renewSession: () => Promise<boolean>
  refreshStatus: () => Promise<void>
  generateSyncCode: () => Promise<void>
  redeemSyncCode: (code: string) => Promise<boolean>
  listDevices: () => Promise<void>
  revokeDevice: (deviceId: string) => Promise<boolean>
  discardOtherGroups: () => Promise<boolean>
  reconcile: () => Promise<void>
  setupEventStream: () => void
  cleanupEventStream: () => void
  handleRelayEvent: (event: RelayEvent) => Promise<void>
}

const initialData = {
  status: 'disconnected' as SyncConnectionState,
  relayUrl: '',
  username: '',
  deviceInfo: null,
  syncGroupId: null,
  groupRevision: null,
  hasOtherSyncData: false,
  devices: [] as RelayDevice[],
  generatedCode: null,
  codeSecondsRemaining: 0,
  lastEvent: null,
  lastReconcile: null,
  eventConnected: false,
  pendingAction: null,
  error: null
}

let eventSocket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let codeTimer: ReturnType<typeof setInterval> | null = null
let reconnectAttempt = 0
let shouldReconnect = false
let eventTicketPending = false

function patchFromStatus(status: SyncStatus): Partial<SyncStoreState> {
  return {
    status: status.connected ? 'connected' : 'disconnected',
    relayUrl: status.relayUrl ?? '',
    username: status.username ?? '',
    deviceInfo: status.connected
      ? {
          accountId: status.accountId,
          deviceId: status.deviceId,
          deviceName: status.deviceName,
          sessionExpiresAt: status.sessionExpiresAt,
          secureStorageAvailable: status.secureStorageAvailable
        }
      : null,
    syncGroupId: status.syncGroupId,
    groupRevision: status.groupRevision,
    hasOtherSyncData: status.hasOtherSyncData,
    error: null
  }
}

function formatFailure(result: SyncResult<unknown>, fallback: string): string {
  switch (result.code) {
    case 'invalid_credentials':
    case 'password_incorrect':
      return '用户名或密码不正确'
    case 'invalid_sync_code':
      return '同步码无效、已过期或不属于当前账号'
    case 'rate_limited':
      return '操作过于频繁，请稍后再试'
    case 'device_revoked':
      return '当前设备已被吊销，请重新登录'
    case 'relay_not_initialized':
      return 'Relay 服务尚未初始化'
    default:
      return result.error || fallback
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function clearCodeTimer(): void {
  if (codeTimer) {
    clearInterval(codeTimer)
    codeTimer = null
  }
}

function closeSocket(): void {
  const socket = eventSocket
  eventSocket = null
  if (!socket) return
  socket.onopen = null
  socket.onmessage = null
  socket.onerror = null
  socket.onclose = null
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close()
  }
}

function scheduleReconnect(get: () => SyncStoreState): void {
  if (!shouldReconnect || get().status !== 'connected' || reconnectTimer) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30_000)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    get().setupEventStream()
  }, delay)
}

function parseRelayEvent(data: unknown): RelayEvent | null {
  if (typeof data !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null) return null
    const type = (parsed as { type?: unknown }).type
    if (
      type !== 'ready' &&
      type !== 'manifest_updated' &&
      type !== 'session_file_updated' &&
      type !== 'session_file_deleted' &&
      type !== 'sync_group_merged' &&
      type !== 'device_revoked'
    ) {
      return null
    }
    return parsed as RelayEvent
  } catch {
    return null
  }
}

export const useSyncStore = create<SyncStoreState>()((set, get) => ({
  ...initialData,

  discover: async (relayUrl) => {
    set({ pendingAction: 'discover', error: null })
    const result = await window.api.sync.discover(relayUrl)
    set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '无法连接 Relay 服务')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
    } else {
      notifySuccess('数据同步', 'Relay 服务连接正常', { source: 'settings' })
    }
    return result
  },

  connect: async (relayUrl, username, password) => {
    set({ status: 'connecting', pendingAction: 'connect', error: null })
    const result = await window.api.sync.connect(relayUrl, username, password)
    if (!result.success || !result.data) {
      const message = formatFailure(result, '连接同步服务失败')
      set({ status: 'error', pendingAction: null, error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }

    set({
      ...patchFromStatus(result.data.status),
      pendingAction: null,
      generatedCode: null,
      codeSecondsRemaining: 0
    })
    notifySuccess('数据同步', result.data.accountExists ? '设备登录成功' : '账号注册并连接成功', {
      source: 'settings'
    })
    if (!result.data.status.secureStorageAvailable) {
      notifyWarning('数据同步', '系统安全存储不可用，本次身份将在应用退出后失效', {
        source: 'settings'
      })
    }
    void get().listDevices()
    get().setupEventStream()
    return true
  },

  disconnect: async () => {
    get().cleanupEventStream()
    clearCodeTimer()
    const result = await window.api.sync.disconnect()
    const relayUrl = get().relayUrl
    const username = get().username
    set({ ...initialData, relayUrl, username })
    if (result.success) {
      notifySuccess('数据同步', '已断开并清除本地同步身份', { source: 'settings' })
    } else {
      notifyError('数据同步', formatFailure(result, '断开同步失败'), { source: 'settings' })
    }
  },

  renewSession: async () => {
    set({ pendingAction: 'renew', error: null })
    const result = await window.api.sync.renewSession()
    set({ pendingAction: null })
    if (!result.success || !result.data) {
      const message = formatFailure(result, '会话续期失败')
      set({ error: message, status: result.code === 'device_revoked' ? 'disconnected' : 'error' })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    set(patchFromStatus(result.data))
    get().setupEventStream()
    return true
  },

  refreshStatus: async () => {
    const result = await window.api.sync.getStatus()
    if (!result.success || !result.data) {
      set({ status: 'error', error: formatFailure(result, '读取同步状态失败') })
      return
    }
    set(patchFromStatus(result.data))
    if (result.data.connected) {
      get().setupEventStream()
    } else {
      get().cleanupEventStream()
    }
  },

  generateSyncCode: async () => {
    set({ pendingAction: 'generate-code', error: null })
    const result = await window.api.sync.generateSyncCode()
    set({ pendingAction: null })
    if (!result.success || !result.data) {
      const message = formatFailure(result, '生成同步码失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return
    }
    clearCodeTimer()
    const updateRemaining = (): void => {
      const remaining = Math.max(0, result.data!.expiresAt - Math.floor(Date.now() / 1000))
      set({ codeSecondsRemaining: remaining })
      if (remaining === 0) clearCodeTimer()
    }
    set({ generatedCode: result.data })
    updateRemaining()
    codeTimer = setInterval(updateRemaining, 1000)
  },

  redeemSyncCode: async (code) => {
    set({ pendingAction: 'redeem-code', error: null })
    const result = await window.api.sync.redeemSyncCode(code)
    set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '兑换同步码失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    await get().refreshStatus()
    await get().listDevices()
    await get().reconcile()
    notifySuccess(
      '数据同步',
      result.data?.joined === false ? '设备已在同一同步组' : '同步组合并成功',
      {
        source: 'settings'
      }
    )
    return true
  },

  listDevices: async () => {
    const result = await window.api.sync.listDevices()
    if (result.success && result.data) {
      set({ devices: result.data })
      return
    }
    set({ error: formatFailure(result, '读取设备列表失败') })
  },

  revokeDevice: async (deviceId) => {
    set({ pendingAction: `revoke:${deviceId}`, error: null })
    const result = await window.api.sync.revokeDevice(deviceId)
    set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '吊销设备失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    await get().listDevices()
    notifySuccess('数据同步', result.data?.revoked ? '设备已吊销' : '设备已处于吊销状态', {
      source: 'settings'
    })
    return true
  },

  discardOtherGroups: async () => {
    set({ pendingAction: 'discard-groups', error: null })
    const result = await window.api.sync.discardOtherGroups()
    set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '放弃其他同步组失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    await get().refreshStatus()
    notifySuccess(
      '数据同步',
      `已放弃其他同步组，吊销 ${result.data?.discardedDevices ?? 0} 台设备`,
      { source: 'settings' }
    )
    return true
  },

  reconcile: async () => {
    const result = await window.api.sync.reconcile()
    if (result.success && result.data) {
      set({ lastReconcile: result.data, groupRevision: result.data.groupRevision })
      return
    }
    if (result.code === 'device_revoked') {
      await get().disconnect()
    }
  },

  setupEventStream: () => {
    if (get().status !== 'connected') return
    shouldReconnect = true
    clearReconnectTimer()
    if (
      eventTicketPending ||
      (eventSocket &&
        (eventSocket.readyState === WebSocket.OPEN ||
          eventSocket.readyState === WebSocket.CONNECTING))
    ) {
      return
    }

    eventTicketPending = true
    void (async () => {
      const ticketResult = await window.api.sync.createEventTicket()
      eventTicketPending = false
      if (!ticketResult.success || !ticketResult.data || !shouldReconnect) {
        set({ eventConnected: false, error: formatFailure(ticketResult, '事件连接票据获取失败') })
        scheduleReconnect(get)
        return
      }

      const { wsUrl, ticket, subprotocol } = ticketResult.data
      let socket: WebSocket
      try {
        socket = new WebSocket(wsUrl, [subprotocol, `ticket.${ticket}`])
      } catch (error) {
        set({
          eventConnected: false,
          error: error instanceof Error ? error.message : '事件连接创建失败'
        })
        scheduleReconnect(get)
        return
      }
      eventSocket = socket

      socket.onopen = () => {
        if (eventSocket !== socket) return
        reconnectAttempt = 0
        set({ eventConnected: true, error: null })
        void get().reconcile()
      }
      socket.onmessage = (event) => {
        const relayEvent = parseRelayEvent(event.data)
        if (relayEvent) void get().handleRelayEvent(relayEvent)
      }
      socket.onerror = () => {
        if (eventSocket !== socket) return
        set({ eventConnected: false })
        socket.close()
      }
      socket.onclose = () => {
        if (eventSocket !== socket) return
        eventSocket = null
        set({ eventConnected: false })
        void get().reconcile()
        scheduleReconnect(get)
      }
    })()
  },

  cleanupEventStream: () => {
    shouldReconnect = false
    eventTicketPending = false
    reconnectAttempt = 0
    clearReconnectTimer()
    closeSocket()
    set({ eventConnected: false })
  },

  handleRelayEvent: async (event) => {
    set({ lastEvent: event })
    switch (event.type) {
      case 'ready':
        set({ eventConnected: true, groupRevision: event.groupRevision })
        return
      case 'sync_group_merged':
        await get().refreshStatus()
        await get().listDevices()
        await get().reconcile()
        return
      case 'device_revoked':
        if (event.deviceId === get().deviceInfo?.deviceId) {
          notifyWarning('数据同步', '当前设备已被吊销，需要重新登录', { source: 'settings' })
          await get().disconnect()
        } else {
          await get().listDevices()
        }
        return
      case 'manifest_updated':
      case 'session_file_updated':
      case 'session_file_deleted':
        await get().reconcile()
    }
  }
}))
