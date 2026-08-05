import type {
  ConfigSyncResult,
  ConfigSyncState,
  ConnectResult,
  DiscardResult,
  DiscoveryInfo,
  EventTicketResult,
  KnowledgeSyncResult,
  KnowledgeSyncState,
  PaperSyncResult,
  PaperSyncState,
  ReconcileSummary,
  RedeemResult,
  RelayDevice,
  SessionSyncResult,
  SessionSyncState,
  SyncCodeResult,
  SyncResult,
  SyncStatus,
  WriterSyncResult,
  WriterSyncState
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
  /** 手动触发配置同步（等待完成） */
  configSyncNow: () => Promise<SyncResult<ConfigSyncResult>>
  /** 读取配置同步引擎状态 */
  getConfigSyncState: () => Promise<SyncResult<ConfigSyncState>>
  /** 订阅配置同步状态推送；返回取消订阅函数 */
  onConfigSyncState: (callback: (state: ConfigSyncState) => void) => () => void
  /** 转发 WebSocket 的 manifest_updated 事件给主进程配置同步引擎（去抖由引擎负责） */
  notifyConfigManifestEvent: () => void
  /** 手动触发写作同步（等待完成） */
  writerSyncNow: () => Promise<SyncResult<WriterSyncResult>>
  /** 读取写作同步引擎状态 */
  getWriterSyncState: () => Promise<SyncResult<WriterSyncState>>
  /** 订阅写作同步状态推送；返回取消订阅函数 */
  onWriterSyncState: (callback: (state: WriterSyncState) => void) => () => void
  /** 转发 WebSocket 的 writer-* session_file 事件（去抖由引擎负责） */
  notifyWriterFileEvent: () => void
  /** 手动触发知识库同步（等待完成） */
  knowledgeSyncNow: () => Promise<SyncResult<KnowledgeSyncResult>>
  /** 读取知识库同步引擎状态 */
  getKnowledgeSyncState: () => Promise<SyncResult<KnowledgeSyncState>>
  /** 订阅知识库同步状态推送；返回取消订阅函数 */
  onKnowledgeSyncState: (callback: (state: KnowledgeSyncState) => void) => () => void
  /** 转发 WebSocket 的 knowledge-* session_file 事件（去抖由引擎负责） */
  notifyKnowledgeFileEvent: () => void
  /** 手动触发论文同步 */
  paperSyncNow: () => Promise<SyncResult<PaperSyncResult>>
  /** 读取论文同步引擎状态 */
  getPaperSyncState: () => Promise<SyncResult<PaperSyncState>>
  /** 订阅论文同步状态推送；返回取消订阅函数 */
  onPaperSyncState: (callback: (state: PaperSyncState) => void) => () => void
  /** 触发论文 pack 懒下载 */
  requestPaperPackDownload: (paperId: string) => Promise<SyncResult>
  /** 转发 WebSocket 的 paper-* session_file 事件 */
  notifyPaperFileEvent: () => void
}
