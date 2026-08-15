import { create } from 'zustand'

import { notifyError, notifySuccess, notifyWarning } from '@renderer/composables/notificationCore'
import type {
  ConfigSyncResult,
  ConfigSyncState,
  DiscoveryInfo,
  KnowledgeSyncResult,
  KnowledgeSyncState,
  PaperSyncResult,
  PaperSyncState,
  ReconcileSummary,
  RelayDevice,
  RelayEvent,
  SessionSyncState,
  SyncCodeResult,
  SyncResult,
  SyncStatus,
  WriterSyncResult,
  WriterSyncState
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
  sessionSync: SessionSyncState
  configSync: ConfigSyncState
  writerSync: WriterSyncState
  knowledgeSync: KnowledgeSyncState
  paperSync: PaperSyncState
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
  reconcile: (manual?: boolean) => Promise<void>
  syncSessionsNow: (fromSyncAll?: boolean) => Promise<boolean>
  bindSessionSyncState: () => void
  syncConfigNow: (fromSyncAll?: boolean) => Promise<boolean>
  bindConfigSyncState: () => void
  syncWriterNow: (fromSyncAll?: boolean) => Promise<boolean>
  bindWriterSyncState: () => void
  syncKnowledgeNow: (fromSyncAll?: boolean) => Promise<boolean>
  bindKnowledgeSyncState: () => void
  syncPaperNow: (fromSyncAll?: boolean) => Promise<boolean>
  bindPaperSyncState: () => void
  /** 统一同步：并行触发全部 5 个模块 */
  syncAllNow: () => Promise<boolean>
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
  sessionSync: {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  } as SessionSyncState,
  configSync: {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  } as ConfigSyncState,
  writerSync: {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  } as WriterSyncState,
  knowledgeSync: {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  } as KnowledgeSyncState,
  paperSync: {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null,
    downloads: {}
  } as PaperSyncState,
  pendingAction: null,
  error: null
}

let eventSocket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let codeTimer: ReturnType<typeof setInterval> | null = null
let reconcileTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let shouldReconnect = false
let eventTicketPending = false
let sessionSyncBound = false
let sessionSyncUnsubscribe: (() => void) | null = null
let configSyncBound = false
let configSyncUnsubscribe: (() => void) | null = null
let writerSyncBound = false
let writerSyncUnsubscribe: (() => void) | null = null
let knowledgeSyncBound = false
let knowledgeSyncUnsubscribe: (() => void) | null = null
let paperSyncBound = false
let paperSyncUnsubscribe: (() => void) | null = null

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
    case 'quota_exceeded':
      return '账户存储配额不足，请清理远端数据或联系管理员扩容'
    case 'body_too_large':
      return '文件过大，超过同步单文件上限'
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

/** 事件驱动对账的合并窗口：事件密集时避免每条事件都触发一次全量 HTTP 对账 */
const RECONCILE_DEBOUNCE_MS = 1_500

function clearReconcileTimer(): void {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer)
    reconcileTimer = null
  }
}

function scheduleReconcile(get: () => SyncStoreState): void {
  if (reconcileTimer) return
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null
    void get().reconcile()
  }, RECONCILE_DEBOUNCE_MS)
}

/** 订阅全部五个同步模块的状态推送（各 bind 幂等，可随连接态重复调用） */
function bindAllSyncStates(get: () => SyncStoreState): void {
  get().bindSessionSyncState()
  get().bindConfigSyncState()
  get().bindWriterSyncState()
  get().bindKnowledgeSyncState()
  get().bindPaperSyncState()
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
    // 下游会直接读取的字段在此校验，畸形事件（如缺 sessionId）整体丢弃
    if (
      (type === 'session_file_updated' || type === 'session_file_deleted') &&
      typeof (parsed as { sessionId?: unknown }).sessionId !== 'string'
    ) {
      return null
    }
    if (
      type === 'device_revoked' &&
      typeof (parsed as { deviceId?: unknown }).deviceId !== 'string'
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
    bindAllSyncStates(get)
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
    bindAllSyncStates(get)
    get().setupEventStream()
    notifySuccess('数据同步', '会话已续期', { source: 'settings' })
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
      bindAllSyncStates(get)
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
    set({ pendingAction: 'list-devices' })
    const result = await window.api.sync.listDevices()
    set({ pendingAction: null })
    if (result.success && result.data) {
      set({ devices: result.data })
      return
    }
    const message = formatFailure(result, '读取设备列表失败')
    set({ error: message })
    notifyError('数据同步', message, { source: 'settings' })
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

  reconcile: async (manual) => {
    // 自动对账（事件流/兑换后）不置 pendingAction、不发通知，避免按钮频繁自转与提示噪音
    if (manual) set({ pendingAction: 'reconcile', error: null })
    const result = await window.api.sync.reconcile()
    if (manual) set({ pendingAction: null })
    if (result.success && result.data) {
      set({ lastReconcile: result.data, groupRevision: result.data.groupRevision })
      if (manual) notifySuccess('数据同步', '对账完成', { source: 'settings' })
      return
    }
    if (result.code === 'device_revoked') {
      await get().disconnect()
      return
    }
    if (manual) {
      const message = formatFailure(result, '对账失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
    }
  },

  syncSessionsNow: async (fromSyncAll) => {
    // 来自 syncAllNow 时全局 pending 由调用方统一管理，避免并行子任务互相覆盖
    if (!fromSyncAll) set({ pendingAction: 'session-sync', error: null })
    const result = await window.api.sync.sessionSyncNow()
    if (!fromSyncAll) set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '会话同步失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    if (result.data) {
      set({
        sessionSync: {
          phase: result.data.errors.length > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
          lastResult: result.data,
          lastError:
            result.data.errors.length > 0 ? `${result.data.errors.length} 个会话同步失败` : null
        }
      })
    }
    return true
  },

  bindSessionSyncState: () => {
    if (sessionSyncBound) return
    sessionSyncBound = true
    sessionSyncUnsubscribe = window.api.sync.onSessionSyncState((state) =>
      set({ sessionSync: state })
    )
    void window.api.sync.getSessionSyncState().then((result) => {
      if (result.success && result.data) set({ sessionSync: result.data })
    })
  },

  syncConfigNow: async (fromSyncAll) => {
    if (!fromSyncAll) set({ pendingAction: 'config-sync', error: null })
    const result = await window.api.sync.configSyncNow()
    if (!fromSyncAll) set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '配置同步失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    if (result.data) {
      const syncResult: ConfigSyncResult = result.data
      set({
        configSync: {
          phase: syncResult.errors.length > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
          lastResult: syncResult,
          lastError:
            syncResult.errors.length > 0 ? `${syncResult.errors.length} 项配置同步失败` : null
        }
      })
    }
    return true
  },

  bindConfigSyncState: () => {
    if (configSyncBound) return
    configSyncBound = true
    configSyncUnsubscribe = window.api.sync.onConfigSyncState((state) => set({ configSync: state }))
    void window.api.sync.getConfigSyncState().then((result) => {
      if (result.success && result.data) set({ configSync: result.data })
    })
  },

  syncWriterNow: async (fromSyncAll) => {
    if (!fromSyncAll) set({ pendingAction: 'writer-sync', error: null })
    const result = await window.api.sync.writerSyncNow()
    if (!fromSyncAll) set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '写作同步失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    if (result.data) {
      const syncResult: WriterSyncResult = result.data
      set({
        writerSync: {
          phase: syncResult.errors.length > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
          lastResult: syncResult,
          lastError:
            syncResult.errors.length > 0 ? `${syncResult.errors.length} 篇写作同步失败` : null
        }
      })
    }
    return true
  },

  bindWriterSyncState: () => {
    if (writerSyncBound) return
    writerSyncBound = true
    writerSyncUnsubscribe = window.api.sync.onWriterSyncState((state) => set({ writerSync: state }))
    void window.api.sync.getWriterSyncState().then((result) => {
      if (result.success && result.data) set({ writerSync: result.data })
    })
  },

  syncKnowledgeNow: async (fromSyncAll) => {
    if (!fromSyncAll) set({ pendingAction: 'knowledge-sync', error: null })
    const result = await window.api.sync.knowledgeSyncNow()
    if (!fromSyncAll) set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '知识库同步失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    if (result.data) {
      const syncResult: KnowledgeSyncResult = result.data
      set({
        knowledgeSync: {
          phase: syncResult.errors.length > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
          lastResult: syncResult,
          lastError:
            syncResult.errors.length > 0 ? `${syncResult.errors.length} 项知识库同步失败` : null
        }
      })
    }
    return true
  },

  bindKnowledgeSyncState: () => {
    if (knowledgeSyncBound) return
    knowledgeSyncBound = true
    knowledgeSyncUnsubscribe = window.api.sync.onKnowledgeSyncState((state) =>
      set({ knowledgeSync: state })
    )
    void window.api.sync.getKnowledgeSyncState().then((result) => {
      if (result.success && result.data) set({ knowledgeSync: result.data })
    })
  },

  syncPaperNow: async (fromSyncAll) => {
    if (!fromSyncAll) set({ pendingAction: 'paper-sync', error: null })
    const result = await window.api.sync.paperSyncNow()
    if (!fromSyncAll) set({ pendingAction: null })
    if (!result.success) {
      const message = formatFailure(result, '论文同步失败')
      set({ error: message })
      notifyError('数据同步', message, { source: 'settings' })
      return false
    }
    if (result.data) {
      const syncResult: PaperSyncResult = result.data
      set({
        paperSync: {
          phase: syncResult.errors.length > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
          lastResult: syncResult,
          lastError:
            syncResult.errors.length > 0 ? `${syncResult.errors.length} 篇论文同步失败` : null,
          downloads: get().paperSync.downloads
        }
      })
    }
    return true
  },

  bindPaperSyncState: () => {
    if (paperSyncBound) return
    paperSyncBound = true
    paperSyncUnsubscribe = window.api.sync.onPaperSyncState((state) => set({ paperSync: state }))
    void window.api.sync.getPaperSyncState().then((result) => {
      if (result.success && result.data) set({ paperSync: result.data })
    })
  },

  syncAllNow: async () => {
    set({ pendingAction: 'sync-all', error: null })
    const results = await Promise.all([
      get().syncSessionsNow(true),
      get().syncConfigNow(true),
      get().syncWriterNow(true),
      get().syncKnowledgeNow(true),
      get().syncPaperNow(true)
    ])
    set({ pendingAction: null })
    const failed = results.filter((ok) => !ok).length
    if (failed === 0) {
      notifySuccess('数据同步', '全部领域同步完成', { source: 'settings' })
    } else {
      notifyWarning('数据同步', `同步完成，${failed} 个领域失败，详见各模块状态`, {
        source: 'settings'
      })
    }
    return results.every((ok) => ok)
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
        // 主动断开/清理期间落地的在飞请求：静默丢弃，不误报为连接失败
        if (!shouldReconnect) return
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
    clearReconcileTimer()
    closeSocket()
    if (sessionSyncUnsubscribe) {
      sessionSyncUnsubscribe()
      sessionSyncUnsubscribe = null
    }
    sessionSyncBound = false
    if (configSyncUnsubscribe) {
      configSyncUnsubscribe()
      configSyncUnsubscribe = null
    }
    configSyncBound = false
    if (writerSyncUnsubscribe) {
      writerSyncUnsubscribe()
      writerSyncUnsubscribe = null
    }
    writerSyncBound = false
    if (knowledgeSyncUnsubscribe) {
      knowledgeSyncUnsubscribe()
      knowledgeSyncUnsubscribe = null
    }
    knowledgeSyncBound = false
    if (paperSyncUnsubscribe) {
      paperSyncUnsubscribe()
      paperSyncUnsubscribe = null
    }
    paperSyncBound = false
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
        window.api.sync.notifyConfigManifestEvent()
        scheduleReconcile(get)
        return
      case 'session_file_updated':
      case 'session_file_deleted':
        if (event.sessionId.startsWith('paper-')) {
          window.api.sync.notifyPaperFileEvent()
        } else if (event.sessionId.startsWith('knowledge-')) {
          window.api.sync.notifyKnowledgeFileEvent()
        } else if (event.sessionId.startsWith('writer-')) {
          window.api.sync.notifyWriterFileEvent()
        } else {
          window.api.sync.notifySessionFileEvent()
        }
        scheduleReconcile(get)
        return
    }
  }
}))
