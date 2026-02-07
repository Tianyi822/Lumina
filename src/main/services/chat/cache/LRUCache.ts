// LRU (Least Recently Used) 缓存实现，提供 O(1) 的 get/set 操作和自动驱逐策略

interface LRUCacheEntry<V> {
  value: V
  timestamp: number
  expiresAt?: number
}

export interface LRUCacheOptions {
  // 最大缓存条目数
  maxSize: number
  // 过期时间（毫秒），可选
  ttl?: number
}

export interface LRUCacheStats {
  // 当前缓存大小
  size: number
  // 最大缓存大小
  maxSize: number
  // 缓存命中次数
  hits: number
  // 缓存未命中次数
  misses: number
  // 命中率 (0-1)
  hitRate: number
  // 过期条目数
  expired: number
  // 驱逐条目数
  evicted: number
}

// LRU 缓存类
export class LRUCache<K, V> {
  private cache: Map<K, LRUCacheEntry<V>>
  private accessOrder: K[]
  private stats: LRUCacheStats

  constructor(private options: LRUCacheOptions) {
    this.cache = new Map()
    this.accessOrder = []
    this.stats = {
      size: 0,
      maxSize: options.maxSize,
      hits: 0,
      misses: 0,
      hitRate: 0,
      expired: 0,
      evicted: 0
    }
  }

  // 获取缓存值
  get(key: K): V | undefined {
    const entry = this.cache.get(key)

    // 缓存未命中
    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return undefined
    }

    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
      this.stats.size--
      this.stats.expired++
      this.stats.misses++
      this.updateHitRate()
      return undefined
    }

    // 缓存命中，更新访问顺序
    this.updateAccessOrder(key)
    this.stats.hits++
    this.updateHitRate()
    return entry.value
  }

  // 设置缓存值
  set(key: K, value: V): void {
    // 检查是否需要驱逐
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed()
    }

    const entry: LRUCacheEntry<V> = {
      value,
      timestamp: Date.now()
    }

    // 设置过期时间
    if (this.options.ttl) {
      entry.expiresAt = Date.now() + this.options.ttl
    }

    this.cache.set(key, entry)
    this.updateAccessOrder(key)
    this.stats.size = this.cache.size
  }

  // 检查键是否存在且未过期
  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key)
      return false
    }

    return true
  }

  // 删除缓存条目
  delete(key: K): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
      this.stats.size = this.cache.size
    }
    return deleted
  }

  // 清空所有缓存
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.stats.size = 0
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.hitRate = 0
    this.stats.expired = 0
    this.stats.evicted = 0
  }

  // 获取所有键
  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  // 获取所有值
  values(): V[] {
    return Array.from(this.cache.values()).map((entry) => entry.value)
  }

  // 获取缓存统计信息
  getStats(): LRUCacheStats {
    return { ...this.stats }
  }

  // 重置统计信息
  resetStats(): void {
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.hitRate = 0
    this.stats.expired = 0
    this.stats.evicted = 0
  }

  // 清理过期条目
  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  // 驱逐最少使用的缓存条目
  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length === 0) return

    const lruKey = this.accessOrder[0]
    this.delete(lruKey)
    this.stats.evicted++
  }

  // 更新访问顺序
  private updateAccessOrder(key: K): void {
    // 移除旧位置
    this.accessOrder = this.accessOrder.filter((k) => k !== key)
    // 添加到末尾
    this.accessOrder.push(key)
  }

  // 更新命中率
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0
  }
}
