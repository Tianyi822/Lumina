import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type {
  ToolCallRecord,
  ToolStatsCategory,
  ToolStatsSummary,
  TimeRange
} from '@shared/types/tool-stats'

/** 持久化目录名 */
const STATS_DIR_NAME = 'tool-stats'
/** 内存中保留的最大记录数 */
const MAX_IN_MEMORY_RECORDS = 5000
/** 持久化间隔（ms） */
const PERSIST_INTERVAL_MS = 60_000
/** 历史文件保留天数 */
const MAX_HISTORY_DAYS = 30

/**
 * 工具统计收集器
 * 内存记录 + 定期持久化到 ~/.lumina/tool-stats/（按日期 rolling）
 */
export class ToolStatsCollector {
  private records: ToolCallRecord[] = []
  private persistTimer: ReturnType<typeof setInterval> | null = null

  /** 记录一次工具调用 */
  record(record: Omit<ToolCallRecord, 'timestamp'> & { timestamp?: number }): void {
    this.records.push({
      ...record,
      timestamp: record.timestamp ?? Date.now()
    })

    if (this.records.length > MAX_IN_MEMORY_RECORDS) {
      this.records = this.records.slice(-MAX_IN_MEMORY_RECORDS)
    }
  }

  /** 获取所有工具统计概览 */
  getAllStats(timeRange?: TimeRange): ToolStatsSummary[] {
    const filtered = this.filterByTimeRange(this.records, timeRange)
    const grouped = this.groupByToolName(filtered)
    return Array.from(grouped.entries()).map(([toolName, recs]) =>
      this.buildSummary(toolName, recs)
    )
  }

  /** 单个工具详细统计 */
  getToolStats(toolName: string, timeRange?: TimeRange): ToolStatsSummary | null {
    const filtered = this.filterByTimeRange(this.records, timeRange)
    const matched = filtered.filter((r) => r.toolName === toolName)
    if (matched.length === 0) return null
    return this.buildSummary(toolName, matched)
  }

  /** 按类别查询统计 */
  getCategoryStats(category: ToolStatsCategory, timeRange?: TimeRange): ToolStatsSummary[] {
    const filtered = this.filterByTimeRange(this.records, timeRange).filter(
      (r) => r.category === category
    )
    const grouped = this.groupByToolName(filtered)
    return Array.from(grouped.entries()).map(([toolName, recs]) =>
      this.buildSummary(toolName, recs)
    )
  }

  /** 会话维度查询 */
  getSessionStats(sessionId: string): ToolCallRecord[] {
    return this.records.filter((r) => r.sessionId === sessionId)
  }

  /** 使用频率排行 */
  getTopTools(limit: number): ToolStatsSummary[] {
    return this.getAllStats()
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, limit)
  }

  /** 响应耗时排行 */
  getSlowestTools(limit: number): ToolStatsSummary[] {
    return this.getAllStats()
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, limit)
  }

  /** 清除历史统计（内存 + 磁盘） */
  clear(): void {
    this.records = []
    this.clearPersistedFiles()
  }

  /** 启动定期持久化 */
  startPersist(): void {
    if (this.persistTimer) return
    this.loadPersisted()
    this.persistTimer = setInterval(() => this.persist(), PERSIST_INTERVAL_MS)
    this.persistTimer.unref?.()
  }

  /** 停止持久化并写入磁盘 */
  stopPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer)
      this.persistTimer = null
    }
    this.persist()
  }

  // ========== 内部方法 ==========

  private filterByTimeRange(records: ToolCallRecord[], timeRange?: TimeRange): ToolCallRecord[] {
    if (!timeRange) return records
    return records.filter(
      (r) => r.timestamp >= timeRange.from.getTime() && r.timestamp <= timeRange.to.getTime()
    )
  }

  private groupByToolName(records: ToolCallRecord[]): Map<string, ToolCallRecord[]> {
    const map = new Map<string, ToolCallRecord[]>()
    for (const r of records) {
      const list = map.get(r.toolName) || []
      list.push(r)
      map.set(r.toolName, list)
    }
    return map
  }

  private buildSummary(toolName: string, records: ToolCallRecord[]): ToolStatsSummary {
    const successes = records.filter((r) => r.success)
    const failures = records.filter((r) => !r.success)
    const durations = records.map((r) => r.durationMs).sort((a, b) => a - b)

    const serverName = records[0]?.serverName ?? toolName.split('__')[0]

    return {
      toolName,
      serverName,
      totalCalls: records.length,
      successRate: records.length > 0 ? successes.length / records.length : 0,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
      p50DurationMs: this.percentile(durations, 50),
      p95DurationMs: this.percentile(durations, 95),
      lastCalledAt: new Date(records[records.length - 1].timestamp),
      errorCount: failures.length,
      topErrors: this.getTopErrors(failures)
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  private getTopErrors(failures: ToolCallRecord[]): Array<{ message: string; count: number }> {
    const countMap = new Map<string, number>()
    for (const f of failures) {
      if (!f.errorMessage) continue
      countMap.set(f.errorMessage, (countMap.get(f.errorMessage) || 0) + 1)
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }))
  }

  // ========== 持久化 ==========

  private getStatsDir(): string {
    const homeDir = app.getPath('home')
    return join(homeDir, '.lumina', STATS_DIR_NAME)
  }

  private getTodayFilePath(): string {
    const dateStr = new Date().toISOString().slice(0, 10)
    return join(this.getStatsDir(), `${dateStr}.json`)
  }

  private persist(): void {
    try {
      const dir = this.getStatsDir()
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const filePath = this.getTodayFilePath()
      writeFileSync(filePath, JSON.stringify(this.records), 'utf-8')

      this.cleanOldFiles()
    } catch {
      // 持久化失败不影响主流程
    }
  }

  private loadPersisted(): void {
    try {
      const filePath = this.getTodayFilePath()
      if (!existsSync(filePath)) return

      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (Array.isArray(data)) {
        this.records = data as ToolCallRecord[]
      }
    } catch {
      // 加载失败则从空开始
    }
  }

  private cleanOldFiles(): void {
    try {
      const dir = this.getStatsDir()
      if (!existsSync(dir)) return

      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
      const cutoff = MAX_HISTORY_DAYS

      for (let i = 0; i < files.length - cutoff; i++) {
        const filePath = join(dir, files[i])
        try {
          unlinkSync(filePath)
        } catch {
          // 单个文件删除失败不影响其他
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }

  private clearPersistedFiles(): void {
    try {
      const dir = this.getStatsDir()
      if (!existsSync(dir)) return

      const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
      for (const f of files) {
        try {
          unlinkSync(join(dir, f))
        } catch {
          // 单个文件删除失败不影响其他
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }
}

/** 全局单例 */
export const toolStatsCollector = new ToolStatsCollector()
