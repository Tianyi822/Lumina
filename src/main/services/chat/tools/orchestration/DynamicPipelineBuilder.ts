import type {
  CompositionStage,
  CapabilityComposition,
  ToolPipeline,
  PipelineStage
} from '../PipelineTypes'
import type { ToolCategory } from '../UnifiedToolRegistry'

/**
 * 动态管道构建器
 * 将能力编排定义（CapabilityComposition）转换为可执行的 ToolPipeline
 */
export class DynamicPipelineBuilder {
  /**
   * 根据能力编排定义构建执行管道
   * 过滤掉 mode 为 on_demand 的阶段，仅包含 required 和 conditional 阶段
   * @param composition 能力编排定义
   * @returns 可执行的工具管道
   */
  build(composition: CapabilityComposition): ToolPipeline {
    const stages: PipelineStage[] = composition.stages
      .filter((stage) => stage.mode !== 'on_demand')
      .map((stage) => this.toPipelineStage(stage))

    return {
      stages,
      mergeStrategy: composition.mergeStrategy
    }
  }

  /** 将能力编排阶段转换为管道阶段（过滤 on_demand 模式） */
  private toPipelineStage(stage: CompositionStage): PipelineStage {
    return {
      category: stage.capabilityId as ToolCategory,
      execution: stage.mode === 'conditional' ? 'conditional' : 'required',
      condition: stage.condition,
      autoTrigger: stage.autoTrigger
    }
  }
}
