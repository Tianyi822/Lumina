import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'

export interface ToolDescriptor {
  name: string
  description: string
  tags: string[]
}

export interface CapabilityUnit {
  id: string
  displayName: string
  description: string
  tags: string[]
  createAdapter(context: unknown): ToolAdapter | null
  describeTools(context: unknown): ToolDescriptor[]
  enrichResult?: (
    toolName: string,
    args: Record<string, unknown>,
    result: MCPToolCallResult
  ) => ToolResultMetadata
}
