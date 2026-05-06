import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { skillToolService } from '../../../skill'

/**
 * Skill 工具适配器
 * 让模型先枚举 Skill 摘要，再按需读取完整说明书。
 */
export class SkillToolAdapter implements ToolAdapter {
  getTools(): MCPToolReference[] {
    return skillToolService.getTools().map((tool) => ({
      serverName: tool.serverName || 'skill',
      toolName: tool.name.startsWith('skill__') ? tool.name.slice('skill__'.length) : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('skill__') ? toolName : `skill__${toolName}`
    return skillToolService.callTool(fullName, args)
  }
}
