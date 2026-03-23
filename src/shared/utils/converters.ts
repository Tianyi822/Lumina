import type { ChatMessage, SessionMessage, MCPTool, MCPToolReference } from '@shared/types'
import type { KnowledgeBase, KnowledgeBaseReference } from '@shared/types/knowledge'
import { deepClone } from './data-processors'

/**
 * 将持久化的消息转换为发送给后端的聊天消息格式
 * 去掉持久化时的元数据，保留核心内容
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

  if (msg.attachedDocuments?.length) {
    chatMsg.attachedDocuments = msg.attachedDocuments
  }

  if (msg.attachedImages?.length) {
    chatMsg.attachedImages = msg.attachedImages
  }

  if (msg.attachedVideos?.length) {
    chatMsg.attachedVideos = msg.attachedVideos
  }

  return chatMsg
}

/**
 * 将持久化的消息列表转换为发送给后端的格式
 */
export function buildChatMessages(messages: SessionMessage[]): ChatMessage[] {
  return messages.map(sessionToChatMessage)
}

/**
 * 将 MCP 工具转换为工具引用格式
 * 需要深拷贝 inputSchema 以确保可以通过 IPC 传输
 */
export function convertToToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((tool) => ({
    serverName: tool.serverName,
    toolName: tool.name,
    description: tool.description || '',
    inputSchema: deepClone(tool.inputSchema || {})
  }))
}

/**
 * 将知识库对象转换为引用格式
 * 提取关键字段用于传递给聊天接口
 */
export function convertToKBReferences(knowledgeBases: KnowledgeBase[]): KnowledgeBaseReference[] {
  return knowledgeBases.map((kb) => ({
    id: kb.id,
    name: kb.name,
    description: kb.description || '',
    documentCount: kb.linkedFileIds?.length ?? kb.documentCount ?? 0
  }))
}
