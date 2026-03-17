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

const SCORING_YIELD_INTERVAL = 20

/**
 * 在批量评分期间让出事件循环，避免主线程长时间占用
 */
async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
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
   * 异步从会话中提取并评分示例
   */
  async extractAndScoreFromSessionsAsync(
    sessions: SessionData[],
    options: ExtractAndScoreOptions = {}
  ): Promise<ExampleExtractionResult> {
    const { minQualityScore = 0, maxExamples = Number.MAX_SAFE_INTEGER } = options
    const extractionResult = await this.extractor.extractFromSessionsAsync(sessions)
    const scoredExamples = await this.scoreExamplesAsync(extractionResult.examples)
    const examples = scoredExamples
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
   * 异步为示例批量打分
   */
  async scoreExamplesAsync(examples: EnhancedFewShotExample[]): Promise<EnhancedFewShotExample[]> {
    const scoredExamples: EnhancedFewShotExample[] = []

    for (let index = 0; index < examples.length; index++) {
      const example = examples[index]

      scoredExamples.push({
        ...example,
        qualityScore: this.scorer.calculateScore(example)
      })

      if ((index + 1) % SCORING_YIELD_INTERVAL === 0) {
        await yieldToEventLoop()
      }
    }

    return scoredExamples
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
