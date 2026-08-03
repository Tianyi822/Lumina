import { ipcRenderer } from 'electron'
import type {
  ConnectResult,
  DiscardResult,
  DiscoveryInfo,
  EventTicketResult,
  ReconcileSummary,
  RedeemResult,
  RelayDevice,
  SessionSyncResult,
  SessionSyncState,
  SyncCodeResult,
  SyncResult,
  SyncStatus
} from '@shared/types/sync'
import type { SyncApi } from '../types/sync'
import { createIpcListener } from './base'

/**
 * 数据同步相关的 API。
 */
export const syncApi: SyncApi = {
  discover: (relayUrl) => {
    return invoke<DiscoveryInfo>('sync:discover', relayUrl)
  },
  connect: (relayUrl, username, password) => {
    return invoke<ConnectResult>('sync:connect', relayUrl, username, password)
  },
  renewSession: () => {
    return invoke<SyncStatus>('sync:renewSession')
  },
  getStatus: () => {
    return invoke<SyncStatus>('sync:getStatus')
  },
  disconnect: () => {
    return invoke('sync:disconnect')
  },
  refreshBootstrap: () => {
    return invoke<SyncStatus>('sync:refreshBootstrap')
  },
  generateSyncCode: () => {
    return invoke<SyncCodeResult>('sync:generateSyncCode')
  },
  redeemSyncCode: (code) => {
    return invoke<RedeemResult>('sync:redeemSyncCode', code)
  },
  listDevices: () => {
    return invoke<RelayDevice[]>('sync:listDevices')
  },
  revokeDevice: (deviceId) => {
    return invoke<{ revoked: boolean }>('sync:revokeDevice', deviceId)
  },
  discardOtherGroups: () => {
    return invoke<DiscardResult>('sync:discardOtherGroups')
  },
  createEventTicket: () => {
    return invoke<EventTicketResult>('sync:createEventTicket')
  },
  reconcile: () => {
    return invoke<ReconcileSummary>('sync:reconcile')
  },
  sessionSyncNow: () => {
    return invoke<SessionSyncResult>('sync:sessionSyncNow')
  },
  getSessionSyncState: () => {
    return invoke<SessionSyncState>('sync:getSessionSyncState')
  },
  onSessionSyncState: (callback) => {
    return createIpcListener<SessionSyncState>('sync:sessionSyncState', callback)
  },
  notifySessionFileEvent: () => {
    ipcRenderer.send('sync:sessionFileEvent')
  }
}

async function invoke<T = void>(channel: string, ...args: unknown[]): Promise<SyncResult<T>> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    return {
      success: false,
      code: 'unknown_error',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
