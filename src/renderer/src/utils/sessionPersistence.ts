import type { SessionData, SessionMessage } from '@shared/types/session'

/**
 * 消息持久化决策
 * - append：仅需从 startIndex 起追加尾部新消息
 * - rewrite：已落盘前缀发生内容变更（编辑/删除/原地补写），需全量重写
 * - noop：无变化
 */
export type MessagePersistenceDecision =
  | { kind: 'append'; startIndex: number }
  | { kind: 'rewrite' }
  | { kind: 'noop' }

/** 将消息序列化为逐条快照字符串，供落盘前后做内容级比较 */
export function serializeSessionMessages(messages: SessionMessage[]): string[] {
  return messages.map((message) => JSON.stringify(message))
}

/**
 * 比较已落盘消息快照与当前消息快照，决定增量追加还是全量重写
 * 按序列化内容逐条比较（而非仅比较 id），可捕获同 id 消息被原地补写的场景
 * @param previousSerialized 上次持久化的逐条序列化快照
 * @param nextSerialized 当前消息的逐条序列化快照
 * @param persistedCount 已确认落盘的消息条数（游标）
 */
export function diffAppendableMessages(
  previousSerialized: string[],
  nextSerialized: string[],
  persistedCount: number
): MessagePersistenceDecision {
  // 以落盘游标为界；游标之前的消息必须逐条内容一致，否则说明前缀被改写
  const boundary = Math.min(persistedCount, previousSerialized.length)
  if (nextSerialized.length < boundary) {
    return { kind: 'rewrite' }
  }
  for (let i = 0; i < boundary; i++) {
    if (nextSerialized[i] !== previousSerialized[i]) {
      return { kind: 'rewrite' }
    }
  }
  if (nextSerialized.length === boundary) {
    return { kind: 'noop' }
  }
  return { kind: 'append', startIndex: boundary }
}

/** 增量持久化游标（hook 以 ref 持有并跨次保存复用） */
export interface SessionPersistenceCursor {
  /** 上次持久化的逐条序列化快照 */
  serialized: string[]
  /** 已确认落盘的消息条数 */
  count: number
}

/** 增量持久化结果 */
export interface PersistSessionResult {
  ok: boolean
  /** 成功时的下一个会话状态（rewrite 为完整 plain 会话；meta 更新为仅替换 selectionState；无变化为 null） */
  nextSession: SessionData | null
  error?: string
}

/**
 * 按内容级 diff 决策执行会话增量持久化协议
 * append → session:appendMessages；前缀变更/强制 → session:save 全量重写；
 * selection 变化时追加 meta；游标仅在对应 IPC 成功后前移
 * 入参须为 plain 数据（无 Proxy/引用），克隆由调用方负责
 */
export async function persistSessionIncrementally(options: {
  session: SessionData
  nextMessages: SessionMessage[]
  selectionState: NonNullable<SessionData['selectionState']>
  cursor: SessionPersistenceCursor
  forceRewrite?: boolean
  errorLabel: string
}): Promise<PersistSessionResult> {
  const {
    session,
    nextMessages,
    selectionState,
    cursor,
    forceRewrite = false,
    errorLabel
  } = options
  const nextSerialized = serializeSessionMessages(nextMessages)
  const decision = diffAppendableMessages(cursor.serialized, nextSerialized, cursor.count)

  // rewrite：前缀被改写/删除，或调用方要求强制全量重写
  if (decision.kind === 'rewrite' || forceRewrite) {
    const nextSession: SessionData = { ...session, messages: nextMessages, selectionState }
    const result = await window.api.session.save(nextSession)
    if (!result.success) {
      return { ok: false, nextSession: null, error: result.error || errorLabel }
    }
    cursor.serialized = nextSerialized
    cursor.count = nextSerialized.length
    // 全量重写已包含 selectionState，无需再走 meta 步骤
    return { ok: true, nextSession }
  }

  // 追加新增消息
  if (decision.kind === 'append') {
    const appended = await window.api.session.appendMessages(
      session.sessionId,
      nextMessages.slice(decision.startIndex)
    )
    if (!appended.success) {
      return { ok: false, nextSession: null, error: appended.error || errorLabel }
    }
    cursor.serialized = nextSerialized
    cursor.count = nextSerialized.length
  }

  // selection 内容未变则跳过 meta 写入，避免纯消息追加路径的额外存储成本
  if (JSON.stringify(selectionState) === JSON.stringify(session.selectionState ?? null)) {
    return { ok: true, nextSession: null }
  }

  const metaResult = await window.api.session.updateMeta(session.sessionId, { selectionState })
  if (!metaResult.success) {
    return { ok: false, nextSession: null, error: metaResult.error || errorLabel }
  }
  return { ok: true, nextSession: { ...session, selectionState } }
}
