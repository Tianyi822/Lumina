import type { Message, ChatMessage } from '../types'
import type { SessionMessage } from '@shared/types'
import { deepClone } from '@shared/utils'

/**
 * 将 SessionMessage 转换为 Message（UI 层特有）
 */
export function sessionMessageToMessage(msg: SessionMessage): Message {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    reasoning: msg.reasoning,
    timestamp: msg.timestamp,
    modelName: msg.modelName,
    usage: msg.usage,
    isStreaming: false,
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
    modelTranscript: msg.modelTranscript,
    reactSteps: msg.reactSteps,
    reactIterations: msg.reactIterations,
    attachedDocuments: msg.attachedDocuments,
    attachedImages: msg.attachedImages,
    attachedQuotes: msg.attachedQuotes,
    hidden: msg.hidden,
    contextKind: msg.contextKind,
    sourcePaperId: msg.sourcePaperId
  }
}

/**
 * 将 Message 转换为 SessionMessage（用于保存）
 * 注意：需要转换为纯对象以避免 Vue 响应式对象的序列化问题
 */
export function messageToSessionMessage(msg: Message): SessionMessage {
  return deepClone({
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
          reasoning_tokens: msg.usage.reasoning_tokens,
          cached_prompt_tokens: msg.usage.cached_prompt_tokens,
          uncached_prompt_tokens: msg.usage.uncached_prompt_tokens,
          prompt_cache_hit_rate: msg.usage.prompt_cache_hit_rate
        }
      : undefined,
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
    modelTranscript: msg.modelTranscript,
    reactSteps: msg.reactSteps,
    reactIterations: msg.reactIterations,
    attachedDocuments: msg.attachedDocuments,
    attachedImages: msg.attachedImages,
    attachedQuotes: msg.attachedQuotes,
    hidden: msg.hidden,
    contextKind: msg.contextKind,
    sourcePaperId: msg.sourcePaperId
  })
}

/**
 * 构建发送给后端的消息历史（UI 层特有）
 * 过滤掉 content 为空的助手消息，避免 API 报错
 */
export function buildChatMessages(messages: Message[]): ChatMessage[] {
  const result: ChatMessage[] = []
  const expandedToolCallIds = new Set<string>()

  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id && expandedToolCallIds.has(msg.tool_call_id)) {
      expandedToolCallIds.delete(msg.tool_call_id)
      continue
    }

    if (msg.modelTranscript && msg.modelTranscript.length > 0) {
      result.push(...deepClone(msg.modelTranscript))
      for (const item of msg.modelTranscript) {
        if (item.role === 'tool' && item.tool_call_id) {
          expandedToolCallIds.add(item.tool_call_id)
        }
      }
      continue
    }

    const shouldKeep = (() => {
      if (msg.hidden && msg.contextKind === 'paper_fulltext') {
        return false
      }
      // 过滤掉 content 为空的助手消息（保留有 tool_calls 的助手消息）
      if (msg.role === 'assistant') {
        const hasContent = msg.content && msg.content.trim().length > 0
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
        return hasContent || hasToolCalls
      }
      return true
    })()
    if (!shouldKeep) continue

    const chatMessage: ChatMessage = {
      role: msg.role,
      content: msg.content
    }
    // 添加工具调用字段
    if (msg.tool_calls) {
      chatMessage.tool_calls = msg.tool_calls
    }
    if (msg.tool_call_id) {
      chatMessage.tool_call_id = msg.tool_call_id
    }
    if (msg.attachedDocuments && msg.attachedDocuments.length > 0) {
      chatMessage.attachedDocuments = msg.attachedDocuments
    }
    if (msg.attachedImages && msg.attachedImages.length > 0) {
      chatMessage.attachedImages = msg.attachedImages
    }
    if (msg.attachedQuotes && msg.attachedQuotes.length > 0) {
      chatMessage.attachedQuotes = msg.attachedQuotes
    }
    result.push(chatMessage)
  }

  return result
}

// 重新导出共享工具函数（供主进程使用）
export {
  sessionToChatMessage,
  buildChatMessages as buildChatMessagesFromSession,
  deepCopyMessages
} from '@shared/utils'
