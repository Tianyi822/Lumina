import {
  SandboxData,
  SandboxCreationType,
  ContainerFilter,
  DeleteSandboxOptions,
  ExecCommand
} from '@shared/types/sandbox'
import { MCPTool, MCPToolCallResult } from '@main/types/mcp'

/**
 * 工具调用参数
 */
export interface ToolArgs {
  [key: string]: unknown
}

/**
 * 沙箱工具定义
 */
export interface SandboxToolDefinition extends MCPTool {
  execute(args: ToolArgs): Promise<MCPToolCallResult>
}
