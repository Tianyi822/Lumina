/**
 * 提示词效果监控收集器
 * 负责收集和存储提示词效果指标数据
 */

import { EventEmitter } from 'events'
import { logger } from '../../logger'
import { configManager } from '../../config'

/**
 * 提示词效果指标
 */
export interface PromptEffectivenessMetrics {
  /** 提示词版本 */
  version: string
  /** 统计周期 */
  period: { start: string; end: string }
  /** 工具调用成功率 (0-1) */
  toolCallSuccessRate: number
  /** 平均每会话工具调用数 */
  avgToolCallsPerSession: number
  /** Token 效率 (输出/输入比) */
  tokenEfficiency: number
  /** 平均响应时间 (毫秒) */
  avgResponseTime: number
  /** 用户满意度 (0-1, 可选) */
  userSatisfactionScore?: number
  /** 总样本数 */
  sampleCount: number
}

/**
 * 单次会话的指标数据点
 */
export interface SessionMetricsData {
  /** 会话 ID */
  sessionId: string
  /** 提示词版本 */
  promptVersion: string
  /** 模型名称 */
  modelName: string
  /** 时间戳 */
  timestamp: number
  /** 工具调用统计 */
  toolCalls: {
    total: number
    successful: number
    failed: number
  }
  /** Token 使用统计 */
  tokenUsage: {
    prompt: number
    completion: number
    total: number
  }
  /** 响应时间 (毫秒) */
  responseTime: number
  /** 是否使用 ReAct 模式 */
  isReActMode: boolean
  /** 用户反馈分数 (可选, 1-5) */
  userFeedback?: number
}

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  /** 时间戳 */
  timestamp: number
  /** 日期字符串 (YYYY-MM-DD) */
  date: string
  /** 指标值 */
  value: number
  /** 样本数 */
  sampleCount: number
}

/**
 * 提示词效果监控收集器类
 */
export class PromptMetricsCollector extends EventEmitter {
  private sessionData: Map<string, SessionMetricsData> = new Map()
  private dailyStats: Map<string, Map<string, DailyStats>> = new Map()
  private currentVersion: string = 'default'
  private maxStoredSessions: number = 1000

  constructor() {
    super()
    this.loadCurrentVersion()
  }

  /**
   * 加载当前提示词版本
   */
  private loadCurrentVersion(): void {
    try {
      const config = configManager.getConfig()
      // 使用模板版本或默认版本
      this.currentVersion = config?.promptConfig?.enableEnhancedPrompt ? 'enhanced' : 'default'
    } catch (error) {
      logger.warn('加载提示词版本失败', 'main', { error })
    }
  }

  /**
   * 更新当前提示词版本
   */
  updateVersion(version: string): void {
    this.currentVersion = version
    logger.info('提示词版本已更新', 'main', { version })
  }

  /**
   * 记录会话开始
   */
  recordSessionStart(sessionId: string, modelName: string, isReActMode: boolean): void {
    const data: SessionMetricsData = {
      sessionId,
      promptVersion: this.currentVersion,
      modelName,
      timestamp: Date.now(),
      toolCalls: { total: 0, successful: 0, failed: 0 },
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      responseTime: 0,
      isReActMode
    }

    this.sessionData.set(sessionId, data)

    // 清理旧数据
    this.cleanupOldSessions()
  }

  /**
   * 记录工具调用结果
   */
  recordToolCall(sessionId: string, success: boolean): void {
    const data = this.sessionData.get(sessionId)
    if (!data) return

    data.toolCalls.total++
    if (success) {
      data.toolCalls.successful++
    } else {
      data.toolCalls.failed++
    }
  }

  /**
   * 记录 Token 使用情况
   */
  recordTokenUsage(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number
  ): void {
    const data = this.sessionData.get(sessionId)
    if (!data) return

    data.tokenUsage.prompt += promptTokens
    data.tokenUsage.completion += completionTokens
    data.tokenUsage.total += totalTokens
  }

  /**
   * 记录会话完成
   */
  recordSessionComplete(sessionId: string): void {
    const data = this.sessionData.get(sessionId)
    if (!data) return

    data.responseTime = Date.now() - data.timestamp

    // 保存到每日统计
    this.saveToDailyStats(data)

    // 触发事件
    this.emit('sessionComplete', data)

    // 从活跃会话中移除
    this.sessionData.delete(sessionId)
  }

  /**
   * 记录用户反馈
   */
  recordUserFeedback(sessionId: string, feedback: number): void {
    const data = this.sessionData.get(sessionId)
    if (!data) return

    data.userFeedback = feedback
  }

  /**
   * 获取当前指标
   */
  getCurrentMetrics(): PromptEffectivenessMetrics {
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    return this.calculateMetricsForPeriod(oneDayAgo, now, this.currentVersion)
  }

  /**
   * 获取指定版本的指标
   */
  getMetricsByVersion(version: string): PromptEffectivenessMetrics {
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    return this.calculateMetricsForPeriod(sevenDaysAgo, now, version)
  }

  /**
   * 获取趋势数据
   */
  getTrendData(
    metricType: 'toolCallSuccessRate' | 'tokenEfficiency' | 'avgResponseTime',
    days: number = 7,
    version?: string
  ): TrendDataPoint[] {
    const result: TrendDataPoint[] = []
    const now = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = this.formatDate(date)

      const dayStats = this.getDailyStats(dateStr, version)
      if (dayStats) {
        let value: number
        switch (metricType) {
          case 'toolCallSuccessRate':
            value = dayStats.toolCalls.total > 0
              ? dayStats.toolCalls.successful / dayStats.toolCalls.total
              : 0
            break
          case 'tokenEfficiency':
            value = dayStats.tokenUsage.prompt > 0
              ? dayStats.tokenUsage.completion / dayStats.tokenUsage.prompt
              : 0
            break
          case 'avgResponseTime':
            value = dayStats.sessionCount > 0
              ? dayStats.totalResponseTime / dayStats.sessionCount
              : 0
            break
          default:
            value = 0
        }

        result.push({
          timestamp: date.getTime(),
          date: dateStr,
          value,
          sampleCount: dayStats.sessionCount
        })
      }
    }

    return result
  }

  /**
   * 导出报表数据
   */
  exportReport(startDate: string, endDate: string, version?: string): {
    summary: PromptEffectivenessMetrics
    dailyData: Array<{
      date: string
      toolCallSuccessRate: number
      avgToolCalls: number
      tokenEfficiency: number
      avgResponseTime: number
      sessionCount: number
    }>
  } {
    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime()

    const summary = this.calculateMetricsForPeriod(start, end, version)

    const dailyData: Array<{
      date: string
      toolCallSuccessRate: number
      avgToolCalls: number
      tokenEfficiency: number
      avgResponseTime: number
      sessionCount: number
    }> = []

    const currentDate = new Date(startDate)
    const endDateObj = new Date(endDate)

    while (currentDate <= endDateObj) {
      const dateStr = this.formatDate(currentDate)
      const stats = this.getDailyStats(dateStr, version)

      if (stats) {
        dailyData.push({
          date: dateStr,
          toolCallSuccessRate: stats.toolCalls.total > 0
            ? stats.toolCalls.successful / stats.toolCalls.total
            : 0,
          avgToolCalls: stats.sessionCount > 0
            ? stats.toolCalls.total / stats.sessionCount
            : 0,
          tokenEfficiency: stats.tokenUsage.prompt > 0
            ? stats.tokenUsage.completion / stats.tokenUsage.prompt
            : 0,
          avgResponseTime: stats.sessionCount > 0
            ? stats.totalResponseTime / stats.sessionCount
            : 0,
          sessionCount: stats.sessionCount
        })
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return { summary, dailyData }
  }

  /**
   * 计算指定时间段的指标
   */
  private calculateMetricsForPeriod(
    start: number,
    end: number,
    version?: string
  ): PromptEffectivenessMetrics {
    let totalToolCalls = 0
    let successfulToolCalls = 0
    let totalSessions = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    let totalResponseTime = 0
    let totalFeedback = 0
    let feedbackCount = 0

    // 遍历每日统计
    for (const [dateStr, versionMap] of this.dailyStats) {
      const date = new Date(dateStr).getTime()
      if (date < start || date > end) continue

      for (const [v, stats] of versionMap) {
        if (version && v !== version) continue

        totalToolCalls += stats.toolCalls.total
        successfulToolCalls += stats.toolCalls.successful
        totalSessions += stats.sessionCount
        totalPromptTokens += stats.tokenUsage.prompt
        totalCompletionTokens += stats.tokenUsage.completion
        totalResponseTime += stats.totalResponseTime
        totalFeedback += stats.totalFeedback
        feedbackCount += stats.feedbackCount
      }
    }

    return {
      version: version || this.currentVersion,
      period: {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString()
      },
      toolCallSuccessRate: totalToolCalls > 0 ? successfulToolCalls / totalToolCalls : 0,
      avgToolCallsPerSession: totalSessions > 0 ? totalToolCalls / totalSessions : 0,
      tokenEfficiency: totalPromptTokens > 0 ? totalCompletionTokens / totalPromptTokens : 0,
      avgResponseTime: totalSessions > 0 ? totalResponseTime / totalSessions : 0,
      userSatisfactionScore: feedbackCount > 0 ? totalFeedback / feedbackCount / 5 : undefined,
      sampleCount: totalSessions
    }
  }

  /**
   * 保存到每日统计
   */
  private saveToDailyStats(data: SessionMetricsData): void {
    const dateStr = this.formatDate(new Date(data.timestamp))

    if (!this.dailyStats.has(dateStr)) {
      this.dailyStats.set(dateStr, new Map())
    }

    const versionMap = this.dailyStats.get(dateStr)!

    if (!versionMap.has(data.promptVersion)) {
      versionMap.set(data.promptVersion, {
        toolCalls: { total: 0, successful: 0, failed: 0 },
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        sessionCount: 0,
        totalResponseTime: 0,
        totalFeedback: 0,
        feedbackCount: 0
      })
    }

    const stats = versionMap.get(data.promptVersion)!
    stats.toolCalls.total += data.toolCalls.total
    stats.toolCalls.successful += data.toolCalls.successful
    stats.toolCalls.failed += data.toolCalls.failed
    stats.tokenUsage.prompt += data.tokenUsage.prompt
    stats.tokenUsage.completion += data.tokenUsage.completion
    stats.tokenUsage.total += data.tokenUsage.total
    stats.sessionCount++
    stats.totalResponseTime += data.responseTime

    if (data.userFeedback !== undefined) {
      stats.totalFeedback += data.userFeedback
      stats.feedbackCount++
    }
  }

  /**
   * 获取每日统计
   */
  private getDailyStats(dateStr: string, version?: string): DailyStats | null {
    const versionMap = this.dailyStats.get(dateStr)
    if (!versionMap) return null

    if (version) {
      return versionMap.get(version) || null
    }

    // 合并所有版本
    const merged: DailyStats = {
      toolCalls: { total: 0, successful: 0, failed: 0 },
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      sessionCount: 0,
      totalResponseTime: 0,
      totalFeedback: 0,
      feedbackCount: 0
    }

    for (const stats of versionMap.values()) {
      merged.toolCalls.total += stats.toolCalls.total
      merged.toolCalls.successful += stats.toolCalls.successful
      merged.toolCalls.failed += stats.toolCalls.failed
      merged.tokenUsage.prompt += stats.tokenUsage.prompt
      merged.tokenUsage.completion += stats.tokenUsage.completion
      merged.tokenUsage.total += stats.tokenUsage.total
      merged.sessionCount += stats.sessionCount
      merged.totalResponseTime += stats.totalResponseTime
      merged.totalFeedback += stats.totalFeedback
      merged.feedbackCount += stats.feedbackCount
    }

    return merged
  }

  /**
   * 清理旧会话数据
   */
  private cleanupOldSessions(): void {
    if (this.sessionData.size <= this.maxStoredSessions) return

    const sortedSessions = Array.from(this.sessionData.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)

    const toRemove = sortedSessions.slice(0, sortedSessions.length - this.maxStoredSessions)
    for (const [sessionId] of toRemove) {
      this.sessionData.delete(sessionId)
    }
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  /**
   * 清空所有数据
   */
  clearAll(): void {
    this.sessionData.clear()
    this.dailyStats.clear()
    logger.info('提示词效果监控数据已清空', 'main')
  }
}

/**
 * 每日统计数据结构
 */
interface DailyStats {
  toolCalls: { total: number; successful: number; failed: number }
  tokenUsage: { prompt: number; completion: number; total: number }
  sessionCount: number
  totalResponseTime: number
  totalFeedback: number
  feedbackCount: number
}

// 导出单例实例
export const promptMetricsCollector = new PromptMetricsCollector()
