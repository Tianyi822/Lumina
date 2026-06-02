import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PaperContextToolAdapter } from './PaperContextToolAdapter'

describe('PaperContextToolAdapter', () => {
  describe('enrichResult', () => {
    const adapter = new PaperContextToolAdapter()
    adapter.setPaperId('test-paper-123')

    it('成功的长内容结果应返回 high coverage', () => {
      const content =
        '## 摘要\n这是摘要内容部分，包含一些详细信息需要足够长以满足阈值要求。\n## 方法\n方法描述内容，需要足够长以满足阈值要求。这里添加更多内容来确保长度。\n## 结论\n结论部分，总结所有研究发现并提供未来工作方向。\n'.repeat(15)
      const result = adapter.enrichResult!('paper__search_context', {}, {
        success: true,
        content
      })
      assert.equal(result.coverage, 'high')
      assert.equal(result.sourceType, 'paper')
      assert.ok(result.confidence > 0.5)
    })

    it('简短内容应返回 low coverage 并给出建议', () => {
      const result = adapter.enrichResult!('paper__search_context', {}, {
        success: true,
        content: '短内容'
      })
      assert.equal(result.coverage, 'low')
      assert.ok(result.suggestion)
      assert.ok(result.suggestion!.includes('知识库'))
    })

    it('失败调用应返回 low coverage 且 confidence 为 0', () => {
      const result = adapter.enrichResult!('paper__search_context', {}, {
        success: false,
        error: '检索超时'
      })
      assert.equal(result.coverage, 'low')
      assert.equal(result.confidence, 0)
      assert.equal(result.sourceType, 'paper')
    })

    it('含列表项的结果应提取 keyFindings', () => {
      const content = '找到以下内容:\n- 第一条发现\n- 第二条发现\n- 第三条'
      const result = adapter.enrichResult!('paper__search_context', {}, {
        success: true,
        content
      })
      assert.ok(result.keyFindings.length >= 3)
    })

    it('sourceName 应为 paperId', () => {
      const result = adapter.enrichResult!('paper__search_context', {}, {
        success: true,
        content: 'test'
      })
      assert.equal(result.sourceName, 'test-paper-123')
    })
  })
})
