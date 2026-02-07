// 示例管理器，负责示例的选择、更新和管理

import type { MCPToolReference } from '@main/types/chat'
import type { FewShotExample, EnhancedFewShotExample, ExampleSelectionCriteria } from './types'
import type { SessionData } from '@shared/types/session'
import { ExampleExtractor } from '../ExampleExtractor'
import { ExampleScorer } from '../ExampleScorer'
import { ExampleRepository } from '../ExampleRepository'
import { getFewShotExamples } from './toolExamples'
import { logger } from '../../logger'
import { sessionService } from '../../session'

// 示例管理器
export class ExampleManager {
  private extractor: ExampleExtractor
  private scorer: ExampleScorer
  private repository: ExampleRepository
  private initialized: boolean = false

  constructor() {
    this.extractor = new ExampleExtractor()
    this.scorer = new ExampleScorer()
    this.repository = new ExampleRepository()
  }

  // 初始化管理器
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.repository.initialize()
    this.initialized = true
    logger.info('示例管理器初始化成功', 'main')
  }

  // 选择示例（基于可用工具）
  async selectExamples(
    availableTools: MCPToolReference[],
    criteria: ExampleSelectionCriteria
  ): Promise<FewShotExample[]> {
    await this.ensureInitialized()

    const selected: FewShotExample[] = []
    const availableToolNames = availableTools.map((t) => `${t.serverName}__${t.toolName}`)

    // 1. 选择静态示例
    if (criteria.includeStatic) {
      const staticExamples = this.selectStaticExamples(criteria, availableToolNames)
      selected.push(...staticExamples)
    }

    // 2. 选择动态示例
    if (criteria.includeDynamic) {
      const dynamicExamples = await this.selectDynamicExamples(criteria, availableToolNames)
      selected.push(...dynamicExamples)
    }

    // 3. 应用最小质量分数过滤
    const filtered = selected.filter((ex) => {
      const enhanced = ex as EnhancedFewShotExample
      if (enhanced.qualityScore !== undefined) {
        return enhanced.qualityScore >= criteria.minQualityScore
      }
      return true
    })

    // 4. 限制数量
    return filtered.slice(0, criteria.maxCount)
  }

  // 提取并保存新示例
  async extractAndSave(sessionIds?: string[]): Promise<{
    extracted: number
    saved: number
    errors: string[]
  }> {
    await this.ensureInitialized()

    try {
      // 1. 获取会话列表
      const sessions = sessionIds ? await this.getSessionsByIds(sessionIds) : this.listAllSessions()

      if (!sessions || sessions.length === 0) {
        return { extracted: 0, saved: 0, errors: ['没有可用的会话'] }
      }

      // 2. 提取示例
      const result = this.extractor.extractFromSessions(sessions)

      // 3. 评分
      const scoredExamples = this.scorer.calculateScores(result.examples)

      // 4. 保存
      await this.repository.add(scoredExamples)

      logger.info('示例提取完成', 'main', {
        extracted: result.examples.length,
        processed: result.processedSessions,
        skipped: result.skippedSessions
      })

      return {
        extracted: result.examples.length,
        saved: scoredExamples.length,
        errors: result.errors
      }
    } catch (error) {
      logger.error('示例提取失败', 'main', { error })
      return {
        extracted: 0,
        saved: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  // 记录示例使用
  async recordUsage(exampleIds: string[]): Promise<void> {
    await this.ensureInitialized()

    if (exampleIds.length === 0) {
      return
    }

    // 获取所有示例
    const allExamples = await this.repository.getAll()
    const updated = this.scorer.updateUsageBatch(allExamples, exampleIds)

    // 保存更新
    await this.repository.update(updated)

    logger.debug('示例使用记录完成', 'main', { count: exampleIds.length })
  }

  // 清理低质量示例
  async cleanup(minQualityScore: number): Promise<number> {
    await this.ensureInitialized()
    return this.repository.cleanupByQuality(minQualityScore)
  }

  // 清理过期示例
  async cleanupOldExamples(days: number): Promise<number> {
    await this.ensureInitialized()
    return this.repository.cleanupByAge(days)
  }

  // 获取统计信息
  async getStats(): Promise<{
    total: number
    static: number
    dynamic: number
    avgQualityScore: number
    lastUpdated: string
  }> {
    await this.ensureInitialized()
    return this.repository.getStats()
  }

  // 导出示例
  async exportExamples(): Promise<string> {
    await this.ensureInitialized()
    return this.repository.exportAsJSON()
  }

  // 导入示例
  async importExamples(json: string): Promise<void> {
    await this.ensureInitialized()
    await this.repository.importFromJSON(json)
  }

  // 选择静态示例
  private selectStaticExamples(
    criteria: ExampleSelectionCriteria,
    availableToolNames: string[]
  ): EnhancedFewShotExample[] {
    const maxStatic = criteria.maxStaticCount || criteria.maxCount
    const staticExamples = getFewShotExamples(maxStatic)

    // 转换为增强格式
    const enhanced: EnhancedFewShotExample[] = staticExamples.map((ex, index) => ({
      ...ex,
      id: `static-${index}`,
      qualityScore: 0.8, // 静态示例默认高分
      usageCount: 0,
      source: 'static' as const,
      toolsUsed: ex.toolCalls ? ex.toolCalls.map((tc) => tc.name) : [],
      createdAt: new Date().toISOString()
    }))

    // 过滤相关示例
    return this.filterByTools(enhanced, availableToolNames, criteria.requiredTools)
  }

  // 选择动态示例
  private async selectDynamicExamples(
    criteria: ExampleSelectionCriteria,
    availableToolNames: string[]
  ): Promise<EnhancedFewShotExample[]> {
    const allDynamic = await this.repository.getDynamicExamples()

    // 过滤相关示例
    let filtered = this.filterByTools(allDynamic, availableToolNames, criteria.requiredTools)

    // 按质量分数和最近使用时间排序
    filtered = filtered.sort((a, b) => {
      // 质量分数权重 70%
      const scoreDiff = b.qualityScore - a.qualityScore
      // 最近使用权重 30%
      const aLastUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const bLastUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
      const timeDiff = (bLastUsed - aLastUsed) / (30 * 24 * 60 * 60 * 1000) // 30天归一化

      return scoreDiff * 0.7 + timeDiff * 0.3
    })

    const maxDynamic = criteria.maxDynamicCount || criteria.maxCount
    return filtered.slice(0, maxDynamic)
  }

  // 根据工具过滤示例
  private filterByTools(
    examples: EnhancedFewShotExample[],
    availableToolNames: string[],
    requiredTools?: string[]
  ): EnhancedFewShotExample[] {
    return examples.filter((ex) => {
      // 检查是否使用了可用工具
      const usesAvailableTool = ex.toolsUsed.some((tool) => availableToolNames.includes(tool))

      // 如果没有必需工具，只检查是否使用可用工具
      if (!requiredTools || requiredTools.length === 0) {
        return usesAvailableTool || ex.toolsUsed.length === 0
      }

      // 检查是否包含所有必需工具
      const hasRequiredTools = requiredTools.every((tool) => ex.toolsUsed.includes(tool))

      return hasRequiredTools && usesAvailableTool
    })
  }

  // 获取所有会话
  private listAllSessions(): SessionData[] {
    try {
      const sessionList = sessionService.listSessions()
      const sessions: SessionData[] = []

      for (const item of sessionList) {
        const session = sessionService.loadSession(item.sessionId)
        if (session) {
          sessions.push(session)
        }
      }

      return sessions
    } catch (error) {
      logger.error('获取会话列表失败', 'main', { error })
      return []
    }
  }

  // 根据 IDs 获取会话
  private async getSessionsByIds(sessionIds: string[]): Promise<SessionData[]> {
    const sessions: SessionData[] = []
    for (const sessionId of sessionIds) {
      try {
        const session = sessionService.loadSession(sessionId)
        if (session) {
          sessions.push(session)
        }
      } catch (error) {
        logger.warn(`获取会话失败: ${sessionId}`, 'main', { error })
      }
    }
    return sessions
  }

  // 确保已初始化
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}

// 单例实例
export const exampleManager = new ExampleManager()
