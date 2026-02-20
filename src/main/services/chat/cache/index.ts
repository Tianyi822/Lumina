/**
 * 缓存模块导出
 * 提供 LRU 缓存、缓存键生成、缓存指标追踪和缓存监控功能
 */

// LRU 缓存
export { LRUCache, type LRUCacheOptions, type LRUCacheStats } from './LRUCache'

// 缓存键生成
export { CacheKeyGenerator, CacheKeyType, type CacheKeyOptions } from './CacheKey'

// 缓存指标追踪
export {
  CacheMetricsTracker,
  type CacheMetricsSnapshot,
  type CacheLevelMetrics,
  type GlobalCacheMetrics
} from './CacheMetrics'

// 缓存监控器
export {
  CacheMonitor,
  cacheMonitor,
  CacheMonitorEvent,
  type CacheMonitorConfig,
  type CacheLevel,
  type CacheLevelStats,
  type GlobalStats,
  type StatsUpdatedEvent,
  type CacheHitEvent,
  type CacheMissEvent
} from './CacheMonitor'
