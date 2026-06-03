import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { MCPToolAdapter } from '../adapters/MCPToolAdapter'
import type { MCPService } from '@main/services/mcp'
import type { MCPToolReference } from '@shared/types/chat'

interface McpCapabilityContext {
  selectedTools?: MCPToolReference[]
  mcpService?: MCPService
}

export class McpCapability implements CapabilityUnit {
  id = 'mcp'
  displayName = 'MCP 外部工具'
  description = '外部 MCP 服务器提供的工具集'
  tags = ['外部工具', 'MCP']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as McpCapabilityContext
    if (!ctx.mcpService || (ctx.selectedTools?.length ?? 0) === 0) return null
    return new MCPToolAdapter(ctx.mcpService)
  }

  // MCP 工具保留 serverName__toolName 命名，因为工具来自外部服务器，
  // 需要按服务器区分（如 arxiv__search、github__list_repos）
  describeTools(context: unknown): ToolDescriptor[] {
    const ctx = context as McpCapabilityContext
    return (ctx.selectedTools ?? []).map((tool) => ({
      name: `${tool.serverName}__${tool.toolName}`,
      description: tool.description,
      tags: this.tags
    }))
  }
}
