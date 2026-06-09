import type { MCPTool, MCPToolCallResult } from '@main/types/mcp'

/**
 * 工具调用参数（任意键值对）
 */
export interface ToolArgs {
  [key: string]: unknown
}

/**
 * 实验室工具定义
 * 继承 MCPTool 元数据，增加异步执行方法
 */
export interface LabToolDefinition extends MCPTool {
  execute(args: ToolArgs, onProgress?: (message: string) => void): Promise<MCPToolCallResult>
}
