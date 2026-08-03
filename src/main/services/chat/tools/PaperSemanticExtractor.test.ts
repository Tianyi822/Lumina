import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PaperSemanticExtractor } from './PaperSemanticExtractor'

describe('PaperSemanticExtractor', () => {
  const extractor = new PaperSemanticExtractor()

  describe('extractKeywords', () => {
    it('英文标题应过滤停用词并返回有效关键词', () => {
      const keywords = extractor.extractKeywords('Attention Is All You Need')
      assert.ok(!keywords.includes('Is'))
      assert.ok(!keywords.includes('All'))
      assert.ok(!keywords.includes('You'))
      assert.ok(keywords.includes('Attention'))
      assert.ok(keywords.includes('Need'))
    })

    it('中文标题应按虚词分段后提取 2-4 字组合', () => {
      const keywords = extractor.extractKeywords('基于深度学习的自然语言处理研究')
      assert.ok(keywords.length > 0)
      // "深度学习" 和 "自然语言处理" 应作为有意义的片段出现
      assert.ok(keywords.some((k) => k.includes('深度') || k.includes('学习')))
      assert.ok(keywords.some((k) => k.includes('自然') || k.includes('语言')))
      // "的" 作为虚词应被切分，不应出现包含它的片段
      assert.ok(!keywords.some((k) => k.includes('的')))
    })

    it('混合标题应同时提取中英文关键词', () => {
      const keywords = extractor.extractKeywords('基于 Transformer 的 BERT 预训练模型')
      const hasChinese = keywords.some((k) => /[一-鿿]/.test(k))
      const hasEnglish = keywords.some((k) => /^[a-zA-Z]/.test(k))
      assert.ok(hasChinese, '应包含中文关键词')
      assert.ok(hasEnglish, '应包含英文关键词')
    })

    it('空标题应返回空数组', () => {
      const keywords = extractor.extractKeywords('')
      assert.deepEqual(keywords, [])
    })

    it('中文虚词不应出现在结果中', () => {
      const keywords = extractor.extractKeywords('关于人工智能的研究与应用')
      assert.ok(!keywords.some((k) => k.includes('关于')))
      assert.ok(!keywords.some((k) => k.includes('的')))
      assert.ok(!keywords.some((k) => k.includes('与')))
      // 有意义的片段应保留
      assert.ok(keywords.some((k) => k.includes('人工智能') || k.includes('人工智')))
    })

    it('纯英文论文标题应正常提取', () => {
      const keywords = extractor.extractKeywords('Deep Residual Learning for Image Recognition')
      assert.ok(keywords.includes('Deep'))
      assert.ok(keywords.includes('Residual'))
      assert.ok(keywords.includes('Learning'))
      assert.ok(keywords.includes('Image'))
      assert.ok(keywords.includes('Recognition'))
      assert.ok(!keywords.includes('for'))
    })
  })

  describe('extract', () => {
    it('有效论文应返回完整语义上下文', async () => {
      const result = await extractor.extract('paper-1', {
        title: 'Attention Is All You Need',
        abstract: 'We propose a new network architecture based on attention mechanisms.'
      })

      assert.equal(result.paperId, 'paper-1')
      assert.equal(result.title, 'Attention Is All You Need')
      assert.ok(result.keywords.length > 0)
      assert.ok(result.abstract)
    })

    it('null 论文应返回默认值', async () => {
      const result = await extractor.extract('paper-2', null)

      assert.equal(result.paperId, 'paper-2')
      assert.equal(result.title, '')
      assert.deepEqual(result.keywords, [])
    })

    it('中文论文应正确提取关键词且无 domain 字段', async () => {
      const result = await extractor.extract('paper-3', {
        title: '量子计算在密码学中的应用研究',
        abstract: '本文探讨了量子计算对传统密码学的影响。'
      })

      assert.equal(result.paperId, 'paper-3')
      assert.ok(result.keywords.length > 0)
      assert.ok(result.keywords.some((k) => k.includes('量子') || k.includes('密码学')))
    })
  })
})
