// src/main/services/chat/harness/trace/TraceRecorder.ts
/**
 * Trace 收集器(内存版)。
 * 阶段 D 会加 TraceWriter 落盘;阶段 A 只收集到数组供测试断言。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §5.2
 */
import type { SessionType } from '../HarnessContext'
import type { TraceEvent, TraceRecord } from './TraceSchema'

const SECRET_PATTERNS = [
  /api[_-]?key\s*[=:]\s*["']?sk-[A-Za-z0-9_-]+/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /bearer\s+[A-Za-z0-9_-]+/gi,
  /password\s*[=:]\s*["']?[^\s"']+/gi
]

export interface TraceRecorderOptions {
  requestId: string
  sessionId: string
  sessionType: SessionType
  paperId?: string
  redactSecrets?: boolean
}

export class TraceRecorder {
  private readonly events: TraceRecord[] = []
  private readonly opts: TraceRecorderOptions

  constructor(opts: TraceRecorderOptions) {
    this.opts = { redactSecrets: true, ...opts }
  }

  log(event: TraceEvent): void {
    const processed = this.opts.redactSecrets ? this.redact(event) : event
    this.events.push({
      ts: Date.now(),
      requestId: this.opts.requestId,
      sessionId: this.opts.sessionId,
      paperId: this.opts.paperId,
      event: processed
    })
  }

  getEvents(): TraceRecord[] {
    return [...this.events]
  }

  clear(): void {
    this.events.length = 0
  }

  private redact(event: TraceEvent): TraceEvent {
    const json = JSON.stringify(event)
    let redacted = json
    for (const pattern of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED]')
    }
    return JSON.parse(redacted) as TraceEvent
  }
}
