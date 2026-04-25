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
  /** 单个工具详细统计 */
  getByTool: (toolName: string, timeRange?: TimeRange) => Promise<ToolStatsSummary | null>
  /** 会话内工具调用记录 */
  getBySession: (sessionId: string) => Promise<ToolCallRecord[]>
  /** 使用频率排行 */
  getTopTools: (limit?: number) => Promise<ToolStatsSummary[]>
  /** 响应耗时排行 */
  getSlowestTools: (limit?: number) => Promise<ToolStatsSummary[]>
  /** 清除历史统计 */
  clear: () => Promise<{ success: boolean }>
  /** 按类别获取工具统计 */
  getByCategory: (category: ToolStatsCategory, timeRange?: TimeRange) => Promise<ToolStatsSummary[]>
}
