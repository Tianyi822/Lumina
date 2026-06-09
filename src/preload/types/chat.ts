import type { ChatRequest, ChatResult, StreamEvent } from '@shared/types/chat'

export type {
  AttachedDocument,
  AttachedImage,
  ChatMessage,
  ChatRequest,
  ChatResult,
  KnowledgeResultInfo,
  KnowledgeSearchInfo,
  KnowledgeSearchResult,
  MCPToolReference,
  MessageRole,
  StreamEvent,
  StreamEventType,
  TokenUsage,
  ToolCallInfo,
  ToolCallMessage,
  ToolResultInfo,
  UserInteractionOption,
  UserInteractionRequest
} from '@shared/types/chat'

/**
 * 聊天相关的 API
 */
export interface ChatApi {
  /** 发送聊天消息，返回完整响应结果 */
  send: (request: ChatRequest) => Promise<ChatResult>
  /** 中止正在进行的聊天请求 */
  stop: (sessionId?: string) => Promise<void>
  /** 监听流式响应事件，返回取消监听的函数 */
  onStream: (callback: (event: StreamEvent) => void) => () => void
}
