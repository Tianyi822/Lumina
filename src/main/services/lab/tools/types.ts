import { MCPTool, MCPToolCallResult } from '@main/types/mcp'

/**
 * 工具调用参数
 */
export interface ToolArgs {
  [key: string]: unknown
}

/**
 * 实验室工具定义
 */
export interface LabToolDefinition extends MCPTool {
  execute(args: ToolArgs, onProgress?: (message: string) => void): Promise<MCPToolCallResult>
}
