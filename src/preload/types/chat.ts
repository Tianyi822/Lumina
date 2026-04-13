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
  send: (request: ChatRequest) => Promise<ChatResult>
  stop: (sessionId?: string) => Promise<void>
  onStream: (callback: (event: StreamEvent) => void) => () => void
}
