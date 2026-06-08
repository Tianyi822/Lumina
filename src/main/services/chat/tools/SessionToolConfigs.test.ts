import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_TOOL_CONFIGS } from './SessionToolConfigs'
import type { AdapterRegistry, RegistrationContext } from './PipelineTypes'
import type { ChatRequest } from '../../../types/chat'

const emptyAdapters = {} as unknown as AdapterRegistry

function makeChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    messages: [],
    modelKey: 'test-model',
    sessionId: 's1',
    ...overrides
  }
}

function makeRegistrationContext(
  overrides: Partial<RegistrationContext> = {}
): RegistrationContext {
  return {
    request: makeChatRequest(),
    sessionId: 's1',
    selectedKnowledgeBases: [],
    selectedTools: [],
    adapters: emptyAdapters,
    ...overrides
  }
}

describe('SESSION_TOOL_CONFIGS', () => {
  it('应包含 paper 和 default 两种配置', () => {
    const types = SESSION_TOOL_CONFIGS.map((c) => c.sessionType)
    assert.ok(types.includes('paper'))
    assert.ok(types.includes('default'))
  })

  describe('paper 配置', () => {
    const paper = SESSION_TOOL_CONFIGS.find((c) => c.sessionType === 'paper')!

    it('管道 stages 不应为空', () => {
      assert.ok(paper.pipeline.stages.length > 0)
    })

    it('第一个 stage 应为 paper 且 required', () => {
      const first = paper.pipeline.stages[0]
      assert.equal(first.category, 'paper')
      assert.equal(first.execution, 'required')
    })

    it('管道不应自动编排 knowledge 搜索', () => {
      assert.equal(
        paper.pipeline.stages.some((stage) => stage.category === 'knowledge'),
        false
      )
    })

    it('单一论文阶段无需结果融合', () => {
      assert.equal(paper.pipeline.mergeStrategy, 'none')
    })

    it('toolRules 应包含 paper、knowledge、paper_web、mcp、lab 规则', () => {
      const categories = paper.toolRules.map((r) => r.category)
      assert.ok(categories.includes('paper'))
      assert.ok(categories.includes('knowledge'))
      assert.ok(categories.includes('paper_web'))
      assert.ok(categories.includes('mcp'))
      assert.ok(categories.includes('lab'))
    })

    it('paper 规则优先级应最高（basePriority 最小）', () => {
      const sorted = [...paper.toolRules].sort((a, b) => a.basePriority - b.basePriority)
      assert.equal(sorted[0].category, 'paper')
    })

    it('knowledge 规则在仅有 paperId 时 condition 返回 false', () => {
      const knowledgeRule = paper.toolRules.find((r) => r.category === 'knowledge')!
      assert.equal(
        knowledgeRule.condition(
          makeRegistrationContext({
            request: makeChatRequest({ paperId: 'p1' })
          })
        ),
        false
      )
    })

    it('knowledge 规则无需 paperId、有知识库时 condition 返回 true', () => {
      const knowledgeRule = paper.toolRules.find((r) => r.category === 'knowledge')!
      assert.ok(
        knowledgeRule.condition(
          makeRegistrationContext({
            selectedKnowledgeBases: [{ id: 'kb-1', name: 'KB', documentCount: 1 }]
          })
        )
      )
    })

    it('knowledge 规则无 paperId 也无知识库时 condition 返回 false', () => {
      const knowledgeRule = paper.toolRules.find((r) => r.category === 'knowledge')!
      assert.equal(knowledgeRule.condition(makeRegistrationContext()), false)
    })
  })

  describe('default 配置', () => {
    const def = SESSION_TOOL_CONFIGS.find((c) => c.sessionType === 'default')!

    it('管道 stages 应为空', () => {
      assert.equal(def.pipeline.stages.length, 0)
    })

    it('toolRules 应包含 knowledge、mcp、lab 规则', () => {
      const categories = def.toolRules.map((r) => r.category)
      assert.ok(categories.includes('knowledge'))
      assert.ok(categories.includes('mcp'))
      assert.ok(categories.includes('lab'))
    })

    it('toolRules 不应包含 paper 和 paper_web', () => {
      const categories = def.toolRules.map((r) => r.category)
      assert.ok(!categories.includes('paper'))
      assert.ok(!categories.includes('paper_web'))
    })
  })
})
