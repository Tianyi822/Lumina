import type { SessionMessage } from '@shared/types/session'

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
