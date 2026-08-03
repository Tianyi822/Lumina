/**
 * 会话 JSONL 解析与行级合并（纯函数）。
 *
 * 合并规则（见规格 §合并规则）：
 * - meta：两端最后一条 meta 中取 updatedAt 较新者，相等/不可解析取远端；
 * - message：按 id 去重 union，同 id 内容不一致取远端，按 (timestamp, id) 排序；
 * - 任一方有无法解析的非空行：整文件回退 LWW（meta.updatedAt 较新一方的原文）。
 */
import type { SessionMessage, SessionMetaData } from '@shared/types/session'

/** 解析结果：meta 可能缺失（全坏文件），messages 已按 id 去重 */
export interface ParsedSessionJsonl {
  meta: SessionMetaData | null
  messages: SessionMessage[]
  hasBadLines: boolean
}

/** 合并结果：content 为可落盘/可上传的 JSONL 文本 */
export interface SessionMergeResult {
  content: string
  meta: SessionMetaData | null
  messages: SessionMessage[]
  /** 同 id 消息内容冲突并已按远端裁决 */
  conflictResolved: boolean
  /** 任一方存在坏行，已回退整文件 LWW */
  fallback: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSessionMessageLike(value: unknown): value is SessionMessage {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.role === 'string' &&
    typeof value.content === 'string'
  )
}

function isSessionMetaLike(value: unknown): value is SessionMetaData {
  if (!isRecord(value)) return false
  return typeof value.sessionId === 'string' && typeof value.title === 'string'
}

/** 序列化一条记录（与 SessionStorageService.serializeRecord 字节一致） */
function serializeRecord(
  record: { kind: 'meta'; v: 1; data: SessionMetaData } | { kind: 'message'; data: SessionMessage }
): string {
  return JSON.stringify(record) + '\n'
}

/** 解析 JSONL 文本；meta 取最后一条，message 按 id 去重（后者覆盖内容、保持首次位置） */
export function parseSessionJsonl(content: string): ParsedSessionJsonl {
  let meta: SessionMetaData | null = null
  const messages: SessionMessage[] = []
  const indexById = new Map<string, number>()
  let hasBadLines = false
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      hasBadLines = true
      continue
    }
    if (!isRecord(record)) {
      hasBadLines = true
      continue
    }
    if (record.kind === 'meta' && isSessionMetaLike(record.data)) {
      meta = record.data
      continue
    }
    if (record.kind === 'message' && isSessionMessageLike(record.data)) {
      const existing = indexById.get(record.data.id)
      if (existing !== undefined) {
        messages[existing] = record.data
      } else {
        indexById.set(record.data.id, messages.length)
        messages.push(record.data)
      }
      continue
    }
    hasBadLines = true
  }
  return { meta, messages, hasBadLines }
}

/** 比较 meta 新旧：updatedAt 较新者胜；相等/不可解析判远端胜 */
function pickNewerMeta(
  local: SessionMetaData | null,
  remote: SessionMetaData | null
): 'local' | 'remote' {
  if (!local) return 'remote'
  if (!remote) return 'local'
  const localTime = Date.parse(local.updatedAt)
  const remoteTime = Date.parse(remote.updatedAt)
  if (Number.isNaN(localTime)) return 'remote'
  if (Number.isNaN(remoteTime)) return 'local'
  return localTime > remoteTime ? 'local' : 'remote'
}

/** 行级合并两份会话 JSONL */
export function mergeSessionJsonl(local: string, remote: string): SessionMergeResult {
  const localParsed = parseSessionJsonl(local)
  const remoteParsed = parseSessionJsonl(remote)

  // 任一方有坏行：整文件 LWW 回退
  if (localParsed.hasBadLines || remoteParsed.hasBadLines) {
    const winner = pickNewerMeta(localParsed.meta, remoteParsed.meta)
    const content = winner === 'local' ? local : remote
    const parsed = winner === 'local' ? localParsed : remoteParsed
    return {
      content,
      meta: parsed.meta,
      messages: parsed.messages,
      conflictResolved: false,
      fallback: true
    }
  }

  const meta =
    (pickNewerMeta(localParsed.meta, remoteParsed.meta) === 'local'
      ? localParsed.meta
      : remoteParsed.meta) ?? remoteParsed.meta

  // 消息 union：先放本地，再用远端覆盖同 id 不同内容者
  const messages: SessionMessage[] = [...localParsed.messages]
  const indexById = new Map(messages.map((m, index) => [m.id, index]))
  let conflictResolved = false
  for (const remoteMessage of remoteParsed.messages) {
    const existing = indexById.get(remoteMessage.id)
    if (existing === undefined) {
      indexById.set(remoteMessage.id, messages.length)
      messages.push(remoteMessage)
      continue
    }
    if (JSON.stringify(messages[existing]) !== JSON.stringify(remoteMessage)) {
      messages[existing] = remoteMessage
      conflictResolved = true
    }
  }
  messages.sort((a, b) =>
    a.timestamp === b.timestamp ? a.id.localeCompare(b.id) : a.timestamp < b.timestamp ? -1 : 1
  )

  if (!meta) {
    return { content: remote, meta: null, messages, conflictResolved, fallback: true }
  }
  let content = serializeRecord({ kind: 'meta', v: 1, data: meta })
  for (const message of messages) {
    content += serializeRecord({ kind: 'message', data: message })
  }
  return { content, meta, messages, conflictResolved, fallback: false }
}
