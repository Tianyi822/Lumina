import { UnifiedToolRegistry } from '../UnifiedToolRegistry'
import type { CapabilityComposition, ToolPipeline, ToolCategory } from '../PipelineTypes'
import type { CapabilityRegistry } from '../capabilities/CapabilityRegistry'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { CapabilityUnit } from '../capabilities/CapabilityUnit'
import { DynamicPipelineBuilder } from './DynamicPipelineBuilder'

/** 能力组合的结果 */
export interface CompositionResult {
  /** 组合好的工具注册表 */
  toolRegistry: UnifiedToolRegistry
  /** 对应的执行管道 */
  pipeline: ToolPipeline
  /** 各能力对应的适配器实例 */
  adapters: Map<string, ToolAdapter>
}

/**
 * 能力组合器
 * 将一组活跃能力按编排定义组合成统一的工具注册表和执行管道
 */
export class CapabilityComposer {
  private pipelineBuilder = new DynamicPipelineBuilder()
  private capabilityRegistry: CapabilityRegistry

  constructor(capabilityRegistry: CapabilityRegistry) {
    this.capabilityRegistry = capabilityRegistry
  }

  /**
   * 组合指定能力，生成统一工具注册表和管道
   * @param activeCapabilities 活跃能力 ID 列表
   * @param composition 能力编排定义
   * @param context 上下文数据
   * @returns 组合结果；无工具时返回 null
   */
  async compose(
    activeCapabilities: string[],
    composition: CapabilityComposition,
    context: unknown
  ): Promise<CompositionResult | null> {
    const registry = new UnifiedToolRegistry()
    const adapters = new Map<string, ToolAdapter>()

    for (const capId of activeCapabilities) {
      const unit = this.capabilityRegistry.get(capId)
      if (!unit) continue

      const adapter = unit.createAdapter(context)
      if (!adapter) continue

      adapters.set(capId, adapter)

      const tools = await adapter.getTools()
      registry.registerBatch(tools, adapter, capId as ToolCategory)
    }

    const pipeline = this.pipelineBuilder.build(composition)

    if (registry.size === 0) return null

    return { toolRegistry: registry, pipeline, adapters }
  }

  /**
   * 获取可推荐给用户启用的能力列表
   * 排除已激活且条件满足的能力
   */
  getSuggestableCapabilities(
    activeCapabilities: string[],
    context: unknown
  ): CapabilityUnit[] {
    return this.capabilityRegistry.getAll().filter((unit) => {
      if (activeCapabilities.includes(unit.id)) return false
      return unit.createAdapter(context) !== null
    })
  }
}
