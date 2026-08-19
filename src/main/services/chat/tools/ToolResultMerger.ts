import type { EnrichedToolResult, ResultMergeStrategy } from './PipelineTypes'
import type { ToolCategory } from './UnifiedToolRegistry'

/** 各类别在排序时的优先级顺序 */
const CATEGORY_ORDER: ToolCategory[] = ['paper', 'knowledge', 'paper_web', 'writer', 'mcp']

/** 合并操作的返回结果 */
export interface MergeOutput {
  /** 合并后的结果列表 */
  results: EnrichedToolResult[]
  /** 合并后的文本内容（仅 smart_merge 会生成） */
  mergedContent: string | null
}

/**
 * 工具结果合并器
 * 支持不合并、去重、排序、智能合并四种策略
 */
export class ToolResultMerger {
  /**
   * 按指定策略合并多组结果
   * @param results 待合并的增强结果列表
   * @param strategy 合并策略
   */
  merge(results: EnrichedToolResult[], strategy: ResultMergeStrategy): MergeOutput {
    if (results.length === 0) {
      return { results: [], mergedContent: null }
    }

    // 写作建议不得排序、拼接或去重，强制 none
    if (results.some((r) => r.metadata.sourceType === 'writer')) {
      return { results: [...results], mergedContent: null }
    }

    switch (strategy) {
      case 'none':
        return { results: [results[0]], mergedContent: null }
      case 'smart_merge':
        return this.smartMerge(results)
      case 'dedupe':
        return { results: this.deduplicate(results), mergedContent: null }
      case 'rank':
        return { results: this.rankBySource(results), mergedContent: null }
      default:
        return { results, mergedContent: null }
    }
  }

  /**
   * 计算两段文本的 Jaccard 相似度（用于去重判断）
   * 使用字符 bigram 支持中文等无空格语言的相似度计算
   */
  jaccardSimilarity(a: string, b: string): number {
    const setA = this.tokenize(a)
    const setB = this.tokenize(b)
    if (setA.size === 0 && setB.size === 0) return 1
    if (setA.size === 0 || setB.size === 0) return 0

    let intersection = 0
    for (const token of setA) {
      if (setB.has(token)) intersection++
    }
    const union = setA.size + setB.size - intersection
    return intersection / union
  }

  /** 智能合并：先去重，再按来源排序，最后合并为统一内容 */
  private smartMerge(results: EnrichedToolResult[]): MergeOutput {
    if (results.length === 1) {
      return { results, mergedContent: null }
    }

    const deduped = this.deduplicate(results)
    const ranked = this.rankBySource(deduped)
    const mergedContent = this.concatenate(ranked)

    return { results: ranked, mergedContent }
  }

  /**
   * 使用 Jaccard 相似度 > 0.6 作为阈值对结果进行去重
   */
  private deduplicate(results: EnrichedToolResult[]): EnrichedToolResult[] {
    const kept: EnrichedToolResult[] = []
    for (const result of results) {
      const text = this.extractText(result)
      const isDuplicate = kept.some((k) => this.jaccardSimilarity(text, this.extractText(k)) > 0.6)
      if (!isDuplicate) {
        kept.push(result)
      }
    }
    return kept
  }

  /** 按预定义的类别优先级顺序对结果排序 */
  private rankBySource(results: EnrichedToolResult[]): EnrichedToolResult[] {
    return [...results].sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a.metadata.sourceType)
      const idxB = CATEGORY_ORDER.indexOf(b.metadata.sourceType)
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
    })
  }

  /** 将所有结果按来源标记后拼接为统一文本 */
  private concatenate(results: EnrichedToolResult[]): string {
    return results
      .map((r) => {
        const label = `[来源: ${r.metadata.sourceType} - ${r.metadata.sourceName}]`
        return `${label}\n${this.extractText(r)}`
      })
      .join('\n\n')
  }

  /** 将文本 token 化为字符 bigram 集合（支持中文等无空格语言） */
  private tokenize(text: string): Set<string> {
    const normalized = text.replace(/[\s\n\r]+/g, ' ').trim()
    const tokens: string[] = []

    // 使用字符 bigram 支持中文等无空格语言
    for (let i = 0; i < normalized.length - 1; i++) {
      tokens.push(normalized.substring(i, i + 2))
    }

    return new Set(tokens)
  }

  private extractText(result: EnrichedToolResult): string {
    return typeof result.content === 'string' ? result.content : ''
  }
}
