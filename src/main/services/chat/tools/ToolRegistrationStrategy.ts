import { SESSION_TOOL_CONFIGS } from './SessionToolConfigs'
import { UnifiedToolRegistry } from './UnifiedToolRegistry'
import type { ToolRegistrationRule, RegistrationContext, SessionToolConfig, ToolPipeline } from './PipelineTypes'
import type { ToolStatsCollector } from './ToolStatsCollector'

export class ToolRegistrationStrategy {
  private statsCollector: ToolStatsCollector

  constructor(statsCollector: ToolStatsCollector) {
    this.statsCollector = statsCollector
  }

  findConfig(sessionType: string): SessionToolConfig {
    const config = SESSION_TOOL_CONFIGS.find((c) => c.sessionType === sessionType)
    return config ?? SESSION_TOOL_CONFIGS.find((c) => c.sessionType === 'default')!
  }

  buildEffectivePriority(rule: ToolRegistrationRule, _sessionId: string): number {
    const allStats = this.statsCollector.getCategoryStats(rule.category)

    if (allStats.length === 0) return rule.basePriority

    const totalSuccessfulCalls = allStats.reduce(
      (sum, s) => sum + s.totalCalls * s.successRate,
      0
    )

    if (totalSuccessfulCalls === 0) return rule.basePriority

    // 每 30 次成功调用增加 1 点优先级提升（数字越低，优先级越高），上限 5
    const boost = Math.min(Math.floor(totalSuccessfulCalls / 30), 5)
    return rule.basePriority - boost
  }

  getPipeline(sessionType: string): ToolPipeline {
    return this.findConfig(sessionType).pipeline
  }

  async buildToolRegistry(context: RegistrationContext): Promise<UnifiedToolRegistry> {
    const config = this.findConfig(context.request.sessionType ?? 'default')
    const registry = new UnifiedToolRegistry()

    for (const rule of config.toolRules) {
      if (!rule.condition(context)) continue

      const adapter = rule.adapterResolver(context)
      if (!adapter) continue

      rule.configureAdapter?.(adapter, context)

      const tools = await adapter.getTools()
      registry.registerBatch(tools, adapter, rule.category)
    }

    return registry
  }
}
