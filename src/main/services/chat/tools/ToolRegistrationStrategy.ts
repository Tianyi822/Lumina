import { SESSION_TOOL_CONFIGS } from './SessionToolConfigs'
import { UnifiedToolRegistry } from './UnifiedToolRegistry'
import type { ToolRegistrationRule, RegistrationContext, SessionToolConfig, ToolPipeline } from './PipelineTypes'
import type { ToolStatsCollector } from './ToolStatsCollector'

/**
 * 工具注册策略
 * 根据会话类型查找对应的工具配置，动态计算优先级并构建注册表。
 * 支持基于历史使用频率调整优先级。
 */
export class ToolRegistrationStrategy {
  private statsCollector: ToolStatsCollector

  constructor(statsCollector: ToolStatsCollector) {
    this.statsCollector = statsCollector
  }

  /** 查找指定会话类型对应的工具配置 */
  findConfig(sessionType: string): SessionToolConfig {
    const config = SESSION_TOOL_CONFIGS.find((c) => c.sessionType === sessionType)
    return config ?? SESSION_TOOL_CONFIGS.find((c) => c.sessionType === 'default')!
  }

  /**
   * 根据历史统计动态计算工具优先级
   * 使用频率越高，优先级提升（数字越小越优先），提升上限 5 点
   */
  buildEffectivePriority(rule: ToolRegistrationRule): number {
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

  /** 获取指定会话类型的执行管道 */
  getPipeline(sessionType: string): ToolPipeline {
    return this.findConfig(sessionType).pipeline
  }

  /**
   * 根据上下文构建完整工具注册表
   * 遍历所有注册规则，满足条件时加载适配器并批量注册工具
   */
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
