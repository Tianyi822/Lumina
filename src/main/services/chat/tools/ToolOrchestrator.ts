import { createHash } from 'crypto'
import type { WebContents } from 'electron'
import type {
  ToolPipeline,
  PipelineStage,
  PipelineContext,
  OrchestrationResult,
  EnrichedToolResult,
  ToolCategory
} from './PipelineTypes'
import type {
  ToolCallDefinition,
  ToolExecutionResult,
  ToolExecutionSummary
} from './UnifiedToolExecutor'
import type { UnifiedToolRegistry } from './UnifiedToolRegistry'
import type { StreamEvent } from '../../../types/chat'
import { ToolResultEnricher } from './ToolResultEnricher'
import { ToolResultMerger } from './ToolResultMerger'

/** 执行一组工具调用并返回摘要的函数签名 */
type ExecuteToolCallsFn = (
  toolCalls: ToolCallDefinition[],
  webContents: WebContents,
  sessionId: string,
  messages: unknown[],
  turnId?: string
) => Promise<ToolExecutionSummary>

/** ToolOrchestrator 构造选项 */
export interface ToolOrchestratorOptions {
  /** 工具注册表 */
  registry: UnifiedToolRegistry
  /** 结果增强器 */
  enricher: ToolResultEnricher
  /** 结果合并器 */
  merger: ToolResultMerger
  /** 工具执行函数 */
  executeToolCalls: ExecuteToolCallsFn
  /** 流事件发送函数 */
  sendStreamEvent: (webContents: WebContents, event: StreamEvent) => void
}

/**
 * 工具编排器
 * 按照管道（pipeline）定义的分阶段策略执行工具调用，
 * 支持条件触发、自动触发、结果增强与融合。
 */
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

  /**
   * 按管道分阶段编排执行工具调用
   * 遍历 pipe 各阶段：过滤工具 → 检查条件 → 自动触发 → 执行 → 增强结果 → 合并结果
   * @param toolCalls 模型本次调用的所有工具
   * @param pipeline 分阶段管道定义
   * @param context 管道执行上下文
   * @param webContents Electron WebContents
   * @param sessionId 会话标识
   * @param turnId 本轮消息标识
   */
  async orchestrate(
    toolCalls: ToolCallDefinition[],
    pipeline: ToolPipeline,
    context: PipelineContext,
    webContents: WebContents,
    sessionId: string,
    turnId?: string
  ): Promise<OrchestrationResult> {
    const allResults: ToolExecutionResult[] = []
    const executedToolCalls: ToolCallDefinition[] = []
    let stagesExecuted = 0
    const autoTriggered: string[] = []
    const handledCallIds = new Set<string>()
    let needUserInteraction = false

    for (const stage of pipeline.stages) {
      let stageCalls = this.filterByCategory(toolCalls, stage.category)
      let isAutoTriggered = false

      // 条件阶段的自动触发：模型未调用该类别工具时检查是否应自动触发
      if (stageCalls.length === 0 && stage.autoTrigger) {
        const shouldAutoTrigger =
          stage.execution === 'required' || (stage.condition ? stage.condition(context) : true)

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
      const summary = await this.executeToolCalls(stageCalls, webContents, sessionId, [], turnId)
      if (summary.needUserInteraction) {
        needUserInteraction = true
      }
      this.appendExecutedToolCalls(executedToolCalls, stageCalls, summary.results)

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
      const summary = await this.executeToolCalls(unhandled, webContents, sessionId, [], turnId)
      if (summary.needUserInteraction) {
        needUserInteraction = true
      }
      this.appendExecutedToolCalls(executedToolCalls, unhandled, summary.results)
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
      executedToolCalls,
      mergedContent,
      needUserInteraction,
      metadata: { stagesExecuted, autoTriggered, merged }
    }
  }

  /** 按类别过滤本次调用的工具列表 */
  private filterByCategory(
    calls: ToolCallDefinition[],
    category: ToolCategory
  ): ToolCallDefinition[] {
    return calls.filter((call) => {
      const tool = this.registry.getTool(call.function.name)
      return tool?.category === category
    })
  }

  /**
   * 创建自动触发的工具调用定义
   * 当模型未调用某类工具但管道配置了自动触发时，生成一次虚拟调用
   */
  private createAutoTriggerCall(
    stage: PipelineStage,
    originalQuery: string,
    context: PipelineContext
  ): ToolCallDefinition {
    const toolName = stage.autoTrigger!.toolName.includes('__')
      ? stage.autoTrigger!.toolName
      : `${stage.category}__${stage.autoTrigger!.toolName}`

    const args = stage.autoTrigger!.queryTransform(originalQuery, context)
    const serializedArgs = stableStringify(args)
    const idHash = createHash('sha256')
      .update(stableStringify({ category: stage.category, toolName, args }))
      .digest('hex')
      .slice(0, 12)

    return {
      id: `auto_${stage.category}_${idHash}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: serializedArgs
      }
    }
  }

  /** 将已执行的工具调用追加到列表（去重） */
  private appendExecutedToolCalls(
    target: ToolCallDefinition[],
    attemptedCalls: ToolCallDefinition[],
    results: ToolExecutionResult[]
  ): void {
    const callById = new Map(attemptedCalls.map((call) => [call.id, call]))
    const knownIds = new Set(target.map((call) => call.id))

    for (const result of results) {
      const call = callById.get(result.toolCallId)
      if (!call || knownIds.has(call.id)) continue
      target.push(call)
      knownIds.add(call.id)
    }
  }

  /**
   * 对工具执行结果进行增强
   * 优先使用适配器自定义的 enrichResult，否则使用全局 ToolResultEnricher
   */
  private enrichResults(results: ToolExecutionResult[]): EnrichedToolResult[] {
    return results.map((r) => {
      const tool = this.registry.getTool(r.toolName)
      const adapter = tool?.adapter

      if (adapter?.enrichResult) {
        const metadata = adapter.enrichResult(r.toolName, {} as Record<string, unknown>, {
          success: r.success,
          content: r.content,
          error: r.error
        })
        return { ...r, metadata } as EnrichedToolResult
      }

      return this.enricher.enrich(r.toolCallId, r.toolName, {
        success: r.success,
        content: r.content,
        error: r.error
      })
    })
  }
}

/**
 * 稳定序列化（按 key 排序后 JSON 化），确保相同内容产生相同的哈希值
 * 用于自动触发的工具调用 ID 生成
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value)) ?? 'null'
}

/** 递归排序对象 key，用于稳定序列化 */
function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((normalized, key) => {
        normalized[key] = normalizeForStableStringify(record[key])
        return normalized
      }, {})
  }

  return value
}
