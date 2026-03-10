import type { SessionData } from '@shared/types/session'
import type { EnhancedFewShotExample, ExampleExtractionResult } from '../prompts/types'
import { ExampleExtractor } from './ExampleExtractor'
import { ExampleScorer } from './ExampleScorer'

export interface ExampleManagerOptions {
  extractor?: ExampleExtractor
  scorer?: ExampleScorer
}

export interface ExtractAndScoreOptions {
  minQualityScore?: number
  maxExamples?: number
}

/**
 * 示例管理器
 * 统一协调示例提取和质量评分流程
 */
export class ExampleManager {
  private readonly extractor: ExampleExtractor
  private readonly scorer: ExampleScorer

  constructor(options: ExampleManagerOptions = {}) {
    this.extractor = options.extractor ?? new ExampleExtractor()
    this.scorer = options.scorer ?? new ExampleScorer()
  }

  /**
   * 从会话中提取并评分示例
   */
  extractAndScoreFromSessions(
    sessions: SessionData[],
    options: ExtractAndScoreOptions = {}
  ): ExampleExtractionResult {
    const { minQualityScore = 0, maxExamples = Number.MAX_SAFE_INTEGER } = options
    const extractionResult = this.extractor.extractFromSessions(sessions)
    const examples = this.scoreExamples(extractionResult.examples)
      .filter((example) => example.qualityScore >= minQualityScore)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, maxExamples)

    return {
      ...extractionResult,
      examples
    }
  }

  /**
   * 为示例批量打分
   */
  scoreExamples(examples: EnhancedFewShotExample[]): EnhancedFewShotExample[] {
    return this.scorer.calculateScores(examples)
  }

  /**
   * 更新单个示例使用次数
   */
  updateUsage(example: EnhancedFewShotExample): EnhancedFewShotExample {
    return this.scorer.updateUsage(example)
  }

  /**
   * 批量更新示例使用次数
   */
  updateUsageBatch(
    examples: EnhancedFewShotExample[],
    exampleIds: string[]
  ): EnhancedFewShotExample[] {
    return this.scorer.updateUsageBatch(examples, exampleIds)
  }
}

/**
 * 默认示例管理器实例
 */
export const exampleManager = new ExampleManager()
