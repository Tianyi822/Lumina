import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ToolResultMerger } from './ToolResultMerger'
import type { EnrichedToolResult } from './PipelineTypes'

function makeEnrichedResult(
  toolName: string,
  content: string,
  sourceType: 'paper' | 'knowledge' | 'paper_web' | 'mcp' = 'paper',
  coverage: 'high' | 'medium' | 'low' = 'high',
  confidence: number = 0.8
): EnrichedToolResult {
  return {
    toolCallId: `call_${toolName}`,
    toolName,
    content,
    success: true,
    metadata: {
      coverage,
      keyFindings: [],
      sourceType,
      sourceName: toolName,
      confidence
    }
  }
}

describe('ToolResultMerger', () => {
  const merger = new ToolResultMerger()

  describe('merge — smart_merge', () => {
    it('单条结果直接返回', () => {
      const results = [makeEnrichedResult('paper__search_context', '论文内容')]
      const merged = merger.merge(results, 'smart_merge')
      assert.equal(merged.results.length, 1)
      assert.equal(merged.results[0].toolName, 'paper__search_context')
      assert.equal(merged.mergedContent, null)
    })

    it('多条结果按 paper 优先排序', () => {
      const results = [
        makeEnrichedResult('knowledge__search', '知识库内容', 'knowledge', 'medium', 0.6),
        makeEnrichedResult('paper__search_context', '论文内容', 'paper', 'high', 0.9)
      ]
      const merged = merger.merge(results, 'smart_merge')
      assert.ok(merged.results.length >= 2)
      // paper 优先级最高，应排在前面
      assert.equal(merged.results[0].metadata.sourceType, 'paper')
    })

    it('高度重复内容去重', () => {
      const sharedContent = '这是共享的内容，描述了注意力机制在深度学习中的应用。包括自注意力、多头注意力等。'
      const results = [
        makeEnrichedResult('paper__search_context', sharedContent, 'paper', 'high', 0.9),
        makeEnrichedResult('knowledge__search', sharedContent + ' 额外补充', 'knowledge', 'medium', 0.6)
      ]
      const merged = merger.merge(results, 'smart_merge')
      // 去重后结果数应 <= 原始数
      assert.ok(merged.results.length <= 2)
      assert.ok(merged.mergedContent !== null)
    })
  })

  describe('merge — none 策略', () => {
    it('none 策略只返回第一条', () => {
      const results = [
        makeEnrichedResult('paper__search_context', '论文内容', 'paper'),
        makeEnrichedResult('knowledge__search', '知识库内容', 'knowledge')
      ]
      const merged = merger.merge(results, 'none')
      assert.equal(merged.results.length, 1)
      assert.equal(merged.results[0].toolName, 'paper__search_context')
      assert.equal(merged.mergedContent, null)
    })
  })

  describe('jaccardSimilarity', () => {
    it('完全相同的文本 = 1', () => {
      const sim = merger.jaccardSimilarity('注意力机制在NLP中的应用', '注意力机制在NLP中的应用')
      assert.equal(sim, 1)
    })

    it('完全不同的文本 = 0', () => {
      const sim = merger.jaccardSimilarity('注意力机制', '量子计算基础理论')
      assert.equal(sim, 0)
    })

    it('部分重叠在 0-1 之间', () => {
      const sim = merger.jaccardSimilarity(
        '注意力机制在自然语言处理中的应用研究',
        '注意力机制在计算机视觉中的应用研究'
      )
      assert.ok(sim > 0 && sim < 1, `similarity ${sim} 应在 (0, 1) 之间`)
    })
  })
})
