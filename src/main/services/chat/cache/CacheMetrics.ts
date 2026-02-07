// 缓存性能指标追踪，提供详细的缓存使用统计和性能分析

import type { LRUCache } from './LRUCache'

export interface CacheMetricsSnapshot {
  // 快照时间戳
  timestamp: number
  // 系统提示词缓存统计
  systemPrompt: CacheLevelMetrics
  // 工具描述缓存统计
  toolDescription: CacheLevelMetrics
  // 示例格式化缓存统计
  exampleFormatting: CacheLevelMetrics
  // 全局统计
  global: GlobalCacheMetrics
}

export interface CacheLevelMetrics {
  // 缓存大小
  size: number
  // 最大缓存大小
  maxSize: number
  // 命中次数
  hits: number
  // 未命中次数
  misses: number
  // 命中率 (0-1)
  hitRate: number
  // 过期条目数
  expired: number
  // 驱逐条目数
  evicted: number
  // 内存使用估算（字节）
  memoryUsage: number
}

export interface GlobalCacheMetrics {
  // 总命中次数
  totalHits: number
  // 总未命中次数
  totalMisses: number
  // 总命中率 (0-1)
  totalHitRate: number
  // 总缓存大小
  totalSize: number
  // 总内存使用（字节）
  totalMemoryUsage: number
  // 缓存性能评分 (0-100)
  performanceScore: number
}

// 缓存指标追踪器
export class CacheMetricsTracker {
  private snapshots: CacheMetricsSnapshot[] = []
  private maxSnapshots: number

  constructor(maxSnapshots: number = 100) {
    this.maxSnapshots = maxSnapshots
  }

  // 创建指标快照
  capture(
    systemPrompt: LRUCache<string, string>,
    toolDescription: LRUCache<string, string>,
    exampleFormatting: LRUCache<string, string>
  ): CacheMetricsSnapshot {
    const snapshot: CacheMetricsSnapshot = {
      timestamp: Date.now(),
      systemPrompt: this.extractMetrics(systemPrompt),
      toolDescription: this.extractMetrics(toolDescription),
      exampleFormatting: this.extractMetrics(exampleFormatting),
      global: this.calculateGlobalMetrics(systemPrompt, toolDescription, exampleFormatting)
    }

    // 保存快照
    this.snapshots.push(snapshot)
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift()
    }

    return snapshot
  }

  // 获取最新快照
  getLatest(): CacheMetricsSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null
  }

  // 获取所有快照
  getAllSnapshots(): CacheMetricsSnapshot[] {
    return [...this.snapshots]
  }

  // 清除所有快照
  clear(): void {
    this.snapshots = []
  }

  // 计算时间范围内的平均命中率
  getAverageHitRate(durationMs: number): number {
    const now = Date.now()
    const relevantSnapshots = this.snapshots.filter((s) => now - s.timestamp <= durationMs)

    if (relevantSnapshots.length === 0) return 0

    const totalHitRate = relevantSnapshots.reduce((sum, s) => sum + s.global.totalHitRate, 0)

    return totalHitRate / relevantSnapshots.length
  }

  // 生成性能报告
  generateReport(): string {
    const latest = this.getLatest()
    if (!latest) return '无可用数据'

    const lines: string[] = []
    lines.push('=== 缓存性能报告 ===')
    lines.push(`快照时间: ${new Date(latest.timestamp).toLocaleString()}`)
    lines.push('')

    // 全局统计
    lines.push('全局统计:')
    lines.push(`  总命中次数: ${latest.global.totalHits}`)
    lines.push(`  总未命中次数: ${latest.global.totalMisses}`)
    lines.push(`  总命中率: ${(latest.global.totalHitRate * 100).toFixed(2)}%`)
    lines.push(`  总缓存大小: ${latest.global.totalSize}`)
    lines.push(`  总内存使用: ${this.formatBytes(latest.global.totalMemoryUsage)}`)
    lines.push(`  性能评分: ${latest.global.performanceScore.toFixed(2)}/100`)
    lines.push('')

    // 各级缓存统计
    lines.push('系统提示词缓存:')
    this.formatLevelMetrics(lines, latest.systemPrompt, 2)
    lines.push('')

    lines.push('工具描述缓存:')
    this.formatLevelMetrics(lines, latest.toolDescription, 2)
    lines.push('')

    lines.push('示例格式化缓存:')
    this.formatLevelMetrics(lines, latest.exampleFormatting, 2)

    return lines.join('\n')
  }

  // 提取缓存级别指标
  private extractMetrics(cache: LRUCache<string, string>): CacheLevelMetrics {
    const stats = cache.getStats
      ? cache.getStats()
      : {
          size: 0,
          maxSize: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          expired: 0,
          evicted: 0
        }

    return {
      size: stats.size,
      maxSize: stats.maxSize,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
      expired: stats.expired,
      evicted: stats.evicted,
      memoryUsage: this.estimateMemoryUsage(stats.size)
    }
  }

  // 计算全局指标
  private calculateGlobalMetrics(
    systemPrompt: LRUCache<string, string>,
    toolDescription: LRUCache<string, string>,
    exampleFormatting: LRUCache<string, string>
  ): GlobalCacheMetrics {
    const sysMetrics = this.extractMetrics(systemPrompt)
    const toolMetrics = this.extractMetrics(toolDescription)
    const exampleMetrics = this.extractMetrics(exampleFormatting)

    const totalHits = sysMetrics.hits + toolMetrics.hits + exampleMetrics.hits
    const totalMisses = sysMetrics.misses + toolMetrics.misses + exampleMetrics.misses
    const totalRequests = totalHits + totalMisses

    return {
      totalHits,
      totalMisses,
      totalHitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      totalSize: sysMetrics.size + toolMetrics.size + exampleMetrics.size,
      totalMemoryUsage:
        sysMetrics.memoryUsage + toolMetrics.memoryUsage + exampleMetrics.memoryUsage,
      performanceScore: this.calculatePerformanceScore({
        totalHits,
        totalMisses,
        totalSize: sysMetrics.size + toolMetrics.size + exampleMetrics.size,
        totalMemoryUsage:
          sysMetrics.memoryUsage + toolMetrics.memoryUsage + exampleMetrics.memoryUsage
      })
    }
  }

  // 计算性能评分 (0-100)
  private calculatePerformanceScore(metrics: {
    totalHits: number
    totalMisses: number
    totalSize: number
    totalMemoryUsage: number
  }): number {
    const totalRequests = metrics.totalHits + metrics.totalMisses
    if (totalRequests === 0) return 0

    // 命中率权重 60%
    const hitRateScore = (metrics.totalHits / totalRequests) * 60

    // 缓存利用率权重 20% (理想值: 50-80%)
    const utilizationScore =
      metrics.totalSize > 0 ? Math.min((metrics.totalSize / 100) * 20, 20) : 0

    // 内存效率权重 20% (假设 1MB 为理想值)
    const memoryScore = Math.max(0, 20 - (metrics.totalMemoryUsage / (1024 * 1024)) * 20)

    return hitRateScore + utilizationScore + memoryScore
  }

  // 估算内存使用
  private estimateMemoryUsage(size: number): number {
    // 假设每个缓存条目平均 2KB
    const avgEntrySize = 2 * 1024
    const usage = size * avgEntrySize

    // 加上 Map 和其他结构开销
    return usage + size * 100 // 每个条目额外 100 字节开销
  }

  // 格式化缓存级别指标
  private formatLevelMetrics(lines: string[], metrics: CacheLevelMetrics, indent: number): void {
    const prefix = ' '.repeat(indent)
    lines.push(`${prefix}缓存大小: ${metrics.size}/${metrics.maxSize}`)
    lines.push(`${prefix}命中次数: ${metrics.hits}`)
    lines.push(`${prefix}未命中次数: ${metrics.misses}`)
    lines.push(`${prefix}命中率: ${(metrics.hitRate * 100).toFixed(2)}%`)
    lines.push(`${prefix}过期条目: ${metrics.expired}`)
    lines.push(`${prefix}驱逐条目: ${metrics.evicted}`)
    lines.push(`${prefix}内存使用: ${this.formatBytes(metrics.memoryUsage)}`)
  }

  // 格式化字节数
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))

    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
  }
}
