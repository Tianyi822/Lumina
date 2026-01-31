import type { ChatMessage, SessionMessage, MCPTool, MCPToolReference } from '@shared/types'
import { deepClone } from './data-processors'

/**
 * 将 SessionMessage 转换为 ChatMessage（用于发送给后端）
 */
export function sessionToChatMessage(msg: SessionMessage): ChatMessage {
  const chatMsg: ChatMessage = {
    role: msg.role,
    content: msg.content
  }

  // 如果有思考过程，添加到消息中
  if (msg.reasoning) {
    chatMsg.reasoning_content = msg.reasoning
  }

  return chatMsg
}

/**
 * 构建发送给后端的消息历史
 */
export function buildChatMessages(messages: SessionMessage[]): ChatMessage[] {
  return messages.map(sessionToChatMessage)
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
    inputSchema: deepClone(tool.inputSchema || {})
  }))
}
