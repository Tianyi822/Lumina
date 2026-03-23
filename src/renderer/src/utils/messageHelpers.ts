import type { Message, ChatMessage } from '../types'
import type { SessionMessage } from '@shared/types'

/**
 * 将 SessionMessage 转换为 Message（UI 层特有）
 */
export function sessionMessageToMessage(msg: SessionMessage): Message {
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'tool',
    content: msg.content,
    reasoning: msg.reasoning,
    timestamp: msg.timestamp,
    modelName: msg.modelName,
    usage: msg.usage,
    isStreaming: false,
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
    reactSteps: msg.reactSteps,
    reactIterations: msg.reactIterations,
    attachedDocuments: msg.attachedDocuments,
    attachedImages: msg.attachedImages,
    attachedVideos: msg.attachedVideos
  }
}

/**
 * 将 Message 转换为 SessionMessage（用于保存）
 * 注意：需要转换为纯对象以避免 Vue 响应式对象的序列化问题
 */
export function messageToSessionMessage(msg: Message): SessionMessage {
  // 先序列化再解析，确保是纯对象
  const plainMsg = JSON.parse(
    JSON.stringify({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      reasoning: msg.reasoning,
      timestamp: msg.timestamp || new Date().toISOString(),
      modelName: msg.modelName,
      usage: msg.usage
        ? {
            prompt_tokens: msg.usage.prompt_tokens,
            completion_tokens: msg.usage.completion_tokens,
            total_tokens: msg.usage.total_tokens,
            reasoning_tokens: msg.usage.reasoning_tokens
          }
        : undefined,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      reactSteps: msg.reactSteps,
      reactIterations: msg.reactIterations,
      attachedDocuments: msg.attachedDocuments,
      attachedImages: msg.attachedImages,
      attachedVideos: msg.attachedVideos
    })
  )
  return plainMsg
}

/**
 * 构建发送给后端的消息历史（UI 层特有）
 * 过滤掉 content 为空的助手消息，避免 API 报错
 */
export function buildChatMessages(messages: Message[]): ChatMessage[] {
  return messages
    .filter((msg) => {
      // 过滤掉 content 为空的助手消息（保留有 tool_calls 的助手消息）
      if (msg.role === 'assistant') {
        const hasContent = msg.content && msg.content.trim().length > 0
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
        return hasContent || hasToolCalls
      }
      return true
    })
    .map((msg) => {
      const result: ChatMessage = {
        role: msg.role,
        content: msg.content
      }
      // 添加工具调用字段
      if (msg.tool_calls) {
        result.tool_calls = msg.tool_calls
      }
      if (msg.tool_call_id) {
        result.tool_call_id = msg.tool_call_id
      }
      if (msg.reasoning) {
        result.reasoning_content = msg.reasoning
      }
      return result
    })
}

// 重新导出共享工具函数（供主进程使用）
export {
  sessionToChatMessage,
  buildChatMessages as buildChatMessagesFromSession,
  deepCopyMessages
} from '@shared/utils'
