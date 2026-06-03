import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistrationStrategy } from './ToolRegistrationStrategy'
import type { ToolRegistrationRule } from './PipelineTypes'
import type { ToolStatsSummary } from '@shared/types/tool-stats'
import type { ToolCategory } from './UnifiedToolRegistry'

type ToolStatsCollectorArg = ConstructorParameters<typeof ToolRegistrationStrategy>[0]
type FakeStatsCollector = Pick<ToolStatsCollectorArg, 'getCategoryStats'>

function createStrategy(stats: ToolStatsSummary[] = []): ToolRegistrationStrategy {
  const collector: FakeStatsCollector = {
    getCategoryStats: () => stats
  }
  return new ToolRegistrationStrategy(collector as unknown as ToolStatsCollectorArg)
}

function makeStats(
  serverName: string,
  totalCalls: number,
  successRate: number
): ToolStatsSummary {
  return {
    toolName: `${serverName}__tool`,
    serverName,
    totalCalls,
    successRate,
    avgDurationMs: 100,
    p50DurationMs: 100,
    p95DurationMs: 200,
    lastCalledAt: new Date(),
    errorCount: totalCalls - Math.floor(totalCalls * successRate),
    topErrors: []
  }
}

describe('ToolRegistrationStrategy', () => {
  describe('findConfig', () => {
    const strategy = createStrategy()

    it('paper 会话类型返回 paper 配置', () => {
      const config = strategy.findConfig('paper')
      assert.equal(config.sessionType, 'paper')
    })

    it('unknown 会话类型回退到 default 配置', () => {
      const config = strategy.findConfig('unknown-type')
      assert.equal(config.sessionType, 'default')
    })

    it('空字符串回退到 default', () => {
      const config = strategy.findConfig('')
      assert.equal(config.sessionType, 'default')
    })
  })

  describe('buildEffectivePriority', () => {
    it('无统计数据时返回基础优先级', () => {
      const strategy = createStrategy()
      const priority = strategy.buildEffectivePriority({ basePriority: 20 } as ToolRegistrationRule)
      assert.equal(priority, 20)
    })

    it('高频工具 → 优先级降低（惩罚机制）', () => {
      const strategy = createStrategy([makeStats('knowledge', 100, 0.95)])
      const priority = strategy.buildEffectivePriority(
        { basePriority: 20, category: 'knowledge' as ToolCategory } as ToolRegistrationRule
      )
      assert.ok(priority < 20, `高频工具优先级 ${priority} 应小于基础优先级 20`)
    })

    it('低频成功工具 → 优先级接近基础值', () => {
      const strategy = createStrategy([makeStats('knowledge', 1, 1.0)])
      const priority = strategy.buildEffectivePriority(
        { basePriority: 20, category: 'knowledge' as ToolCategory } as ToolRegistrationRule
      )
      assert.ok(priority >= 19, `低频工具优先级 ${priority} 应接近 20`)
    })

    it('零调用次数的统计不应影响优先级', () => {
      const strategy = createStrategy([makeStats('knowledge', 0, 1.0)])
      const priority = strategy.buildEffectivePriority(
        { basePriority: 20, category: 'knowledge' as ToolCategory } as ToolRegistrationRule
      )
      assert.equal(priority, 20)
    })
  })

  describe('getPipeline', () => {
    it('paper 会话返回非空管道', () => {
      const strategy = createStrategy()
      const pipeline = strategy.getPipeline('paper')
      assert.ok(pipeline.stages.length > 0)
    })

    it('default 会话返回空管道', () => {
      const strategy = createStrategy()
      const pipeline = strategy.getPipeline('default')
      assert.equal(pipeline.stages.length, 0)
    })
  })
})
