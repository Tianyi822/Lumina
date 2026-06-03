import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { KnowledgeToolAdapter } from './KnowledgeToolAdapter'

describe('KnowledgeToolAdapter', () => {
  describe('enrichResult', () => {
    const adapter = new KnowledgeToolAdapter(['kb-1', 'kb-2'])

    it('多来源命中 + 长内容应返回 high coverage', () => {
      const content =
        '[来源: doc1]\n内容\n[来源: doc2]\n内容\n[来源: doc3]\n内容\n' + 'x'.repeat(800)
      const result = adapter.enrichResult!('knowledge__search', {}, {
        success: true,
        content
      })
      assert.equal(result.coverage, 'high')
      assert.equal(result.sourceType, 'knowledge')
      assert.equal(result.sourceName, 'kb-1, kb-2')
    })

    it('单来源命中 + 中等内容 → medium coverage', () => {
      const content = '[来源: doc1]\n' + 'x'.repeat(300)
      const result = adapter.enrichResult!('knowledge__search', {}, {
        success: true,
        content
      })
      assert.equal(result.coverage, 'medium')
    })

    it('无来源命中 → low coverage', () => {
      const content = '没有匹配结果'
      const result = adapter.enrichResult!('knowledge__search', {}, {
        success: true,
        content
      })
      assert.equal(result.coverage, 'low')
      assert.equal(result.confidence, 0.25)
    })

    it('失败调用 → low coverage + confidence=0', () => {
      const result = adapter.enrichResult!('knowledge__search', {}, {
        success: false,
        error: '连接失败'
      })
      assert.equal(result.coverage, 'low')
      assert.equal(result.confidence, 0)
    })
  })

  describe('setSemanticContext', () => {
    it('setSemanticContext 方法应存在且可调用', () => {
      const adapter = new KnowledgeToolAdapter()
      adapter.setSemanticContext({
        paperId: 'paper-1',
        title: '测试论文',
        keywords: ['attention', 'transformer']
      })
    })

    it('setSemanticContext(undefined) 清除语义上下文', () => {
      const adapter = new KnowledgeToolAdapter()
      adapter.setSemanticContext({
        paperId: 'paper-1',
        title: '测试',
        keywords: ['test']
      })
      adapter.setSemanticContext(undefined)
    })
  })
})
