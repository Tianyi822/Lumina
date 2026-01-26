import type { MCPTool, MCPToolReference } from '../types'

/**
 * 生成会话标题
 */
export function generateTitle(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= 20) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, 20) + '...'
}

/**
 * 将 MCPTool 转换为 MCPToolReference
 * 注意：需要深拷贝 inputSchema 以确保可以通过 IPC 传输
 */
export function convertToToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((tool) => ({
    serverName: tool.serverName,
    toolName: tool.name,
    description: tool.description || '',
    // 使用 JSON 序列化/反序列化来确保对象可克隆
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema || {}))
  }))
}
