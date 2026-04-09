import type {
  SessionData,
  SessionListItem,
  SessionResult,
  SessionType
} from '@shared/types/session'

export type {
  ReActIterationData,
  ReActStepData,
  SessionData,
  SessionListItem,
  SessionMessage,
  SessionMeta,
  SessionResult,
  SessionSelectionState,
  SessionType
} from '@shared/types/session'

/**
 * 会话相关的 API
 */
export interface SessionApi {
  create: (title?: string, type?: SessionType) => Promise<SessionData>
  save: (data: SessionData) => Promise<SessionResult>
  load: (sessionId: string) => Promise<SessionData | null>
  list: () => Promise<SessionListItem[]>
  delete: (sessionId: string) => Promise<SessionResult>
  rename: (sessionId: string, newTitle: string) => Promise<SessionResult>
}
