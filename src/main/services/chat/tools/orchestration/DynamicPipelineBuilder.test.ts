import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DynamicPipelineBuilder } from './DynamicPipelineBuilder'
import type { CapabilityComposition } from '../PipelineTypes'

describe('DynamicPipelineBuilder', () => {
  const builder = new DynamicPipelineBuilder()

  it('空组合生成空管道', () => {
    const pipeline = builder.build({ stages: [] })
    assert.equal(pipeline.stages.length, 0)
    assert.equal(pipeline.mergeStrategy, undefined)
  })

  it('required 阶段正确映射', () => {
    const composition: CapabilityComposition = {
      stages: [{ capabilityId: 'paper', mode: 'required' }]
    }
    const pipeline = builder.build(composition)
    assert.equal(pipeline.stages.length, 1)
    assert.equal(pipeline.stages[0].category, 'paper')
    assert.equal(pipeline.stages[0].execution, 'required')
  })

  it('conditional 阶段保留 condition 和 autoTrigger', () => {
    const condition = () => true
    const autoTrigger = {
      toolName: 'search',
      queryTransform: (q: string) => ({ query: q })
    }
    const composition: CapabilityComposition = {
      stages: [
        { capabilityId: 'paper', mode: 'required' },
        {
          capabilityId: 'knowledge',
          mode: 'conditional',
          condition,
          autoTrigger
        }
      ],
      mergeStrategy: 'smart_merge'
    }
    const pipeline = builder.build(composition)
    assert.equal(pipeline.stages.length, 2)
    assert.equal(pipeline.stages[1].category, 'knowledge')
    assert.equal(pipeline.stages[1].execution, 'conditional')
    assert.equal(pipeline.stages[1].condition, condition)
    assert.equal(pipeline.stages[1].autoTrigger, autoTrigger)
    assert.equal(pipeline.mergeStrategy, 'smart_merge')
  })

  it('on_demand 阶段被过滤掉', () => {
    const composition: CapabilityComposition = {
      stages: [
        { capabilityId: 'paper', mode: 'required' },
        { capabilityId: 'lab', mode: 'on_demand' }
      ]
    }
    const pipeline = builder.build(composition)
    assert.equal(pipeline.stages.length, 1)
    assert.equal(pipeline.stages[0].category, 'paper')
  })

  it('所有阶段都是 on_demand 时生成空管道', () => {
    const composition: CapabilityComposition = {
      stages: [
        { capabilityId: 'lab', mode: 'on_demand' },
        { capabilityId: 'mcp', mode: 'on_demand' }
      ]
    }
    const pipeline = builder.build(composition)
    assert.equal(pipeline.stages.length, 0)
  })
})
