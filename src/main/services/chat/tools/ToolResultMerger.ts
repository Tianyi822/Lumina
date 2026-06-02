import type { EnrichedToolResult, ResultMergeStrategy } from './PipelineTypes'
import type { ToolCategory } from './UnifiedToolRegistry'

const CATEGORY_ORDER: ToolCategory[] = ['paper', 'knowledge', 'paper_web', 'lab', 'mcp']

export interface MergeOutput {
  results: EnrichedToolResult[]
  mergedContent: string | null
}

export class ToolResultMerger {
  merge(results: EnrichedToolResult[], strategy: ResultMergeStrategy): MergeOutput {
    if (results.length === 0) {
      return { results: [], mergedContent: null }
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

  private smartMerge(results: EnrichedToolResult[]): MergeOutput {
    if (results.length === 1) {
      return { results, mergedContent: null }
    }

    const deduped = this.deduplicate(results)
    const ranked = this.rankBySource(deduped)
    const mergedContent = this.concatenate(ranked)

    return { results: ranked, mergedContent }
  }

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

  private rankBySource(results: EnrichedToolResult[]): EnrichedToolResult[] {
    return [...results].sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a.metadata.sourceType)
      const idxB = CATEGORY_ORDER.indexOf(b.metadata.sourceType)
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
    })
  }

  private concatenate(results: EnrichedToolResult[]): string {
    return results
      .map((r) => {
        const label = `[来源: ${r.metadata.sourceType} - ${r.metadata.sourceName}]`
        return `${label}\n${this.extractText(r)}`
      })
      .join('\n\n')
  }

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
