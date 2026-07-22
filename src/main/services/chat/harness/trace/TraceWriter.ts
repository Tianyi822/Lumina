// src/main/services/chat/harness/trace/TraceWriter.ts
/**
 * Trace 落盘:append-only jsonl。
 *
 * 路径:~/.lumina/agent-traces/<sessionId>/<requestId>.jsonl
 * 阶段 A 实现但不接入主流程;阶段 D 由 TraceRecorder 调用。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §5.1
 */
import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TraceRecord } from './TraceSchema'

export interface TraceWriterOptions {
  /** 测试可注入临时目录;生产用 ~/.lumina/agent-traces/ */
  rootDir: string
  sessionId: string
  requestId: string
}

export class TraceWriter {
  private readonly filePath: string
  private readonly buffer: TraceRecord[] = []

  constructor(opts: TraceWriterOptions) {
    this.filePath = join(opts.rootDir, opts.sessionId, `${opts.requestId}.jsonl`)
  }

  /** 追加到内存 buffer */
  append(record: TraceRecord): void {
    this.buffer.push(record)
  }

  /** 把 buffer 落盘(append 模式,不覆盖) */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    await mkdir(dirname(this.filePath), { recursive: true })
    const lines = this.buffer.map((r) => JSON.stringify(r)).join('\n') + '\n'
    await appendFile(this.filePath, lines, 'utf-8')
    this.buffer.length = 0
  }
}

/**
 * 清理超过 maxAgeDays 的 trace 文件。
 * 遍历 rootDir 下所有 session 子目录的所有 jsonl 文件。
 *
 * @returns 实际删除的文件数
 */
export async function cleanupOldTraces(rootDir: string, maxAgeDays: number): Promise<number> {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()
  let deleted = 0

  let sessionDirs: string[]
  try {
    sessionDirs = await readdir(rootDir)
  } catch {
    return 0 // 目录不存在
  }

  for (const sessionDir of sessionDirs) {
    const sessionPath = join(rootDir, sessionDir)
    const dirStat = await stat(sessionPath).catch(() => null)
    if (!dirStat?.isDirectory()) continue

    let files: string[]
    try {
      files = await readdir(sessionPath)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = join(sessionPath, file)
      const fileStat = await stat(filePath).catch(() => null)
      if (!fileStat) continue
      if (now - fileStat.mtimeMs > maxAgeMs) {
        await unlink(filePath).catch(() => {})
        deleted++
      }
    }
  }

  return deleted
}
