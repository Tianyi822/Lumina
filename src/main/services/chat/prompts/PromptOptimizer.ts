/**
 * 提示词优化器
 * 通过压缩和调整内容减少 token 消耗
 */

import type { MCPToolReference } from '@main/types/chat'

/**
 * 压缩级别
 */
enum CompressionLevel {
  None = 0,
  Level1 = 1,
  Level2 = 2,
  Level3 = 3,
  Level4 = 4
}

/**
 * 优化选项
 */
export interface OptimizationOptions {
  /** 允许的最大 token 数量 */
  maxTokens: number
  /** 优化的激进程度 */
  aggressiveness: 'conservative' | 'balanced' | 'aggressive'
  /** 工具列表，用于优化工具描述 */
  tools?: MCPToolReference[]
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  /** 优化后的提示词内容 */
  optimizedPrompt: string
  /** 使用的压缩级别 */
  compressionLevel: CompressionLevel
  /** 原始提示词的估算 token 数 */
  originalTokens: number
  /** 优化后提示词的估算 token 数 */
  optimizedTokens: number
  /** 减少 token 的百分比 */
  reductionPercent: number
}

/**
 * 提示词优化器
 * 提供多种压缩策略，包括移除章节、简化内容、减少示例等
 */
export class PromptOptimizer {
  /**
   * 优化提示词
   * 根据给定的选项压缩提示词以减少 token 消耗
   */
  optimize(prompt: string, options: OptimizationOptions): OptimizationResult {
    const originalTokens = this.estimateTokens(prompt)
    let optimizedPrompt = prompt
    let compressionLevel = CompressionLevel.None

    if (options.maxTokens > 0 && originalTokens > options.maxTokens * 0.3) {
      compressionLevel = this.calculateCompressionLevel(
        originalTokens,
        options.maxTokens,
        options.aggressiveness
      )

      if (compressionLevel >= CompressionLevel.Level1) {
        optimizedPrompt = this.applyCompression(
          optimizedPrompt,
          compressionLevel,
          options.tools || []
        )
      }
    }

    const optimizedTokens = this.estimateTokens(optimizedPrompt)
    const reductionPercent =
      originalTokens > 0 ? ((originalTokens - optimizedTokens) / originalTokens) * 100 : 0

    return {
      optimizedPrompt,
      compressionLevel,
      originalTokens,
      optimizedTokens,
      reductionPercent
    }
  }

  /**
   * 对工具列表进行优先级排序
   * 根据工具名称、描述质量和参数数量计算分数
   */
  prioritizeTools(tools: MCPToolReference[]): MCPToolReference[] {
    const prioritized = [...tools].map((tool) => ({
      tool,
      score: this.calculateToolScore(tool)
    }))

    prioritized.sort((a, b) => b.score - a.score)

    return prioritized.map((p) => p.tool)
  }

  /**
   * 压缩工具描述
   * 根据指定的级别返回不同详细程度的描述
   */
  compressToolDescription(description: string, level: 'minimal' | 'basic' | 'detailed'): string {
    if (level === 'minimal') {
      const firstSentence = description.split(/[。.！!]/)[0]
      return firstSentence.trim()
    }

    if (level === 'basic') {
      return this.compressText(description, 200)
    }

    return description
  }

  /**
   * 移除文本中的重复内容
   * 包括重复的段落和句子
   */
  removeRedundancy(text: string): string {
    let compressed = text

    const paragraphs = compressed.split('\n\n')
    const uniqueParagraphs: string[] = []
    const seen = new Set<string>()

    for (const para of paragraphs) {
      const normalized = para.toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        uniqueParagraphs.push(para)
      }
    }

    compressed = uniqueParagraphs.join('\n\n')

    const sentences = compressed.split(/。|！|\./)
    const uniqueSentences: string[] = []
    const sentenceSeen = new Set<string>()

    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase().trim()
      if (normalized && !sentenceSeen.has(normalized)) {
        sentenceSeen.add(normalized)
        uniqueSentences.push(sentence)
      }
    }

    compressed = uniqueSentences.join('。')
    return compressed
  }

  /**
   * 计算需要的压缩级别
   * 根据当前 token 数量和目标数量以及优化激进程度确定
   */
  private calculateCompressionLevel(
    tokens: number,
    maxTokens: number,
    aggressiveness: 'conservative' | 'balanced' | 'aggressive'
  ): CompressionLevel {
    const ratio = tokens / maxTokens

    const thresholds = {
      conservative: [0.5, 0.6, 0.7, 0.8],
      balanced: [0.4, 0.5, 0.6, 0.7],
      aggressive: [0.3, 0.4, 0.5, 0.6]
    }[aggressiveness]

    if (ratio > thresholds[3]) return CompressionLevel.Level4
    if (ratio > thresholds[2]) return CompressionLevel.Level3
    if (ratio > thresholds[1]) return CompressionLevel.Level2
    if (ratio > thresholds[0]) return CompressionLevel.Level1

    return CompressionLevel.None
  }

  /**
   * 应用压缩策略
   * 根据压缩级别依次执行不同级别的压缩操作
   */
  private applyCompression(
    prompt: string,
    level: CompressionLevel,
    tools: MCPToolReference[]
  ): string {
    let compressed = prompt

    if (level >= CompressionLevel.Level1) {
      compressed = this.removeOptionalSections(compressed)
    }

    if (level >= CompressionLevel.Level2) {
      compressed = this.simplifyReactProcess(compressed)
    }

    if (level >= CompressionLevel.Level3) {
      compressed = this.reduceExamples(compressed, 1)
    }

    if (level >= CompressionLevel.Level4) {
      compressed = this.minimizeToolDescriptions(compressed, tools)
    }

    return compressed
  }

  /**
   * 移除非必需的章节
   * 包括输出格式要求和错误处理策略
   */
  private removeOptionalSections(prompt: string): string {
    let compressed = prompt

    compressed = compressed.replace(/# 输出格式要求[\s\S]*?(?=\n#|\n\n\n|$)/g, '')

    compressed = compressed.replace(/# 错误处理策略[\s\S]*?(?=\n#|\n\n\n|$)/g, '')

    return compressed.trim()
  }

  /**
   * 简化 ReAct 流程说明
   * 保留核心步骤，移除详细说明
   */
  private simplifyReactProcess(prompt: string): string {
    return prompt.replace(
      /# ReAct 推理流程[\s\S]*?(?=\n#|\n\n\n|$)/,
      `# 推理流程

使用以下步骤解决问题：
1. **思考**: 分析需要什么信息
2. **行动**: 调用合适的工具
3. **观察**: 查看工具结果
4. **决策**: 给出最终答案或继续思考

始终清晰表达你的推理过程。`
    )
  }

  /**
   * 减少示例数量
   * 只保留指定数量的示例
   */
  private reduceExamples(prompt: string, maxCount: number): string {
    const examplesMatch = prompt.match(/# 示例[\s\S]*$/)
    if (!examplesMatch) return prompt

    const examplesSection = examplesMatch[0]
    const exampleMatches = Array.from(
      examplesSection.matchAll(/## 示例 \d+[\s\S]*?(?=## 示例 \d+|$)/g)
    )

    if (exampleMatches.length <= maxCount) return prompt

    const keptExamples = exampleMatches
      .slice(0, maxCount)
      .map((m) => m[0])
      .join('\n\n---\n\n')

    return prompt.replace(examplesSection, `# 示例\n\n${keptExamples}`)
  }

  /**
   * 最小化工具描述
   * 此方法预留用于未来的工具描述优化功能
   */
  private minimizeToolDescriptions(prompt: string, _tools: MCPToolReference[]): string {
    void _tools
    return prompt
  }

  /**
   * 压缩文本长度
   * 在指定的 token 限制内保留尽可能多的内容
   */
  private compressText(text: string, maxTokens: number): string {
    const sentences = text.split(/。|！|\./)
    let compressed = ''
    let currentTokens = 0

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence + '。')
      if (currentTokens + sentenceTokens > maxTokens) {
        break
      }
      compressed += sentence + '。'
      currentTokens += sentenceTokens
    }

    return compressed || text.substring(0, maxTokens * 3)
  }

  /**
   * 计算工具的优先级分数
   * 根据工具名称长度、描述长度、参数数量等计算
   */
  private calculateToolScore(tool: MCPToolReference): number {
    let score = 0

    if (tool.toolName.length < 20) score += 10

    const descLength = tool.description.length
    if (descLength >= 50 && descLength <= 200) score += 15

    const paramCount = Object.keys(tool.inputSchema).length
    if (paramCount >= 1 && paramCount <= 5) score += 10

    if (tool.toolName.includes('_') || tool.toolName.includes('-')) score += 5

    return score
  }

  /**
   * 估算文本的 token 数量
   * 使用粗略估算：中文每个字符约 0.5 token，英文每个字符约 0.25 token
   */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars

    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }
}
