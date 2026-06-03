import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ToolOrchestrator } from './ToolOrchestrator'
import { ToolResultEnricher } from './ToolResultEnricher'
import { ToolResultMerger } from './ToolResultMerger'
import type { ToolPipeline, PipelineContext, ToolCategory } from './PipelineTypes'
import type {
  ToolCallDefinition,
  ToolExecutionResult,
  ToolExecutionSummary
} from './UnifiedToolExecutor'
import type { RegisteredTool, ToolAdapter } from './UnifiedToolRegistry'
import type { ChatRequest } from '../../../types/chat'

// ===== Fake 对象 =====

type ToolOrchestratorOptions = ConstructorParameters<typeof ToolOrchestrator>[0]
type FakeRegistry = Pick<ToolOrchestratorOptions['registry'], 'getTool'>
type FakeExecuteToolCalls = ToolOrchestratorOptions['executeToolCalls']
type FakeWebContents = Parameters<ToolOrchestrator['orchestrate']>[3]

const fakeWebContents = {} as unknown as FakeWebContents

function makeChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    messages: [],
    modelKey: 'test-model',
    sessionId: 's1',
    ...overrides
  }
}

function makeToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {}
): ToolCallDefinition {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }
}

function makeExecutionSummary(results: ToolExecutionResult[]): ToolExecutionSummary {
  return {
    needUserInteraction: false,
    failedToolCount: results.filter((r) => !r.success).length,
    errors: results.filter((r) => r.error).map((r) => r.error!),
    results
  }
}

function createFakeExecuteToolCalls(expectedResults: ToolExecutionResult[]): FakeExecuteToolCalls {
  return async (): Promise<ToolExecutionSummary> => {
    return makeExecutionSummary(expectedResults)
  }
}

function createFakeRegistry(toolCategoryMap: Map<string, ToolCategory>): FakeRegistry {
  const fakeAdapter: ToolAdapter = {
    getTools: async () => [],
    execute: async () => ({ success: true, content: '' })
  }

  return {
    getTool(fullName: string) {
      const category = toolCategoryMap.get(fullName)
      if (!category) return undefined
      const tool: RegisteredTool = {
        fullName,
        category,
        serverName: 'test',
        functionDef: { name: fullName, description: '', parameters: {} },
        adapter: fakeAdapter,
        registeredAt: new Date(),
        status: 'available' as const,
        timeoutMs: 60000
      }
      return tool
    }
  }
}

function createOrchestrator(
  registry: FakeRegistry,
  executeToolCalls: FakeExecuteToolCalls,
  enricher: ToolResultEnricher,
  merger: ToolResultMerger
): ToolOrchestrator {
  return new ToolOrchestrator({
    registry: registry as unknown as ToolOrchestratorOptions['registry'],
    enricher,
    merger,
    executeToolCalls,
    sendStreamEvent: () => {}
  })
}

// ===== 测试 =====

describe('ToolOrchestrator', () => {
  let enricher: ToolResultEnricher
  let merger: ToolResultMerger

  beforeEach(() => {
    enricher = new ToolResultEnricher()
    merger = new ToolResultMerger()
  })

  describe('orchestrate — 模型调用 paper 工具', () => {
    it('模型调用了 paper__search_context，应直接执行并返回结果', async () => {
      const fakeResults: ToolExecutionResult[] = [
        {
          toolCallId: 'call_1',
          toolName: 'paper__search_context',
          content: '## 摘要\n论文内容\n## 方法\n方法描述\n## 结论\n结论\n'.repeat(10),
          success: true
        }
      ]
      const fakeExecute = createFakeExecuteToolCalls(fakeResults)
      const fakeRegistry = createFakeRegistry(new Map([['paper__search_context', 'paper']]))

      const orchestrator = createOrchestrator(fakeRegistry, fakeExecute, enricher, merger)

      const pipeline: ToolPipeline = {
        stages: [{ category: 'paper', execution: 'required' }],
        mergeStrategy: 'none'
      }

      const context: PipelineContext = {
        sessionId: 's1',
        request: makeChatRequest(),
        modelToolCalls: [makeToolCall('call_1', 'paper__search_context', { query: 'test' })],
        stageResults: new Map(),
        originalQuery: 'test query'
      }

      const result = await orchestrator.orchestrate(
        context.modelToolCalls,
        pipeline,
        context,
        fakeWebContents,
        's1',
        't1'
      )

      assert.equal(result.results.length, 1)
      assert.equal(result.metadata.stagesExecuted, 1)
      assert.equal(result.metadata.autoTriggered.length, 0)
      assert.equal(result.metadata.merged, false)
      assert.deepEqual(
        result.executedToolCalls.map((call) => call.id),
        ['call_1']
      )
    })
  })

  describe('orchestrate — 条件触发知识库补充', () => {
    it('paper 结果 coverage 低时，应自动触发 knowledge__search', async () => {
      const paperResult: ToolExecutionResult = {
        toolCallId: 'call_1',
        toolName: 'paper__search_context',
        content: '短结果',
        success: true
      }

      const kbResult: ToolExecutionResult = {
        toolCallId: 'auto_knowledge_1',
        toolName: 'knowledge__search',
        content: '知识库补充内容\n[来源: doc1]\n内容',
        success: true
      }

      let executeCallCount = 0
      const fakeExecute: FakeExecuteToolCalls = async (
        toolCalls: ToolCallDefinition[]
      ): Promise<ToolExecutionSummary> => {
        executeCallCount++
        if (executeCallCount === 1) {
          return makeExecutionSummary([paperResult])
        }
        return makeExecutionSummary([
          {
            ...kbResult,
            toolCallId: toolCalls[0].id
          }
        ])
      }

      const fakeRegistry = createFakeRegistry(
        new Map([
          ['paper__search_context', 'paper'],
          ['knowledge__search', 'knowledge']
        ])
      )

      const orchestrator = createOrchestrator(fakeRegistry, fakeExecute, enricher, merger)

      const pipeline: ToolPipeline = {
        stages: [
          { category: 'paper', execution: 'required' },
          {
            category: 'knowledge',
            execution: 'conditional',
            condition: (ctx) => {
              const paperResults = ctx.stageResults.get('paper')
              return (
                !paperResults ||
                paperResults.length === 0 ||
                paperResults.some((r) => r.metadata.coverage === 'low')
              )
            },
            autoTrigger: {
              toolName: 'search',
              queryTransform: (query) => ({ query })
            }
          }
        ],
        mergeStrategy: 'none'
      }

      // 确认 '短结果' 确实会被 enricher 评为 low coverage
      const paperMetadata = enricher.defaultEnrich('paper__search_context', {
        success: true,
        content: paperResult.content
      })
      assert.equal(paperMetadata.coverage, 'low')

      const context: PipelineContext = {
        sessionId: 's1',
        request: makeChatRequest(),
        modelToolCalls: [makeToolCall('call_1', 'paper__search_context', { query: 'test' })],
        stageResults: new Map(),
        originalQuery: 'test query'
      }

      const result = await orchestrator.orchestrate(
        context.modelToolCalls,
        pipeline,
        context,
        fakeWebContents,
        's1',
        't1'
      )

      assert.equal(result.metadata.stagesExecuted, 2)
      assert.equal(result.metadata.autoTriggered.length, 1)
      assert.ok(result.metadata.autoTriggered[0].includes('knowledge__search'))
      assert.ok(result.results.length >= 2)
      assert.equal(result.executedToolCalls.length, 2)
      assert.deepEqual(
        result.executedToolCalls.map((call) => call.id),
        result.results.map((toolResult) => toolResult.toolCallId)
      )
      assert.match(result.executedToolCalls[1].id, /^auto_knowledge_/)
      assert.equal(result.executedToolCalls[1].function.name, 'knowledge__search')
    })
  })

  describe('orchestrate — 未被管道覆盖的工具直接执行', () => {
    it('mcp 工具不在管道中时，应直接执行不进入管道', async () => {
      const mcpResult: ToolExecutionResult = {
        toolCallId: 'call_mcp',
        toolName: 'myserver__tool',
        content: 'mcp result',
        success: true
      }

      const fakeExecute = createFakeExecuteToolCalls([mcpResult])
      const fakeRegistry = createFakeRegistry(new Map([['myserver__tool', 'mcp']]))

      const orchestrator = createOrchestrator(fakeRegistry, fakeExecute, enricher, merger)

      const pipeline: ToolPipeline = {
        stages: [{ category: 'paper', execution: 'required' }],
        mergeStrategy: 'none'
      }

      const context: PipelineContext = {
        sessionId: 's1',
        request: makeChatRequest(),
        modelToolCalls: [makeToolCall('call_mcp', 'myserver__tool')],
        stageResults: new Map(),
        originalQuery: 'test'
      }

      const result = await orchestrator.orchestrate(
        context.modelToolCalls,
        pipeline,
        context,
        fakeWebContents,
        's1',
        't1'
      )

      assert.equal(result.results.length, 1)
      assert.equal(result.results[0].toolName, 'myserver__tool')
      assert.deepEqual(
        result.executedToolCalls.map((call) => call.id),
        ['call_mcp']
      )
    })
  })

  describe('orchestrate — 结果融合', () => {
    it('多条结果 + smart_merge 策略时，应返回 mergedContent', async () => {
      const results: ToolExecutionResult[] = [
        {
          toolCallId: 'call_1',
          toolName: 'paper__search_context',
          content: '## 论文内容\n论文描述了注意力机制在 NLP 中的应用',
          success: true
        },
        {
          toolCallId: 'call_2',
          toolName: 'knowledge__search',
          content: '知识库中关于注意力机制的补充说明',
          success: true
        }
      ]

      let callCount = 0
      const fakeExecute: FakeExecuteToolCalls = async (): Promise<ToolExecutionSummary> => {
        callCount++
        return makeExecutionSummary(callCount === 1 ? [results[0]] : [results[1]])
      }

      const fakeRegistry = createFakeRegistry(
        new Map([
          ['paper__search_context', 'paper'],
          ['knowledge__search', 'knowledge']
        ])
      )

      const orchestrator = createOrchestrator(fakeRegistry, fakeExecute, enricher, merger)

      const pipeline: ToolPipeline = {
        stages: [
          { category: 'paper', execution: 'required' },
          { category: 'knowledge', execution: 'required' }
        ],
        mergeStrategy: 'smart_merge'
      }

      const context: PipelineContext = {
        sessionId: 's1',
        request: makeChatRequest(),
        modelToolCalls: [
          makeToolCall('call_1', 'paper__search_context'),
          makeToolCall('call_2', 'knowledge__search')
        ],
        stageResults: new Map(),
        originalQuery: 'test'
      }

      const result = await orchestrator.orchestrate(
        context.modelToolCalls,
        pipeline,
        context,
        fakeWebContents,
        's1',
        't1'
      )

      assert.equal(result.metadata.merged, true)
      assert.ok(result.mergedContent)
      assert.ok(result.mergedContent.includes('[来源'))
      assert.deepEqual(
        result.executedToolCalls.map((call) => call.id),
        ['call_1', 'call_2']
      )
    })
  })

  describe('orchestrate — 空管道', () => {
    it('空管道 → 所有工具调用直接执行', async () => {
      const resultData: ToolExecutionResult = {
        toolCallId: 'call_1',
        toolName: 'paper__search_context',
        content: 'result',
        success: true
      }
      const fakeExecute = createFakeExecuteToolCalls([resultData])
      const fakeRegistry = createFakeRegistry(new Map([['paper__search_context', 'paper']]))

      const orchestrator = createOrchestrator(fakeRegistry, fakeExecute, enricher, merger)

      const context: PipelineContext = {
        sessionId: 's1',
        request: makeChatRequest(),
        modelToolCalls: [makeToolCall('call_1', 'paper__search_context')],
        stageResults: new Map(),
        originalQuery: 'test'
      }

      const result = await orchestrator.orchestrate(
        context.modelToolCalls,
        { stages: [] },
        context,
        fakeWebContents,
        's1',
        't1'
      )

      assert.equal(result.results.length, 1)
      assert.deepEqual(
        result.executedToolCalls.map((call) => call.id),
        ['call_1']
      )
    })
  })
})
