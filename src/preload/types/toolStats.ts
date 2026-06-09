import type {
  ToolCallRecord,
  ToolStatsCategory,
  ToolStatsSummary,
  TimeRange
} from '@shared/types/tool-stats'

/**
 * 工具统计 API 类型定义
 */
export interface ToolStatsApi {
  /** 获取所有工具统计概览 */
  getAll: (timeRange?: TimeRange) => Promise<ToolStatsSummary[]>
  /** 获取单个工具的详细统计 */
  getByTool: (toolName: string, timeRange?: TimeRange) => Promise<ToolStatsSummary | null>
  /** 获取指定会话内的工具调用记录 */
  getBySession: (sessionId: string) => Promise<ToolCallRecord[]>
  /** 获取使用频率最高的工具排行 */
  getTopTools: (limit?: number) => Promise<ToolStatsSummary[]>
  /** 获取响应耗时最长的工具排行 */
  getSlowestTools: (limit?: number) => Promise<ToolStatsSummary[]>
  /** 清除所有历史统计数据 */
  clear: () => Promise<{ success: boolean }>
  /** 按类别获取工具统计 */
  getByCategory: (category: ToolStatsCategory, timeRange?: TimeRange) => Promise<ToolStatsSummary[]>
}
