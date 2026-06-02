import type { WebContents } from 'electron'
import type {
  ToolPipeline,
  PipelineStage,
  PipelineContext,
  OrchestrationResult,
  EnrichedToolResult,
  ToolCategory
} from './PipelineTypes'
import type { ToolCallDefinition, ToolExecutionResult, ToolExecutionSummary } from './UnifiedToolExecutor'
import type { UnifiedToolRegistry } from './UnifiedToolRegistry'
import type { StreamEvent } from '../../../types/chat'
import { ToolResultEnricher } from './ToolResultEnricher'
import { ToolResultMerger } from './ToolResultMerger'

type ExecuteToolCallsFn = (
  toolCalls: ToolCallDefinition[],
  webContents: WebContents,
  sessionId: string,
  messages: unknown[],
  turnId?: string
) => Promise<ToolExecutionSummary>

export interface ToolOrchestratorOptions {
  registry: UnifiedToolRegistry
  enricher: ToolResultEnricher
  merger: ToolResultMerger
  executeToolCalls: ExecuteToolCallsFn
  sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
}

export class ToolOrchestrator {
  private registry: UnifiedToolRegistry
  private enricher: ToolResultEnricher
  private merger: ToolResultMerger
  private executeToolCalls: ExecuteToolCallsFn

  constructor(options: ToolOrchestratorOptions) {
    this.registry = options.registry
    this.enricher = options.enricher
    this.merger = options.merger
    this.executeToolCalls = options.executeToolCalls
  }

  async orchestrate(
    toolCalls: ToolCallDefinition[],
    pipeline: ToolPipeline,
    context: PipelineContext,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): Promise<OrchestrationResult> {
    const allResults: ToolExecutionResult[] = []
    let stagesExecuted = 0
    const autoTriggered: string[] = []
    const handledCallIds = new Set<string>()

    for (const stage of pipeline.stages) {
      let stageCalls = this.filterByCategory(toolCalls, stage.category)
      let isAutoTriggered = false

      // 条件阶段的自动触发：模型未调用该类别工具时检查是否应自动触发
      if (stageCalls.length === 0 && stage.autoTrigger) {
        const shouldAutoTrigger =
          stage.execution === 'required' ||
          (stage.condition ? stage.condition(context) : true)

        if (shouldAutoTrigger) {
          const autoCall = this.createAutoTriggerCall(stage, context.originalQuery, context)
          stageCalls = [autoCall]
          autoTriggered.push(autoCall.function.name)
          isAutoTriggered = true
        }
      }

      if (stageCalls.length === 0) continue

      // 条件阶段：仅对模型自行调用的工具检查 condition（auto-trigger 已在上方检查过）
      if (stage.execution === 'conditional' && stage.condition && !isAutoTriggered) {
        if (!stage.condition(context)) continue
      }

      // 执行
      const summary = await this.executeToolCalls(
        stageCalls,
        webContents,
        sessionId,
        [],
        turnId
      )

      for (const call of stageCalls) {
        handledCallIds.add(call.id)
      }

      // 增强结果并存入上下文
      const enriched = this.enrichResults(summary.results)
      context.stageResults.set(stage.category, enriched)

      allResults.push(...summary.results)
      stagesExecuted++
    }

    // 未被管道覆盖的工具调用直接执行
    const unhandled = toolCalls.filter((c) => !handledCallIds.has(c.id))
    if (unhandled.length > 0) {
      const summary = await this.executeToolCalls(
        unhandled,
        webContents,
        sessionId,
        [],
        turnId
      )
      allResults.push(...summary.results)
    }

    // 结果融合
    let merged = false
    let mergedContent: string | null = null
    const mergeStrategy = pipeline.mergeStrategy
    if (mergeStrategy && mergeStrategy !== 'none' && allResults.length > 1) {
      const enriched = this.enrichResults(allResults)
      const mergeOutput = this.merger.merge(enriched, mergeStrategy)
      if (mergeOutput.mergedContent) {
        merged = true
        mergedContent = mergeOutput.mergedContent
      }
    }

    return {
      results: allResults,
      mergedContent,
      metadata: { stagesExecuted, autoTriggered, merged }
    }
  }

  private filterByCategory(
    calls: ToolCallDefinition[],
    category: ToolCategory
  ): ToolCallDefinition[] {
    return calls.filter((call) => {
      const tool = this.registry.getTool(call.function.name)
      return tool?.category === category
    })
  }

  private createAutoTriggerCall(
    stage: PipelineStage,
    originalQuery: string,
    context: PipelineContext
  ): ToolCallDefinition {
    const toolName =
      stage.autoTrigger!.toolName.includes('__')
        ? stage.autoTrigger!.toolName
        : `${stage.category}__${stage.autoTrigger!.toolName}`

    const args = stage.autoTrigger!.queryTransform(originalQuery, context)

    return {
      id: `auto_${stage.category}_${Date.now()}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args)
      }
    }
  }

  private enrichResults(results: ToolExecutionResult[]): EnrichedToolResult[] {
    return results.map((r) =>
      this.enricher.enrich(r.toolCallId, r.toolName, {
        success: r.success,
        content: r.content,
        error: r.error
      })
    )
  }
}
