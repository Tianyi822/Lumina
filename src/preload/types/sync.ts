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

/**
 * 数据同步 API 类型定义。
 * 所有方法返回统一 SyncResult；WebSocket 事件由渲染进程直接监听，不经此 API。
 */
export interface SyncApi {
  /** 验证 Relay 地址并读取服务发现信息 */
  discover: (relayUrl: string) => Promise<SyncResult<DiscoveryInfo>>
  /** 连接同步服务（注册/登录自动分流） */
  connect: (
    relayUrl: string,
    username: string,
    password: string
  ) => Promise<SyncResult<ConnectResult>>
  /** 会话续期（无需密码） */
  renewSession: () => Promise<SyncResult<SyncStatus>>
  /** 获取当前同步状态 */
  getStatus: () => Promise<SyncResult<SyncStatus>>
  /** 断开连接并清除本地身份 */
  disconnect: () => Promise<SyncResult>
  /** 刷新 bootstrap 根状态 */
  refreshBootstrap: () => Promise<SyncResult<SyncStatus>>
  /** 生成六位同步码 */
  generateSyncCode: () => Promise<SyncResult<SyncCodeResult>>
  /** 兑换六位同步码 */
  redeemSyncCode: (code: string) => Promise<SyncResult<RedeemResult>>
  /** 列出同步组内设备 */
  listDevices: () => Promise<SyncResult<RelayDevice[]>>
  /** 吊销组内设备 */
  revokeDevice: (deviceId: string) => Promise<SyncResult<{ revoked: boolean }>>
  /** 放弃当前组以外的其他同步组 */
  discardOtherGroups: () => Promise<SyncResult<DiscardResult>>
  /** 创建 WebSocket 事件票据 */
  createEventTicket: () => Promise<SyncResult<EventTicketResult>>
  /** 断线重连后的全量对账 */
  reconcile: () => Promise<SyncResult<ReconcileSummary>>
  /** 手动触发会话同步（等待完成） */
  sessionSyncNow: () => Promise<SyncResult<SessionSyncResult>>
  /** 读取会话同步引擎状态 */
  getSessionSyncState: () => Promise<SyncResult<SessionSyncState>>
  /** 订阅会话同步状态推送；返回取消订阅函数 */
  onSessionSyncState: (callback: (state: SessionSyncState) => void) => () => void
  /** 转发 WebSocket 的 session_file_* 事件给主进程同步引擎（去抖由引擎负责） */
  notifySessionFileEvent: () => void
}
