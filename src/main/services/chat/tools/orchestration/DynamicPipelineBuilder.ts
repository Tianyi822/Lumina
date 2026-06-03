import type {
  CompositionStage,
  CapabilityComposition,
  ToolPipeline,
  PipelineStage
} from '../PipelineTypes'
import type { ToolCategory } from '../UnifiedToolRegistry'

export class DynamicPipelineBuilder {
  build(composition: CapabilityComposition): ToolPipeline {
    const stages: PipelineStage[] = composition.stages
      .filter((stage) => stage.mode !== 'on_demand')
      .map((stage) => this.toPipelineStage(stage))

    return {
      stages,
      mergeStrategy: composition.mergeStrategy
    }
  }

  private toPipelineStage(stage: CompositionStage): PipelineStage {
    return {
      category: stage.capabilityId as ToolCategory,
      execution: stage.mode === 'conditional' ? 'conditional' : 'required',
      condition: stage.condition,
      autoTrigger: stage.autoTrigger
    }
  }
}
