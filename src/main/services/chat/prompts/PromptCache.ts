/**
 * 提示词缓存管理器
 * 通过三级缓存减少重复构建提示词的开销
 */

import { LRUCache, type LRUCacheOptions } from '../cache/LRUCache'
import { CacheKeyGenerator, CacheKeyType } from '../cache/CacheKey'
import { CacheMetricsTracker } from '../cache/CacheMetrics'
import type { MCPToolReference } from '@main/types/chat'

/**
 * 缓存配置参数
 */
export interface PromptCacheConfig {
  /** 是否启用缓存功能 */
  enabled: boolean
  /** 系统提示词缓存的最大数量 */
  systemPromptMaxSize: number
  /** 系统提示词缓存的有效时间，单位小时 */
  systemPromptTTL: number
  /** 工具描述缓存的最大数量 */
  toolDescriptionMaxSize: number
  /** 工具描述缓存的有效时间，单位小时 */
  toolDescriptionTTL: number
  /** 示例格式化缓存的最大数量 */
  exampleFormattingMaxSize: number
  /** 示例格式化缓存的有效时间，单位小时 */
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
 * 使用三个独立的 LRU 缓存分别存储系统提示词、工具描述和示例格式化结果
 */
export class PromptCache {
  private systemPromptCache: LRUCache<string, string>
  private toolDescriptionCache: LRUCache<string, string>
  private exampleFormattingCache: LRUCache<string, string>
  private metrics: CacheMetricsTracker
  private config: PromptCacheConfig

  constructor(config?: Partial<PromptCacheConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }

    const systemPromptOptions: LRUCacheOptions = {
      maxSize: this.config.systemPromptMaxSize,
      ttl: this.config.systemPromptTTL * 60 * 60 * 1000
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

    this.startCleanupTask()
  }

  /**
   * 获取系统提示词
   * 先尝试从缓存获取，未命中则调用 builder 函数构建并缓存
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

    const cached = this.systemPromptCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    const prompt = builder()

    this.systemPromptCache.set(key, prompt)
    this.captureMetrics()

    return prompt
  }

  /**
   * 获取工具描述
   * 先尝试从缓存获取，未命中则调用 builder 函数构建并缓存
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

    const cached = this.toolDescriptionCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    const description = builder()

    this.toolDescriptionCache.set(key, description)
    this.captureMetrics()

    return description
  }

  /**
   * 获取示例格式化结果
   * 先尝试从缓存获取，未命中则调用 builder 函数构建并缓存
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

    const cached = this.exampleFormattingCache.get(key)
    if (cached !== undefined) {
      this.captureMetrics()
      return cached
    }

    const formatted = builder()

    this.exampleFormattingCache.set(key, formatted)
    this.captureMetrics()

    return formatted
  }

  /**
   * 清空与配置相关的所有缓存
   * 当配置发生变化时调用此方法
   */
  invalidateConfig(): void {
    this.systemPromptCache.clear()
    this.captureMetrics()
  }

  /**
   * 清空与工具相关的所有缓存
   * 当工具列表发生变化时调用此方法
   */
  invalidateTools(): void {
    this.systemPromptCache.clear()
    this.toolDescriptionCache.clear()
    this.captureMetrics()
  }

  /**
   * 清空与示例相关的所有缓存
   * 当示例列表发生变化时调用此方法
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
   * 如果改变了缓存大小配置，会重建对应的缓存以迁移已有数据
   */
  updateConfig(config: Partial<PromptCacheConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }

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
   * 获取所有缓存的统计信息
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
   * 获取当前的性能指标快照
   */
  getMetricsSnapshot(): ReturnType<CacheMetricsTracker['capture']> {
    return this.metrics.capture(
      this.systemPromptCache,
      this.toolDescriptionCache,
      this.exampleFormattingCache
    )
  }

  /**
   * 生成性能报告文本
   */
  generateReport(): string {
    return this.metrics.generateReport()
  }

  /**
   * 清理所有缓存中的过期条目
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
   * 在调整缓存大小时调用，保留有效条目
   */
  private rebuildSystemPromptCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.systemPromptMaxSize,
      ttl: this.config.systemPromptTTL * 60 * 60 * 1000
    }

    const oldCache = this.systemPromptCache
    this.systemPromptCache = new LRUCache<string, string>(options)

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
   * 在调整缓存大小时调用，保留有效条目
   */
  private rebuildToolDescriptionCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.toolDescriptionMaxSize,
      ttl: this.config.toolDescriptionTTL * 60 * 60 * 1000
    }

    const oldCache = this.toolDescriptionCache
    this.toolDescriptionCache = new LRUCache<string, string>(options)

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
   * 在调整缓存大小时调用，保留有效条目
   */
  private rebuildExampleFormattingCache(): void {
    const options: LRUCacheOptions = {
      maxSize: this.config.exampleFormattingMaxSize,
      ttl: this.config.exampleFormattingTTL * 60 * 60 * 1000
    }

    const oldCache = this.exampleFormattingCache
    this.exampleFormattingCache = new LRUCache<string, string>(options)

    for (const key of oldCache.keys()) {
      const value = oldCache.get(key)
      if (value !== undefined) {
        this.exampleFormattingCache.set(key, value)
      }
    }

    this.captureMetrics()
  }

  /**
   * 记录当前的性能指标
   */
  private captureMetrics(): void {
    this.metrics.capture(
      this.systemPromptCache,
      this.toolDescriptionCache,
      this.exampleFormattingCache
    )
  }

  /**
   * 启动定时清理任务
   * 每小时自动清理一次过期的缓存条目
   */
  private startCleanupTask(): void {
    const intervalMs = 60 * 60 * 1000

    setInterval(() => {
      this.cleanup()
    }, intervalMs)
  }
}
