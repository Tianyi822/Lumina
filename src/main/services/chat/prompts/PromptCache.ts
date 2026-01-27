/**
 * 多级提示词缓存管理器
 * 提供三级缓存以最大化命中率
 */

import { LRUCache, type LRUCacheOptions } from '../cache/LRUCache'
import { CacheKeyGenerator, CacheKeyType } from '../cache/CacheKey'
import { CacheMetricsTracker } from '../cache/CacheMetrics'
import type { MCPToolReference } from '@main/types/chat'

/**
 * 缓存配置
 */
export interface PromptCacheConfig {
  /** 是否启用缓存 */
  enabled: boolean
  /** 系统提示词缓存大小 */
  systemPromptMaxSize: number
  /** 系统提示词缓存 TTL（小时） */
  systemPromptTTL: number
  /** 工具描述缓存大小 */
  toolDescriptionMaxSize: number
  /** 工具描述缓存 TTL（小时） */
  toolDescriptionTTL: number
  /** 示例格式化缓存大小 */
  exampleFormattingMaxSize: number
  /** 示例格式化缓存 TTL（小时） */
  exampleFormattingTTL: number
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_CONFIG: PromptCacheConfig = {
  enabled: true,
  systemPromptMaxSize: 50,
  systemPromptTTL: 24,
  toolDescriptionMaxSize: 200,
  toolDescriptionTTL: 12,
  exampleFormattingMaxSize: 500,
  exampleFormattingTTL: 1
}

/**
 * 提示词缓存管理器
 */
export class PromptCache {
  private systemPromptCache: LRUCache<string, string>
  private toolDescriptionCache: LRUCache<string, string>
  private exampleFormattingCache: LRUCache<string, string>
  private metrics: CacheMetricsTracker
  private config: PromptCacheConfig

  constructor(config?: Partial<PromptCacheConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }

    // 创建三级缓存
    const systemPromptOptions: LRUCacheOptions = {
      maxSize: this.config.systemPromptMaxSize,
      ttl: this.config.systemPromptTTL * 60 * 60 * 1000 // 转换为毫秒
    }

    const toolDescriptionOptions: LRUCacheOptions = {
      maxSize: this.config.toolDescriptionMaxSize,
      ttl: this.config.toolDescriptionTTL * 60 * 60 * 1000
    }

    const exampleFormattingOptions: LRUCacheOptions = {
      maxSize: this.config.exampleFormattingMaxSize,
      ttl: this.config.exampleFormattingTTL * 60 * 60 * 1000
    }

    this.systemPromptCache = new LRUCache<string, string>(systemPromptOptions)
    this.toolDescriptionCache = new LRUCache<string, string>(toolDescriptionOptions)
    this.exampleFormattingCache = new LRUCache<string, string>(exampleFormattingOptions)

    this.metrics = new CacheMetricsTracker()

    // 启动定期清理任务
    this.startCleanupTask()
  }

  /**
   * 获取系统提示词（带缓存）
   */
  getSystemPrompt(
    promptConfig: Record<string, unknown>,
    tools: MCPToolReference[],
    exampleIds: string[],
    builder: () => string
  ): string {
    if (!this.config.enabled) {
      return builder()
    }

    const key = CacheKeyGenerator.generate(CacheKeyType.SystemPrompt, {
      promptConfig,
      tools,
      exampleIds
    })

    // 尝试从缓存获取
    const cached = this.systemPromptCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    // 构建新提示词
    const prompt = builder()

    // 存入缓存
    this.systemPromptCache.set(key, prompt)
    this.captureMetrics()

    return prompt
  }

  /**
   * 获取工具描述（带缓存）
   */
  getToolDescription(
    tool: MCPToolReference,
    descriptionLevel: string,
    builder: () => string
  ): string {
    if (!this.config.enabled) {
      return builder()
    }

    const key = CacheKeyGenerator.generate(CacheKeyType.ToolDescription, {
      tools: [tool],
      toolDescriptionLevel: descriptionLevel
    })

    // 尝试从缓存获取
    const cached = this.toolDescriptionCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    // 构建新描述
    const description = builder()

    // 存入缓存
    this.toolDescriptionCache.set(key, description)
    this.captureMetrics()

    return description
  }

  /**
   * 获取示例格式化（带缓存）
   */
  getExampleFormatting(
    example: {
      userQuery: string
      thought: string
      finalAnswer: string
    },
    builder: () => string
  ): string {
    if (!this.config.enabled) {
      return builder()
    }

    const key = CacheKeyGenerator.generate(CacheKeyType.ExampleFormatting, {
      example
    })

    // 尝试从缓存获取
    const cached = this.exampleFormattingCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    // 格式化示例
    const formatted = builder()

    // 存入缓存
    this.exampleFormattingCache.set(key, formatted)
    this.captureMetrics()

    return formatted
  }

  /**
   * 失效配置相关缓存
   */
  invalidateConfig(): void {
    this.systemPromptCache.clear()
    this.captureMetrics()
  }

  /**
   * 失效工具相关缓存
   */
  invalidateTools(): void {
    this.systemPromptCache.clear()
    this.toolDescriptionCache.clear()
    this.captureMetrics()
  }

  /**
   * 失效示例相关缓存
   */
  invalidateExamples(): void {
    this.systemPromptCache.clear()
    this.exampleFormattingCache.clear()
    this.captureMetrics()
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.systemPromptCache.clear()
    this.toolDescriptionCache.clear()
    this.exampleFormattingCache.clear()
    this.captureMetrics()
  }

  /**
   * 更新缓存配置
   */
  updateConfig(config: Partial<PromptCacheConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }

    // 如果关键配置改变，需要重建缓存
    if (
      config.systemPromptMaxSize !== undefined &&
      config.systemPromptMaxSize !== oldConfig.systemPromptMaxSize
    ) {
      this.rebuildSystemPromptCache()
    }

    if (
      config.toolDescriptionMaxSize !== undefined &&
      config.toolDescriptionMaxSize !== oldConfig.toolDescriptionMaxSize
    ) {
      this.rebuildToolDescriptionCache()
    }

    if (
      config.exampleFormattingMaxSize !== undefined &&
      config.exampleFormattingMaxSize !== oldConfig.exampleFormattingMaxSize
    ) {
      this.rebuildExampleFormattingCache()
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    systemPrompt: ReturnType<LRUCache<string, string>['getStats']>
    toolDescription: ReturnType<LRUCache<string, string>['getStats']>
    exampleFormatting: ReturnType<LRUCache<string, string>['getStats']>
  } {
    return {
      systemPrompt: this.systemPromptCache.getStats(),
      toolDescription: this.toolDescriptionCache.getStats(),
      exampleFormatting: this.exampleFormattingCache.getStats()
    }
  }

  /**
   * 获取性能指标快照
   */
  getMetricsSnapshot(): ReturnType<CacheMetricsTracker['capture']> {
    return this.metrics.capture(
      this.systemPromptCache,
      this.toolDescriptionCache,
      this.exampleFormattingCache
    )
  }

  /**
   * 生成性能报告
   */
  generateReport(): string {
    return this.metrics.generateReport()
  }

  /**
   * 清理过期条目
   */
  cleanup(): {
    systemPrompt: number
    toolDescription: number
    exampleFormatting: number
  } {
    return {
      systemPrompt: this.systemPromptCache.cleanup(),
      toolDescription: this.toolDescriptionCache.cleanup(),
      exampleFormatting: this.exampleFormattingCache.cleanup()
    }
  }

  /**
   * 重建系统提示词缓存
   */
  private rebuildSystemPromptCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.systemPromptMaxSize,
      ttl: this.config.systemPromptTTL * 60 * 60 * 1000
    }

    const oldCache = this.systemPromptCache
    this.systemPromptCache = new LRUCache<string, string>(options)

    // 迁移有效条目
    for (const key of oldCache.keys()) {
      const value = oldCache.get(key)
      if (value !== undefined) {
        this.systemPromptCache.set(key, value)
      }
    }

    this.captureMetrics()
  }

  /**
   * 重建工具描述缓存
   */
  private rebuildToolDescriptionCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.toolDescriptionMaxSize,
      ttl: this.config.toolDescriptionTTL * 60 * 60 * 1000
    }

    const oldCache = this.toolDescriptionCache
    this.toolDescriptionCache = new LRUCache<string, string>(options)

    // 迁移有效条目
    for (const key of oldCache.keys()) {
      const value = oldCache.get(key)
      if (value !== undefined) {
        this.toolDescriptionCache.set(key, value)
      }
    }

    this.captureMetrics()
  }

  /**
   * 重建示例格式化缓存
   */
  private rebuildExampleFormattingCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.exampleFormattingMaxSize,
      ttl: this.config.exampleFormattingTTL * 60 * 60 * 1000
    }

    const oldCache = this.exampleFormattingCache
    this.exampleFormattingCache = new LRUCache<string, string>(options)

    // 迁移有效条目
    for (const key of oldCache.keys()) {
      const value = oldCache.get(key)
      if (value !== undefined) {
        this.exampleFormattingCache.set(key, value)
      }
    }

    this.captureMetrics()
  }

  /**
   * 捕获性能指标
   */
  private captureMetrics(): void {
    this.metrics.capture(
      this.systemPromptCache,
      this.toolDescriptionCache,
      this.exampleFormattingCache
    )
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    // 每小时清理一次过期条目
    const intervalMs = 60 * 60 * 1000

    setInterval(() => {
      this.cleanup()
    }, intervalMs)
  }
}
