import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CapabilityComposer } from './CapabilityComposer'
import { CapabilityRegistry } from '../capabilities/CapabilityRegistry'
import type { CapabilityUnit } from '../capabilities/CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { CapabilityComposition } from '../PipelineTypes'

function makeFakeAdapter(tools: MCPToolReference[]): ToolAdapter {
  return {
    getTools: async () => tools,
    execute: async () => ({ success: true, content: 'ok' }) as MCPToolCallResult
  }
}

function makeCapability(
  id: string,
  createContext: (ctx: unknown) => ToolAdapter | null,
  tools: MCPToolReference[]
): CapabilityUnit {
  return {
    id,
    displayName: id,
    description: `${id} desc`,
    tags: [id],
    createAdapter: createContext,
    describeTools: () =>
      tools.map((t) => ({ name: t.toolName, description: t.description, tags: [id] }))
  }
}

describe('CapabilityComposer', () => {
  let capRegistry: CapabilityRegistry
  const paperTool: MCPToolReference = {
    serverName: 'paper',
    toolName: 'search_context',
    description: 'search paper',
    inputSchema: { type: 'object' }
  }
  const knowledgeTool: MCPToolReference = {
    serverName: 'knowledge',
    toolName: 'search',
    description: 'search knowledge base',
    inputSchema: { type: 'object' }
  }

  beforeEach(() => {
    capRegistry = new CapabilityRegistry()
    capRegistry.register(
      makeCapability(
        'paper',
        (ctx) => ((ctx as { paperId?: string }).paperId ? makeFakeAdapter([paperTool]) : null),
        [paperTool]
      )
    )
    capRegistry.register(
      makeCapability('knowledge', () => makeFakeAdapter([knowledgeTool]), [knowledgeTool])
    )
  })

  it('compose 从活跃能力构建注册表和管道', async () => {
    const composer = new CapabilityComposer(capRegistry)
    const composition: CapabilityComposition = {
      stages: [{ capabilityId: 'paper', mode: 'required' }]
    }
    const result = await composer.compose(['paper'], composition, { paperId: 'p1' })

    assert.ok(result)
    assert.equal(result.toolRegistry.size, 1)
    assert.equal(result.adapters.size, 1)
    assert.equal(result.pipeline.stages.length, 1)
    assert.equal(result.pipeline.stages[0].category, 'paper')
  })

  it('compose 多个能力合并注册', async () => {
    const composer = new CapabilityComposer(capRegistry)
    const composition: CapabilityComposition = {
      stages: [
        { capabilityId: 'paper', mode: 'required' },
        { capabilityId: 'knowledge', mode: 'on_demand' }
      ]
    }
    const result = await composer.compose(['paper', 'knowledge'], composition, { paperId: 'p1' })

    assert.ok(result)
    assert.equal(result.toolRegistry.size, 2)
    assert.equal(result.adapters.size, 2)
    assert.equal(result.pipeline.stages.length, 1)
  })

  it('compose 无可用工具返回 null', async () => {
    const composer = new CapabilityComposer(capRegistry)
    const composition: CapabilityComposition = { stages: [] }
    const result = await composer.compose(['paper'], composition, {})

    assert.equal(result, null)
  })

  it('getSuggestableCapabilities 返回未激活但可用的能力', () => {
    const composer = new CapabilityComposer(capRegistry)
    const suggestable = composer.getSuggestableCapabilities(['paper'], { paperId: 'p1' })

    assert.equal(suggestable.length, 1)
    assert.equal(suggestable[0].id, 'knowledge')
  })

  it('getSuggestableCapabilities 排除不可用的能力', () => {
    const composer = new CapabilityComposer(capRegistry)
    const suggestable = composer.getSuggestableCapabilities([], {})

    assert.equal(suggestable.length, 1)
    assert.equal(suggestable[0].id, 'knowledge')
  })

  it('compose 空活跃能力列表返回 null', async () => {
    const composer = new CapabilityComposer(capRegistry)
    const composition: CapabilityComposition = { stages: [] }
    const result = await composer.compose([], composition, { paperId: 'p1' })

    assert.equal(result, null)
  })
})
