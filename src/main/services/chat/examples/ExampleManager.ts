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
    return this.extractAndScoreFromSessionStreamAsync(sessions, options)
  }

  /**
   * 异步从会话流中提取并评分示例
   * 逐个消费 session，避免一次性加载全部会话和候选示例
   */
  async extractAndScoreFromSessionStreamAsync(
    sessions: Iterable<SessionData> | AsyncIterable<SessionData>,
    options: ExtractAndScoreOptions = {}
  ): Promise<ExampleExtractionResult> {
    const { minQualityScore = 0, maxExamples = Number.MAX_SAFE_INTEGER } = options
    const examples: EnhancedFewShotExample[] = []
    let processedSessions = 0
    let skippedSessions = 0
    const errors: string[] = []
    let sessionCount = 0

    for await (const session of this.toAsyncIterable(sessions)) {
      sessionCount++

      try {
        const sessionExamples = await this.extractor.extractFromSessionAsync(session)
        if (sessionExamples.length === 0) {
          skippedSessions++
        } else {
          processedSessions++

          for (const example of sessionExamples) {
            const scoredExample: EnhancedFewShotExample = {
              ...example,
              qualityScore: this.scorer.calculateScore(example)
            }

            if (scoredExample.qualityScore < minQualityScore) {
              continue
            }

            this.pushTopExample(examples, scoredExample, maxExamples)
          }
        }
      } catch (error) {
        skippedSessions++
        errors.push(
          `会话 ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (sessionCount % SCORING_YIELD_INTERVAL === 0) {
        await yieldToEventLoop()
      }
    }

    return {
      examples: examples.sort((a, b) => b.qualityScore - a.qualityScore),
      processedSessions,
      skippedSessions,
      errors
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

  /**
   * 将同步/异步会话源统一转为异步迭代
   */
  private async *toAsyncIterable(
    sessions: Iterable<SessionData> | AsyncIterable<SessionData>
  ): AsyncGenerator<SessionData, void, void> {
    if (Symbol.asyncIterator in Object(sessions)) {
      for await (const session of sessions as AsyncIterable<SessionData>) {
        yield session
      }
      return
    }

    for (const session of sessions as Iterable<SessionData>) {
      yield session
    }
  }

  /**
   * 维护固定大小的高质量示例集合
   */
  private pushTopExample(
    examples: EnhancedFewShotExample[],
    example: EnhancedFewShotExample,
    maxExamples: number
  ): void {
    if (maxExamples <= 0) {
      return
    }

    examples.push(example)
    examples.sort((a, b) => b.qualityScore - a.qualityScore)

    if (examples.length > maxExamples) {
      examples.length = maxExamples
    }
  }
}

/**
 * 默认示例管理器实例
 */
export const exampleManager = new ExampleManager()
