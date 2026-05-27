import test from 'node:test'
import assert from 'node:assert/strict'

import { UnifiedToolRegistry } from './UnifiedToolRegistry.ts'
import type { MCPToolReference } from '@main/types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolAdapter } from './UnifiedToolRegistry.ts'

const adapter: ToolAdapter = {
  getTools: async () => [],
  execute: async (): Promise<MCPToolCallResult> => ({ success: true, content: 'ok' })
}

function getFunctionTool(tool: unknown): { function: { name: string; description?: string } } {
  return tool as { function: { name: string; description?: string } }
}

function createTools(count: number): MCPToolReference[] {
  return Array.from({ length: count }, (_, index) => ({
    serverName: 'paper-server',
    toolName: `search_${index}`,
    description: 'Search document snippets. Use this to find relevant paper context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        }
      },
      required: ['query']
    }
  }))
}

function firstToolDescription(count: number): string {
  const registry = new UnifiedToolRegistry()
  registry.registerBatch(createTools(count), adapter, 'mcp')
  const tool = registry.buildOpenAITools()[0]

  assert.equal(tool.type, 'function')
  return tool.function.description ?? ''
}

test('少量工具使用详细描述', () => {
  const description = firstToolDescription(5)

  assert.match(description, /参数:/)
  assert.match(description, /示例:/)
})

test('中等数量工具使用基础描述', () => {
  const description = firstToolDescription(11)

  assert.match(description, /参数:/)
  assert.doesNotMatch(description, /示例:/)
})

test('大量工具使用精简描述', () => {
  const description = firstToolDescription(21)

  assert.match(description, /^paper-server__search_0: Search document snippets/)
  assert.doesNotMatch(description, /参数:/)
  assert.doesNotMatch(description, /示例:/)
})

test('名为 skill 的 MCP 服务按普通 MCP 工具处理', () => {
  const registry = new UnifiedToolRegistry()
  registry.registerBatch(
    [
      {
        serverName: 'skill',
        toolName: 'list',
        description: 'List remote server data.',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ],
    adapter,
    'mcp'
  )

  const tools = registry.buildOpenAITools()

  assert.deepEqual(
    tools.map((tool) => getFunctionTool(tool).function.name),
    ['skill__list']
  )
  assert.equal(getFunctionTool(tools[0]).function.description, 'List remote server data.')
  assert.equal(registry.getTool('skill__list')?.category, 'mcp')
})
