/**
 * 提示词优化器
 * 智能压缩和优化提示词以减少 token 消耗
 */

import type { ReactPromptSections } from './types'
import type { MCPToolReference } from '@main/types/chat'

/**
 * 优化级别
 */
enum CompressionLevel {
  None = 0,
  Level1 = 1, // 移除可选章节
  Level2 = 2, // 简化流程说明
  Level3 = 3, // 减少示例
  Level4 = 4 // 最小化工具描述
}

/**
 * 优化选项
 */
export interface OptimizationOptions {
  /** 最大 token 数量 */
  maxTokens: number
  /** 优化激进程度 */
  aggressiveness: 'conservative' | 'balanced' | 'aggressive'
  /** 工具列表 */
  tools?: MCPToolReference[]
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  /** 优化后的提示词 */
  optimizedPrompt: string
  /** 应用的压缩级别 */
  compressionLevel: CompressionLevel
  /** 估算的原始 token 数 */
  originalTokens: number
  /** 估算的优化后 token 数 */
  optimizedTokens: number
  /** 减少的百分比 */
  reductionPercent: number
}

/**
 * 提示词优化器
 */
export class PromptOptimizer {
  /**
   * 优化提示词
   */
  optimize(prompt: string, options: OptimizationOptions): OptimizationResult {
    const originalTokens = this.estimateTokens(prompt)
    let optimizedPrompt = prompt
    let compressionLevel = CompressionLevel.None

    // 如果启用优化且超过阈值
    if (options.maxTokens > 0 && originalTokens > options.maxTokens * 0.3) {
      // 计算需要的压缩级别
      compressionLevel = this.calculateCompressionLevel(
        originalTokens,
        options.maxTokens,
        options.aggressiveness
      )

      // 应用压缩
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
   * 优化章节
   */
  optimizeSections(sections: ReactPromptSections, budget: number): ReactPromptSections {
    const optimized = { ...sections }
    let remainingBudget = budget

    // 按优先级处理章节
    const priorities = [
      { key: 'coreInstructions', priority: 1, essential: true },
      { key: 'reactProcess', priority: 2, essential: true },
      { key: 'toolBestPractices', priority: 3, essential: false },
      { key: 'errorHandling', priority: 4, essential: false },
      { key: 'outputFormat', priority: 5, essential: false }
    ] as const

    for (const { key, essential } of priorities) {
      const section = optimized[key]
      const sectionSize = this.estimateTokens(section)

      if (remainingBudget >= sectionSize) {
        remainingBudget -= sectionSize
        continue
      }

      // 如果预算不足且不是必需的，移除章节
      if (!essential && remainingBudget < sectionSize) {
        optimized[key] = ''
        continue
      }

      // 压缩章节
      if (essential || remainingBudget > 0) {
        optimized[key] = this.compressText(section, remainingBudget)
        remainingBudget -= this.estimateTokens(optimized[key])
      }
    }

    return optimized
  }

  /**
   * 优先排序工具
   */
  prioritizeTools(tools: MCPToolReference[]): MCPToolReference[] {
    // 根据工具名称和描述估算相关性
    const prioritized = [...tools].map((tool) => ({
      tool,
      score: this.calculateToolScore(tool)
    }))

    // 按分数排序
    prioritized.sort((a, b) => b.score - a.score)

    return prioritized.map((p) => p.tool)
  }

  /**
   * 压缩工具描述
   */
  compressToolDescription(description: string, level: 'minimal' | 'basic' | 'detailed'): string {
    if (level === 'minimal') {
      // 只保留第一句话
      const firstSentence = description.split(/[。.！!]/)[0]
      return firstSentence.trim()
    }

    if (level === 'basic') {
      // 移除详细说明，保留关键信息
      return this.compressText(description, 200)
    }

    // detailed: 完整描述
    return description
  }

  /**
   * 移除冗余
   */
  removeRedundancy(text: string): string {
    let compressed = text

    // 移除重复的段落
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

    // 移除重复的句子
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
   */
  private calculateCompressionLevel(
    tokens: number,
    maxTokens: number,
    aggressiveness: 'conservative' | 'balanced' | 'aggressive'
  ): CompressionLevel {
    const ratio = tokens / maxTokens

    // 根据激进程度调整阈值
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
   * 应用压缩
   */
  private applyCompression(
    prompt: string,
    level: CompressionLevel,
    tools: MCPToolReference[]
  ): string {
    let compressed = prompt

    if (level >= CompressionLevel.Level1) {
      // 移除可选章节
      compressed = this.removeOptionalSections(compressed)
    }

    if (level >= CompressionLevel.Level2) {
      // 简化 ReAct 流程说明
      compressed = this.simplifyReactProcess(compressed)
    }

    if (level >= CompressionLevel.Level3) {
      // 减少示例（保留1个）
      compressed = this.reduceExamples(compressed, 1)
    }

    if (level >= CompressionLevel.Level4) {
      // 最小化工具描述
      compressed = this.minimizeToolDescriptions(compressed, tools)
    }

    return compressed
  }

  /**
   * 移除可选章节
   */
  private removeOptionalSections(prompt: string): string {
    let compressed = prompt

    // 移除输出格式章节
    compressed = compressed.replace(/# 输出格式要求[\s\S]*?(?=\n#|\n\n\n|$)/g, '')

    // 移除错误处理章节
    compressed = compressed.replace(/# 错误处理策略[\s\S]*?(?=\n#|\n\n\n|$)/g, '')

    return compressed.trim()
  }

  /**
   * 简化 ReAct 流程
   */
  private simplifyReactProcess(prompt: string): string {
    // 简化流程说明为关键步骤
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
   */
  private reduceExamples(prompt: string, maxCount: number): string {
    // 查找示例章节
    const examplesMatch = prompt.match(/# 示例[\s\S]*$/)
    if (!examplesMatch) return prompt

    const examplesSection = examplesMatch[0]
    const exampleMatches = Array.from(
      examplesSection.matchAll(/## 示例 \d+[\s\S]*?(?=## 示例 \d+|$)/g)
    )

    if (exampleMatches.length <= maxCount) return prompt

    // 保留前 maxCount 个示例
    const keptExamples = exampleMatches
      .slice(0, maxCount)
      .map((m) => m[0])
      .join('\n\n---\n\n')

    // 替换原示例章节
    return prompt.replace(examplesSection, `# 示例\n\n${keptExamples}`)
  }

  /**
   * 最小化工具描述
   */
  private minimizeToolDescriptions(prompt: string, _tools: MCPToolReference[]): string {
    // _tools 参数预留用于未来工具描述优化功能
    void _tools
    // 这个方法主要在工具级别处理，这里只是预留
    // 实际的工具描述优化在 toolDescriptionEnhancer 中完成
    return prompt
  }

  /**
   * 压缩文本
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

    return compressed || text.substring(0, maxTokens * 3) // 粗略估算
  }

  /**
   * 计算 工具分数
   */
  private calculateToolScore(tool: MCPToolReference): number {
    let score = 0

    // 工具名称简洁性
    if (tool.toolName.length < 20) score += 10

    // 描述质量（不要太长也不要太短）
    const descLength = tool.description.length
    if (descLength >= 50 && descLength <= 200) score += 15

    // 参数数量（适中最好）
    const paramCount = Object.keys(tool.inputSchema).length
    if (paramCount >= 1 && paramCount <= 5) score += 10

    // 工具名称是否清晰
    if (tool.toolName.includes('_') || tool.toolName.includes('-')) score += 5

    return score
  }

  /**
   * 估算 token 数量
   */
  private estimateTokens(text: string): number {
    // 粗略估算：1 token ≈ 4 字符（英文）或 2 字符（中文）
    // 这里使用混合估算
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars

    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }
}
