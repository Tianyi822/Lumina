// 示例质量评分器，基于多个维度评估 Few-shot 示例的质量

import type { EnhancedFewShotExample } from '../prompts/types'

// 评分权重配置
interface ScoringWeights {
  // 工具成功率权重
  toolSuccess: number
  // 答案质量权重
  answerQuality: number
  // 推理深度权重
  reasoningDepth: number
  // 工具效率权重
  toolEfficiency: number
  // 用户反馈权重
  userFeedback: number
}

// 默认评分权重
const DEFAULT_WEIGHTS: ScoringWeights = {
  toolSuccess: 0.4,
  answerQuality: 0.3,
  reasoningDepth: 0.15,
  toolEfficiency: 0.1,
  userFeedback: 0.05
}

// 示例质量评分器
export class ExampleScorer {
  private weights: ScoringWeights

  constructor(weights?: Partial<ScoringWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights }
  }

  // 计算示例的综合质量分数
  calculateScore(example: EnhancedFewShotExample): number {
    const toolSuccessScore = this.calculateToolSuccessScore(example)
    const answerQualityScore = this.calculateAnswerQualityScore(example)
    const reasoningDepthScore = this.calculateReasoningDepthScore(example)
    const toolEfficiencyScore = this.calculateToolEfficiencyScore(example)
    const userFeedbackScore = this.calculateUserFeedbackScore(example)

    const totalScore =
      toolSuccessScore * this.weights.toolSuccess +
      answerQualityScore * this.weights.answerQuality +
      reasoningDepthScore * this.weights.reasoningDepth +
      toolEfficiencyScore * this.weights.toolEfficiency +
      userFeedbackScore * this.weights.userFeedback

    return Math.min(1, Math.max(0, totalScore))
  }

  // 批量计算分数
  calculateScores(examples: EnhancedFewShotExample[]): EnhancedFewShotExample[] {
    return examples.map((example) => ({
      ...example,
      qualityScore: this.calculateScore(example)
    }))
  }

  // 计算工具成功率分数
  private calculateToolSuccessScore(example: EnhancedFewShotExample): number {
    if (!example.toolCalls || example.toolCalls.length === 0) {
      return 0
    }

    // 如果有显式的成功率，使用它
    if (example.successRate !== undefined) {
      return example.successRate
    }

    // 否则检查工具调用是否有错误
    const successCount = example.toolCalls.filter((tc) => !this.isErrorResult(tc.result)).length
    return successCount / example.toolCalls.length
  }

  // 计算答案质量分数
  private calculateAnswerQualityScore(example: EnhancedFewShotExample): number {
    if (!example.finalAnswer) {
      return 0
    }

    let score = 0.5 // 基础分

    const answerLength = example.finalAnswer.length

    // 长度适中 (100-1000 字符)
    if (answerLength >= 100 && answerLength <= 1000) {
      score += 0.2
    } else if (answerLength > 50) {
      score += 0.1
    }

    // 包含结构化内容（列表、标题等）
    if (this.hasStructuredContent(example.finalAnswer)) {
      score += 0.15
    }

    // 包含代码块
    if (example.finalAnswer.includes('```')) {
      score += 0.1
    }

    // 直接回答用户问题
    if (this.answersQuestion(example.userQuery, example.finalAnswer)) {
      score += 0.05
    }

    return Math.min(1, score)
  }

  // 计算推理深度分数
  private calculateReasoningDepthScore(example: EnhancedFewShotExample): number {
    if (!example.thought) {
      return 0
    }

    let score = 0

    const thoughtLength = example.thought.length

    // 推理长度
    if (thoughtLength > 200) {
      score += 0.4
    } else if (thoughtLength > 100) {
      score += 0.3
    } else if (thoughtLength > 50) {
      score += 0.2
    }

    // 多步推理（包含多个步骤标记）
    const stepIndicators = ['首先', '然后', '接下来', '最后', '第一步', '第二步']
    const stepCount = stepIndicators.filter((indicator) =>
      example.thought.toLowerCase().includes(indicator)
    ).length
    score += Math.min(0.3, stepCount * 0.1)

    // 推理深度关键词
    const depthKeywords = ['分析', '考虑', '因为', '所以', '因此', '但是', '然而']
    const depthCount = depthKeywords.filter((keyword) => example.thought.includes(keyword)).length
    score += Math.min(0.3, depthCount * 0.05)

    return Math.min(1, score)
  }

  // 计算工具效率分数
  private calculateToolEfficiencyScore(example: EnhancedFewShotExample): number {
    if (!example.toolCalls || example.toolCalls.length === 0) {
      return 0
    }

    let score = 0.5 // 基础分

    // 工具调用数量适中 (1-3 个)
    if (example.toolCalls.length >= 1 && example.toolCalls.length <= 3) {
      score += 0.3
    } else if (example.toolCalls.length <= 5) {
      score += 0.1
    }

    // 没有重复调用相同的工具
    const uniqueTools = new Set(example.toolCalls.map((tc) => tc.name))
    if (uniqueTools.size === example.toolCalls.length) {
      score += 0.2
    }

    return Math.min(1, score)
  }

  // 计算用户反馈分数
  private calculateUserFeedbackScore(example: EnhancedFewShotExample): number {
    // 基于使用次数的简单反馈机制
    // 使用次数多说明示例有用
    if (example.usageCount === 0) {
      return 0.5 // 中性分数
    }

    // 使用次数越多，分数越高（最高 1.0）
    const maxExpectedUsage = 10
    return Math.min(1, 0.5 + (example.usageCount / maxExpectedUsage) * 0.5)
  }

  // 判断是否是错误结果
  private isErrorResult(result: string): boolean {
    const errorIndicators = ['error:', 'failed', 'exception', 'cannot', 'unable', '错误', '失败']
    const lowerResult = result.toLowerCase()
    return errorIndicators.some((indicator) => lowerResult.includes(indicator))
  }

  // 检查是否有结构化内容
  private hasStructuredContent(text: string): boolean {
    // 检查列表、标题、引用等结构化标记
    const structuredPatterns = [
      /^\s*[-*]\s/m, // 列表项
      /^\s*\d+\.\s/m, // 数字列表
      /^\s*#{1,6}\s/m, // 标题
      /^\s*>\s/m, // 引用
      /\*\*.*\*\*/ // 粗体
    ]

    return structuredPatterns.some((pattern) => pattern.test(text))
  }

  // 检查是否回答了问题
  private answersQuestion(question: string, answer: string): boolean {
    // 简单检查：答案中包含问题的关键词
    const questionWords = question
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2) // 忽略短词

    const answerLower = answer.toLowerCase()
    const matchedWords = questionWords.filter((word) => answerLower.includes(word))

    return matchedWords.length >= Math.min(2, questionWords.length)
  }

  // 更新示例使用次数
  updateUsage(example: EnhancedFewShotExample): EnhancedFewShotExample {
    return {
      ...example,
      usageCount: example.usageCount + 1,
      lastUsedAt: new Date().toISOString()
    }
  }

  // 批量更新使用次数
  updateUsageBatch(
    examples: EnhancedFewShotExample[],
    exampleIds: string[]
  ): EnhancedFewShotExample[] {
    return examples.map((example) => {
      if (exampleIds.includes(example.id)) {
        return this.updateUsage(example)
      }
      return example
    })
  }
}
