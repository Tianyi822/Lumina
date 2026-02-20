/**
 * 动态 Few-shot 示例提取器
 * 从历史高质量对话中自动提取和筛选示例
 */

import type {
  EnhancedFewShotExample,
  ExampleExtractionResult,
  ExampleSelectionCriteria
} from './types'
import type { DynamicExampleStorage } from '@shared/types/prompt'
import type { SessionData, SessionMessage } from '@shared/types/session'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { logger } from '../../logger'

/**
 * 动态示例提取器
 * 分析历史会话，识别成功的工具调用模式，提取为 Few-shot 示例
 */
export class DynamicExampleExtractor {
  private storagePath: string | null = null
  private storage: DynamicExampleStorage | null = null
  private initialized = false

  constructor() {
    this.initialize()
  }

  /**
   * 初始化提取器
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const userDataPath = app?.getPath('userData') || process.cwd()
      this.storagePath = path.join(userDataPath, 'dynamic-examples.json')
      await this.loadStorage()
      this.initialized = true
      logger.info('动态示例提取器初始化成功', 'main')
    } catch (error) {
      logger.error('动态示例提取器初始化失败', 'main', { error })
      this.storage = this.createEmptyStorage()
      this.initialized = true
    }
  }

  /**
   * 创建空的存储结构
   */
  private createEmptyStorage(): DynamicExampleStorage {
    return {
      version: '1.0.0',
      examples: [],
      extractionStats: {
        totalExtracted: 0,
        totalSessions: 0,
        averageQualityScore: 0
      }
    }
  }

  /**
   * 加载存储文件
   */
  private async loadStorage(): Promise<void> {
    if (!this.storagePath) return

    try {
      await fs.access(this.storagePath)
      const content = await fs.readFile(this.storagePath, 'utf-8')
      this.storage = JSON.parse(content) as DynamicExampleStorage
      logger.debug('动态示例存储加载成功', 'main', {
        exampleCount: this.storage?.examples.length
      })
    } catch {
      this.storage = this.createEmptyStorage()
      await this.saveStorage()
    }
  }

  /**
   * 保存存储文件
   */
  private async saveStorage(): Promise<void> {
    if (!this.storagePath || !this.storage) return

    try {
      const content = JSON.stringify(this.storage, null, 2)
      await fs.writeFile(this.storagePath, content, 'utf-8')
    } catch (error) {
      logger.error('保存动态示例存储失败', 'main', { error })
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 从会话数据中提取示例
   */
  async extractFromSessions(
    sessions: SessionData[],
    options: {
      minQualityScore?: number
      maxExamples?: number
    } = {}
  ): Promise<ExampleExtractionResult> {
    await this.ensureInitialized()

    const { minQualityScore = 0.6, maxExamples = 50 } = options
    const result: ExampleExtractionResult = {
      examples: [],
      skippedSessions: 0,
      processedSessions: 0,
      errors: []
    }

    for (const session of sessions) {
      try {
        const examples = this.extractFromSession(session, minQualityScore)
        if (examples.length > 0) {
          result.examples.push(...examples)
          result.processedSessions++
        } else {
          result.skippedSessions++
        }
      } catch (error) {
        result.errors.push(`会话 ${session.sessionId} 提取失败: ${error}`)
        result.skippedSessions++
      }
    }

    // 按质量分数排序并限制数量
    result.examples.sort((a, b) => b.qualityScore - a.qualityScore)
    result.examples = result.examples.slice(0, maxExamples)

    // 更新存储
    if (result.examples.length > 0 && this.storage) {
      // 合并新示例，去重
      const existingIds = new Set(this.storage.examples.map((e) => e.id))
      const newExamples = result.examples.filter((e) => !existingIds.has(e.id))
      this.storage.examples.push(...newExamples)

      // 更新统计
      this.storage.extractionStats.totalExtracted += newExamples.length
      this.storage.extractionStats.totalSessions += result.processedSessions
      this.storage.lastExtractedAt = new Date().toISOString()

      // 重新计算平均质量分数
      const allScores = this.storage.examples.map((e) => e.qualityScore)
      this.storage.extractionStats.averageQualityScore =
        allScores.reduce((a, b) => a + b, 0) / allScores.length

      await this.saveStorage()
    }

    return result
  }

  /**
   * 从单个会话中提取示例
   */
  private extractFromSession(
    session: SessionData,
    minQualityScore: number
  ): EnhancedFewShotExample[] {
    const examples: EnhancedFewShotExample[] = []
    const messages = session.messages

    // 查找包含工具调用的消息对
    for (let i = 0; i < messages.length; i++) {
      const assistantMsg = messages[i]

      // 检查是否是包含工具调用的助手消息
      if (assistantMsg.role === 'assistant' && assistantMsg.tool_calls?.length) {
        // 向前查找用户消息
        const userMsg = this.findPrecedingUserMessage(messages, i)
        if (!userMsg) continue

        // 向后查找工具响应和最终回答
        const toolResponses = this.findToolResponses(messages, i, assistantMsg.tool_calls)
        const finalAnswer = this.findFinalAnswer(messages, i)

        if (!finalAnswer) continue

        // 计算质量分数
        const qualityScore = this.calculateQualityScore(
          userMsg,
          assistantMsg,
          toolResponses,
          finalAnswer
        )

        if (qualityScore >= minQualityScore) {
          const example: EnhancedFewShotExample = {
            id: `${session.sessionId}-${i}`,
            userQuery: userMsg.content,
            thought: assistantMsg.reasoning || '',
            toolCalls:
              assistantMsg.tool_calls.map((tc, idx) => ({
                name: tc.function?.name || 'unknown',
                arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
                result: toolResponses[idx]?.content || ''
              })) || [],
            finalAnswer: finalAnswer.content,
            qualityScore,
            usageCount: 0,
            source: 'dynamic',
            toolsUsed: assistantMsg.tool_calls.map((tc) => tc.function?.name || 'unknown'),
            createdAt: new Date().toISOString(),
            sourceSessionId: session.sessionId
          }

          examples.push(example)
        }
      }
    }

    return examples
  }

  /**
   * 查找之前的用户消息
   */
  private findPrecedingUserMessage(
    messages: SessionMessage[],
    startIndex: number
  ): SessionMessage | null {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i]
      }
    }
    return null
  }

  /**
   * 查找工具响应消息
   */
  private findToolResponses(
    messages: SessionMessage[],
    startIndex: number,
    toolCalls: SessionMessage['tool_calls']
  ): SessionMessage[] {
    const responses: SessionMessage[] = []
    const toolCallIds = new Set(toolCalls?.map((tc) => tc.id) || [])

    for (
      let i = startIndex + 1;
      i < messages.length && responses.length < (toolCalls?.length || 0);
      i++
    ) {
      const msg = messages[i]
      if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.has(msg.tool_call_id)) {
        responses.push(msg)
      }
    }

    return responses
  }

  /**
   * 查找最终回答
   */
  private findFinalAnswer(messages: SessionMessage[], startIndex: number): SessionMessage | null {
    for (let i = startIndex + 1; i < messages.length; i++) {
      const msg = messages[i]
      // 最终回答是没有工具调用的助手消息
      if (msg.role === 'assistant' && !msg.tool_calls?.length && msg.content) {
        return msg
      }
    }
    return null
  }

  /**
   * 计算示例质量分数
   */
  private calculateQualityScore(
    userMsg: SessionMessage,
    assistantMsg: SessionMessage,
    toolResponses: SessionMessage[],
    finalAnswer: SessionMessage
  ): number {
    let score = 0

    // 1. 用户问题的清晰度 (0-0.2)
    if (userMsg.content.length >= 10 && userMsg.content.length <= 500) {
      score += 0.1
    }
    if (
      userMsg.content.includes('?') ||
      userMsg.content.includes('？') ||
      userMsg.content.includes('请')
    ) {
      score += 0.1
    }

    // 2. 有思考过程 (0-0.2)
    if (assistantMsg.reasoning && assistantMsg.reasoning.length > 20) {
      score += 0.2
    } else if (assistantMsg.reasoning && assistantMsg.reasoning.length > 0) {
      score += 0.1
    }

    // 3. 工具调用成功率 (0-0.3)
    const successfulCalls = toolResponses.filter((r) => {
      const content = r.content.toLowerCase()
      return !content.includes('error') && !content.includes('failed') && content.length > 10
    }).length
    const totalCalls = assistantMsg.tool_calls?.length || 0
    if (totalCalls > 0) {
      score += (successfulCalls / totalCalls) * 0.3
    }

    // 4. 最终回答质量 (0-0.3)
    if (finalAnswer.content.length >= 50) {
      score += 0.1
    }
    if (finalAnswer.content.length >= 100 && finalAnswer.content.length <= 2000) {
      score += 0.1
    }
    // 包含结构化内容
    if (
      finalAnswer.content.includes('\n') &&
      (finalAnswer.content.includes('-') || finalAnswer.content.includes('*'))
    ) {
      score += 0.1
    }

    return Math.min(score, 1)
  }

  /**
   * 选择适合当前上下文的示例
   */
  selectExamples(criteria: ExampleSelectionCriteria): EnhancedFewShotExample[] {
    if (!this.storage) return []

    let candidates = [...this.storage.examples]

    // 过滤来源类型
    if (!criteria.includeStatic) {
      candidates = candidates.filter((e) => e.source !== 'static')
    }
    if (!criteria.includeDynamic) {
      candidates = candidates.filter((e) => e.source !== 'dynamic')
    }

    // 过滤质量分数
    candidates = candidates.filter((e) => e.qualityScore >= criteria.minQualityScore)

    // 过滤必需工具
    if (criteria.requiredTools && criteria.requiredTools.length > 0) {
      candidates = candidates.filter((e) =>
        criteria.requiredTools!.some((tool) => e.toolsUsed.includes(tool))
      )
    }

    // 按质量分数和使用次数排序
    candidates.sort((a, b) => {
      // 优先质量分数
      if (b.qualityScore !== a.qualityScore) {
        return b.qualityScore - a.qualityScore
      }
      // 然后按使用次数（优先使用少的，增加多样性）
      return a.usageCount - b.usageCount
    })

    // 分配静态和动态示例数量
    let staticCount = 0
    let dynamicCount = 0
    const maxStatic = criteria.maxStaticCount ?? Math.floor(criteria.maxCount / 2)
    const maxDynamic = criteria.maxDynamicCount ?? criteria.maxCount

    const selected: EnhancedFewShotExample[] = []

    for (const example of candidates) {
      if (selected.length >= criteria.maxCount) break

      if (example.source === 'static' && staticCount < maxStatic) {
        selected.push(example)
        staticCount++
      } else if (example.source === 'dynamic' && dynamicCount < maxDynamic) {
        selected.push(example)
        dynamicCount++
      }
    }

    return selected
  }

  /**
   * 记录示例使用
   */
  async recordUsage(exampleIds: string[]): Promise<void> {
    await this.ensureInitialized()

    if (!this.storage) return

    for (const id of exampleIds) {
      const example = this.storage.examples.find((e) => e.id === id)
      if (example) {
        example.usageCount++
        example.lastUsedAt = new Date().toISOString()
      }
    }

    await this.saveStorage()
  }

  /**
   * 获取所有存储的示例
   */
  async getAllExamples(): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    return this.storage?.examples || []
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<DynamicExampleStorage['extractionStats'] | null> {
    await this.ensureInitialized()
    return this.storage?.extractionStats || null
  }

  /**
   * 清除所有动态示例
   */
  async clearDynamicExamples(): Promise<void> {
    await this.ensureInitialized()

    if (!this.storage) return

    this.storage.examples = this.storage.examples.filter((e) => e.source === 'static')
    this.storage.extractionStats.totalExtracted = this.storage.examples.length
    await this.saveStorage()

    logger.info('动态示例已清除', 'main')
  }

  /**
   * 删除低质量示例
   */
  async pruneLowQualityExamples(minQuality: number = 0.5): Promise<number> {
    await this.ensureInitialized()

    if (!this.storage) return 0

    const originalCount = this.storage.examples.length
    this.storage.examples = this.storage.examples.filter((e) => e.qualityScore >= minQuality)
    const removedCount = originalCount - this.storage.examples.length

    if (removedCount > 0) {
      await this.saveStorage()
      logger.info(`已删除 ${removedCount} 个低质量示例`, 'main')
    }

    return removedCount
  }
}

// 单例实例
export const dynamicExampleExtractor = new DynamicExampleExtractor()
