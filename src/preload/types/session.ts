import type {
  SessionData,
  SessionListItem,
  SessionMessage,
  SessionMetaPatch,
  SessionResourceRef,
  SessionResult,
  SessionType
} from '@shared/types/session'

export type {
  SessionData,
  SessionListItem,
  SessionMessage,
  SessionMetaPatch,
  SessionResourceRef,
  SessionResult,
  SessionType
} from '@shared/types/session'

/**
 * 会话相关的 API
 */
export interface SessionApi {
  /** 创建新会话 */
  create: (
    title?: string,
    type?: SessionType,
    resourceRef?: SessionResourceRef
  ) => Promise<SessionResult>
  /** 保存会话数据 */
  save: (data: SessionData) => Promise<SessionResult>
  /** 追加一批新消息 */
  appendMessages: (sessionId: string, messages: SessionMessage[]) => Promise<SessionResult>
  /** 更新会话元数据 */
  updateMeta: (sessionId: string, patch: SessionMetaPatch) => Promise<SessionResult>
  /** 加载指定会话 */
  load: (sessionId: string) => Promise<SessionResult>
  /** 获取所有会话列表 */
  list: () => Promise<SessionListItem[]>
  /** 删除指定会话 */
  delete: (sessionId: string) => Promise<SessionResult>
  /** 重命名会话标题 */
  rename: (sessionId: string, newTitle: string) => Promise<SessionResult>
}
