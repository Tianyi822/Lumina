import type { SessionMessage } from '@shared/types/session'

/**
 * 消息持久化决策
 * - append：仅需追加尾部若干新消息
 * - rewrite：前缀发生变更（编辑/删除），需全量重写
 * - noop：无变化
 */
export type MessagePersistenceDecision =
  | { kind: 'append'; messages: SessionMessage[] }
  | { kind: 'rewrite' }
  | { kind: 'noop' }

/**
 * 比较已落盘消息与当前消息，决定增量追加还是全量重写
 * @param previous 上次持久化的消息快照
 * @param next 当前消息快照
 * @param persistedCount 已确认落盘的消息条数（游标）
 */
export function diffAppendableMessages(
  previous: SessionMessage[],
  next: SessionMessage[],
  persistedCount: number
): MessagePersistenceDecision {
  // 以落盘游标为界；游标之前的消息必须逐条 id 一致，否则说明前缀被改写
  const boundary = Math.min(persistedCount, previous.length)
  if (next.length < boundary) {
    return { kind: 'rewrite' }
  }
  for (let i = 0; i < boundary; i++) {
    if (next[i]?.id !== previous[i]?.id) {
      return { kind: 'rewrite' }
    }
  }
  if (next.length === boundary) {
    return { kind: 'noop' }
  }
  return { kind: 'append', messages: next.slice(boundary) }
}
