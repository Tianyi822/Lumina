/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
}

/**
 * 流式事件类型
 */
export type StreamEventType = 'content' | 'reasoning' | 'done' | 'error'

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: StreamEventType
  /** 内容增量 */
  content?: string
  /** Token 使用统计（仅 done 事件） */
  usage?: TokenUsage
  /** 错误信息（仅 error 事件） */
  error?: string
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  /** 输入 token 数量 */
  prompt_tokens: number
  /** 输出 token 数量 */
  completion_tokens: number
  /** 总 token 数量 */
  total_tokens: number
  /** 思考 token 数量（DeepSeek） */
  reasoning_tokens?: number
}

/**
 * 聊天请求参数
 */
export interface ChatRequest {
  /** 消息历史 */
  messages: ChatMessage[]
  /** 模型配置 key（对应 llm_configs 中的 key） */
  modelKey: string
}

/**
 * 聊天响应结果
 */
export interface ChatResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}
