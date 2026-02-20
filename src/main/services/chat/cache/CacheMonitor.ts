/**
 * 缓存监控器
 * 通过 EventEmitter 实时推送缓存统计信息，避免与业务逻辑耦合
 */

import { EventEmitter } from 'events'
import type { LRUCache } from './LRUCache'
// CacheMetricsSnapshot type is available if needed for future extensions

/**
 * 缓存监控事件类型
 */
export enum CacheMonitorEvent {
  /** 缓存统计更新 */
  STATS_UPDATED = 'stats:updated',
  /** 缓存命中 */
  CACHE_HIT = 'cache:hit',
  /** 缓存未命中 */
  CACHE_MISS = 'cache:miss',
  /** 缓存已清空 */
  CACHE_CLEARED = 'cache:cleared',
  /** 缓存条目过期 */
  ENTRY_EXPIRED = 'entry:expired',
  /** 缓存条目被驱逐 */
  ENTRY_EVICTED = 'entry:evicted'
}

/**
 * 缓存级别类型
 */
export type CacheLevel = 'systemPrompt' | 'toolDescription' | 'exampleFormatting'

/**
 * 缓存命中事件数据
 */
export interface CacheHitEvent {
  level: CacheLevel
  key: string
  timestamp: number
}

/**
 * 缓存未命中事件数据
 */
export interface CacheMissEvent {
  level: CacheLevel
  key: string
  timestamp: number
}

/**
 * 缓存统计更新事件数据
 */
export interface StatsUpdatedEvent {
  timestamp: number
  systemPrompt: CacheLevelStats
  toolDescription: CacheLevelStats
  exampleFormatting: CacheLevelStats
  global: GlobalStats
}

/**
 * 缓存级别统计
 */
export interface CacheLevelStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: number
  expired: number
  evicted: number
  memoryUsage: number
}

/**
 * 全局缓存统计
 */
export interface GlobalStats {
  totalHits: number
  totalMisses: number
  totalHitRate: number
  totalSize: number
  totalMemoryUsage: number
  performanceScore: number
}

/**
 * 缓存监控配置
 */
export interface CacheMonitorConfig {
  /** 是否启用实时监控 */
  enabled: boolean
  /** 统计信息推送间隔（毫秒） */
  pushInterval: number
  /** 是否启用详细事件（hit/miss） */
  enableDetailedEvents: boolean
  /** 性能评分阈值，低于此值触发警告 */
  performanceThreshold: number
}

/**
 * 默认监控配置
 */
const DEFAULT_CONFIG: CacheMonitorConfig = {
  enabled: true,
  pushInterval: 5000, // 5秒
  enableDetailedEvents: false,
  performanceThreshold: 60
}

/**
 * 缓存监控器类
 * 单例模式，提供缓存统计的实时监控和事件推送
 */
export class CacheMonitor extends EventEmitter {
  private static instance: CacheMonitor | null = null
  private config: CacheMonitorConfig
  private systemPromptCache: LRUCache<string, string> | null = null
  private toolDescriptionCache: LRUCache<string, string> | null = null
  private exampleFormattingCache: LRUCache<string, string> | null = null
  private pushTimer: NodeJS.Timeout | null = null
  private lastSnapshot: StatsUpdatedEvent | null = null

  constructor(config?: Partial<CacheMonitorConfig>) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<CacheMonitorConfig>): CacheMonitor {
    if (!CacheMonitor.instance) {
      CacheMonitor.instance = new CacheMonitor(config)
    }
    return CacheMonitor.instance
  }

  /**
   * 重置单例（主要用于测试）
   */
  static resetInstance(): void {
    if (CacheMonitor.instance) {
      CacheMonitor.instance.destroy()
      CacheMonitor.instance = null
    }
  }

  /**
   * 注册缓存实例
   */
  registerCaches(
    systemPrompt: LRUCache<string, string>,
    toolDescription: LRUCache<string, string>,
    exampleFormatting: LRUCache<string, string>
  ): void {
    this.systemPromptCache = systemPrompt
    this.toolDescriptionCache = toolDescription
    this.exampleFormattingCache = exampleFormatting

    if (this.config.enabled) {
      this.startMonitoring()
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CacheMonitorConfig>): void {
    const wasEnabled = this.config.enabled
    this.config = { ...this.config, ...config }

    if (this.config.enabled && !wasEnabled) {
      this.startMonitoring()
    } else if (!this.config.enabled && wasEnabled) {
      this.stopMonitoring()
    }

    // 如果推送间隔改变，重启监控
    if (config.pushInterval !== undefined && this.config.enabled) {
      this.stopMonitoring()
      this.startMonitoring()
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): CacheMonitorConfig {
    return { ...this.config }
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    if (this.pushTimer) {
      return
    }

    this.pushTimer = setInterval(() => {
      this.pushStats()
    }, this.config.pushInterval)

    // 立即推送一次
    this.pushStats()
  }

  /**
   * 停止监控
   */
  private stopMonitoring(): void {
    if (this.pushTimer) {
      clearInterval(this.pushTimer)
      this.pushTimer = null
    }
  }

  /**
   * 推送统计信息
   */
  private pushStats(): void {
    if (!this.systemPromptCache || !this.toolDescriptionCache || !this.exampleFormattingCache) {
      return
    }

    const snapshot = this.captureSnapshot()

    // 检查性能评分是否低于阈值
    if (snapshot.global.performanceScore < this.config.performanceThreshold) {
      this.emit('performance:warning', {
        timestamp: Date.now(),
        score: snapshot.global.performanceScore,
        threshold: this.config.performanceThreshold
      })
    }

    // 只有当数据变化时才推送
    if (this.hasChanged(snapshot)) {
      this.lastSnapshot = snapshot
      this.emit(CacheMonitorEvent.STATS_UPDATED, snapshot)
    }
  }

  /**
   * 捕获当前统计快照
   */
  private captureSnapshot(): StatsUpdatedEvent {
    const sysStats = this.systemPromptCache!.getStats()
    const toolStats = this.toolDescriptionCache!.getStats()
    const exampleStats = this.exampleFormattingCache!.getStats()

    const totalHits = sysStats.hits + toolStats.hits + exampleStats.hits
    const totalMisses = sysStats.misses + toolStats.misses + exampleStats.misses
    const totalRequests = totalHits + totalMisses

    return {
      timestamp: Date.now(),
      systemPrompt: {
        size: sysStats.size,
        maxSize: sysStats.maxSize,
        hits: sysStats.hits,
        misses: sysStats.misses,
        hitRate: sysStats.hitRate,
        expired: sysStats.expired,
        evicted: sysStats.evicted,
        memoryUsage: this.estimateMemoryUsage(sysStats.size)
      },
      toolDescription: {
        size: toolStats.size,
        maxSize: toolStats.maxSize,
        hits: toolStats.hits,
        misses: toolStats.misses,
        hitRate: toolStats.hitRate,
        expired: toolStats.expired,
        evicted: toolStats.evicted,
        memoryUsage: this.estimateMemoryUsage(toolStats.size)
      },
      exampleFormatting: {
        size: exampleStats.size,
        maxSize: exampleStats.maxSize,
        hits: exampleStats.hits,
        misses: exampleStats.misses,
        hitRate: exampleStats.hitRate,
        expired: exampleStats.expired,
        evicted: exampleStats.evicted,
        memoryUsage: this.estimateMemoryUsage(exampleStats.size)
      },
      global: {
        totalHits,
        totalMisses,
        totalHitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
        totalSize: sysStats.size + toolStats.size + exampleStats.size,
        totalMemoryUsage:
          this.estimateMemoryUsage(sysStats.size) +
          this.estimateMemoryUsage(toolStats.size) +
          this.estimateMemoryUsage(exampleStats.size),
        performanceScore: this.calculatePerformanceScore(totalHits, totalMisses, totalRequests)
      }
    }
  }

  /**
   * 检查统计是否变化
   */
  private hasChanged(snapshot: StatsUpdatedEvent): boolean {
    if (!this.lastSnapshot) {
      return true
    }

    return (
      snapshot.systemPrompt.hits !== this.lastSnapshot.systemPrompt.hits ||
      snapshot.systemPrompt.misses !== this.lastSnapshot.systemPrompt.misses ||
      snapshot.toolDescription.hits !== this.lastSnapshot.toolDescription.hits ||
      snapshot.toolDescription.misses !== this.lastSnapshot.toolDescription.misses ||
      snapshot.exampleFormatting.hits !== this.lastSnapshot.exampleFormatting.hits ||
      snapshot.exampleFormatting.misses !== this.lastSnapshot.exampleFormatting.misses
    )
  }

  /**
   * 估算内存使用
   */
  private estimateMemoryUsage(size: number): number {
    const avgEntrySize = 2 * 1024 // 2KB per entry
    return size * avgEntrySize + size * 100 // 额外开销
  }

  /**
   * 计算性能评分
   */
  private calculatePerformanceScore(
    totalHits: number,
    _totalMisses: number,
    totalRequests: number
  ): number {
    if (totalRequests === 0) return 0

    // 命中率权重 60%
    const hitRateScore = (totalHits / totalRequests) * 60

    // 缓存利用率权重 20%
    const utilizationScore = totalRequests > 0 ? Math.min((totalRequests / 100) * 20, 20) : 0

    // 内存效率权重 20%
    const memoryScore = Math.max(0, 20 - (totalRequests / (1024 * 1024)) * 20)

    return hitRateScore + utilizationScore + memoryScore
  }

  /**
   * 记录缓存命中
   */
  recordHit(level: CacheLevel, key: string): void {
    if (!this.config.enableDetailedEvents) return

    this.emit(CacheMonitorEvent.CACHE_HIT, {
      level,
      key,
      timestamp: Date.now()
    })
  }

  /**
   * 记录缓存未命中
   */
  recordMiss(level: CacheLevel, key: string): void {
    if (!this.config.enableDetailedEvents) return

    this.emit(CacheMonitorEvent.CACHE_MISS, {
      level,
      key,
      timestamp: Date.now()
    })
  }

  /**
   * 记录缓存清空
   */
  recordClear(level?: CacheLevel): void {
    this.emit(CacheMonitorEvent.CACHE_CLEARED, {
      level,
      timestamp: Date.now()
    })
  }

  /**
   * 记录条目过期
   */
  recordExpired(level: CacheLevel, key: string): void {
    if (!this.config.enableDetailedEvents) return

    this.emit(CacheMonitorEvent.ENTRY_EXPIRED, {
      level,
      key,
      timestamp: Date.now()
    })
  }

  /**
   * 记录条目驱逐
   */
  recordEvicted(level: CacheLevel, key: string): void {
    if (!this.config.enableDetailedEvents) return

    this.emit(CacheMonitorEvent.ENTRY_EVICTED, {
      level,
      key,
      timestamp: Date.now()
    })
  }

  /**
   * 获取当前统计快照
   */
  getCurrentStats(): StatsUpdatedEvent | null {
    if (!this.systemPromptCache || !this.toolDescriptionCache || !this.exampleFormattingCache) {
      return null
    }
    return this.captureSnapshot()
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stopMonitoring()
    this.removeAllListeners()
    this.systemPromptCache = null
    this.toolDescriptionCache = null
    this.exampleFormattingCache = null
    this.lastSnapshot = null
  }
}

// 导出默认实例
export const cacheMonitor = CacheMonitor.getInstance()
