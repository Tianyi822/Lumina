import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ToolResultEnricher } from './ToolResultEnricher'

describe('ToolResultEnricher', () => {
  const enricher = new ToolResultEnricher()

  describe('defaultEnrich', () => {
    it('长内容多段落 → high coverage', () => {
      const content =
        '## 简介\n这是简介内容部分，包含一些详细信息。\n## 方法\n方法描述内容，需要足够长以满足阈值要求。\n## 结论\n结论部分，总结所有研究发现。\n'.repeat(15)
      const result = enricher.defaultEnrich('test__tool', {
        success: true,
        content
      })
      assert.equal(result.coverage, 'high')
      assert.equal(result.sourceType, 'mcp')
      assert.ok(result.confidence > 0.5)
      assert.ok(result.keyFindings.length >= 0)
    })

    it('短内容 → low coverage', () => {
      const result = enricher.defaultEnrich('test__tool', {
        success: true,
        content: '简短结果'
      })
      assert.equal(result.coverage, 'low')
      assert.ok(result.confidence < 0.5)
    })

    it('中等内容 → medium coverage', () => {
      const content = '## 摘要\n' + 'x'.repeat(400)
      const result = enricher.defaultEnrich('test__tool', {
        success: true,
        content
      })
      assert.equal(result.coverage, 'medium')
    })

    it('失败调用 → low + confidence=0', () => {
      const result = enricher.defaultEnrich('test__tool', {
        success: false,
        error: '连接失败'
      })
      assert.equal(result.coverage, 'low')
      assert.equal(result.confidence, 0)
    })
  })

  describe('extractKeyFindings', () => {
    it('提取 Markdown 列表项', () => {
      const content = '- item1\n- item2\n• item3'
      const findings = enricher.extractKeyFindings(content)
      assert.equal(findings.length, 3)
      assert.ok(findings.includes('- item1'))
      assert.ok(findings.includes('- item2'))
      assert.ok(findings.includes('• item3'))
    })

    it('超过 5 条截断', () => {
      const content = Array.from({ length: 8 }, (_, i) => `- item${i + 1}`).join('\n')
      const findings = enricher.extractKeyFindings(content)
      assert.equal(findings.length, 5)
    })

    it('无列表项返回空数组', () => {
      const content = '这是普通文本，没有列表。'
      const findings = enricher.extractKeyFindings(content)
      assert.equal(findings.length, 0)
    })
  })

  describe('inferCategory', () => {
    it('paper__search_context → paper', () => {
      assert.equal(enricher.inferCategory('paper__search_context'), 'paper')
    })

    it('knowledge__search → knowledge', () => {
      assert.equal(enricher.inferCategory('knowledge__search'), 'knowledge')
    })

    it('paper__read_page → paper', () => {
      assert.equal(enricher.inferCategory('paper__read_page'), 'paper')
    })

    it('paper_web__search → paper_web', () => {
      assert.equal(enricher.inferCategory('paper_web__search'), 'paper_web')
    })

    it('myserver__tool → mcp', () => {
      assert.equal(enricher.inferCategory('myserver__tool'), 'mcp')
    })

    it('未知前缀 → mcp', () => {
      assert.equal(enricher.inferCategory('unknown_tool'), 'mcp')
    })
  })

  describe('enrich', () => {
    it('成功结果应调用 defaultEnrich 并返回 EnrichedToolResult', () => {
      const content = '## 摘要\n论文内容摘要，详细描述了研究背景和主要发现。\n## 方法\n方法部分，包含了实验设计和数据分析流程的完整说明。\n## 结论\n结论部分，总结了所有研究发现并提出了未来工作方向。\n'.repeat(15)
      const result = enricher.enrich('call_1', 'paper__search_context', {
        success: true,
        content
      })
      assert.ok(result.success)
      assert.equal(result.toolCallId, 'call_1')
      assert.equal(result.toolName, 'paper__search_context')
      assert.ok(result.metadata)
      assert.equal(result.metadata.coverage, 'high')
      assert.equal(result.metadata.sourceType, 'paper')
    })

    it('失败结果 enrich 仍返回 success=false + low coverage', () => {
      const result = enricher.enrich('call_2', 'knowledge__search', {
        success: false,
        error: '超时'
      })
      assert.equal(result.success, false)
      assert.equal(result.metadata.coverage, 'low')
      assert.equal(result.metadata.confidence, 0)
    })
  })
})
