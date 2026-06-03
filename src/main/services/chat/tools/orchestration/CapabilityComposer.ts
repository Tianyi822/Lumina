import { UnifiedToolRegistry } from '../UnifiedToolRegistry'
import type { CapabilityComposition, ToolPipeline, ToolCategory } from '../PipelineTypes'
import type { CapabilityRegistry } from '../capabilities/CapabilityRegistry'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { CapabilityUnit } from '../capabilities/CapabilityUnit'
import { DynamicPipelineBuilder } from './DynamicPipelineBuilder'

export interface CompositionResult {
  toolRegistry: UnifiedToolRegistry
  pipeline: ToolPipeline
  adapters: Map<string, ToolAdapter>
}

export class CapabilityComposer {
  private pipelineBuilder = new DynamicPipelineBuilder()
  private capabilityRegistry: CapabilityRegistry

  constructor(capabilityRegistry: CapabilityRegistry) {
    this.capabilityRegistry = capabilityRegistry
  }

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
