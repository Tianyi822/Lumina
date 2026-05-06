/**
 * 工具统计相关类型定义
 * 跨进程共享：主进程服务 → IPC Handler → Preload → 渲染进程
 */

/** 工具类别 */
export type ToolStatsCategory = 'lab' | 'knowledge' | 'mcp' | 'skill' | 'paper_web'

/** 单次工具调用记录 */
export interface ToolCallRecord {
  /** 工具名称（fullName: serverName__toolName） */
  toolName: string
  /** 来源服务器名 */
  serverName: string
  /** 工具类别 */
  category: ToolStatsCategory
  /** 所属会话 ID */
  sessionId: string
  /** 调用时间戳（ms） */
  timestamp: number
  /** 执行耗时（ms） */
  durationMs: number
  /** 是否成功 */
  success: boolean
  /** 失败时的错误信息 */
  errorMessage?: string
}

/** 单个工具的聚合统计 */
export interface ToolStatsSummary {
  /** 工具名称 */
  toolName: string
  /** 来源服务器名 */
  serverName: string
  /** 总调用次数 */
  totalCalls: number
  /** 成功率（0-1） */
  successRate: number
  /** 平均耗时（ms） */
  avgDurationMs: number
  /** P50 耗时（ms） */
  p50DurationMs: number
  /** P95 耗时（ms） */
  p95DurationMs: number
  /** 最后调用时间 */
  lastCalledAt: Date
  /** 错误次数 */
  errorCount: number
  /** 高频错误 */
  topErrors: Array<{ message: string; count: number }>
}

/** 统计查询的时间范围 */
export interface TimeRange {
  from: Date
  to: Date
}
