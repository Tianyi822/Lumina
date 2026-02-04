/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string | null
  /** 工具调用（仅 assistant 消息） */
  tool_calls?: ToolCallMessage[]
  /** 工具调用 ID（仅 tool 消息） */
  tool_call_id?: string
  /** 思考内容 */
  reasoning_content?: string
}

/**
 * 工具调用消息
 */
export interface ToolCallMessage {
  /** 工具调用 ID */
  id: string
  /** 类型 */
  type: 'function'
  /** 函数信息 */
  function: {
    name: string
    arguments: string
  }
}

/**
 * MCP 工具引用（用于传递选中的工具）
 */
export interface MCPToolReference {
  /** MCP 服务器名称 */
  serverName: string
  /** 工具名称 */
  toolName: string
  /** 工具描述 */
  description: string
  /** 输入参数 Schema */
  inputSchema: Record<string, unknown>
}

/**
 * 工具调用信息（用于 UI 展示）
 */
export interface ToolCallInfo {
  /** 工具调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** MCP 服务器名称 */
  serverName: string
  /** 调用参数 */
  arguments: Record<string, unknown>
}

/**
 * 工具调用结果（用于 UI 展示）
 */
export interface ToolResultInfo {
  /** 工具调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 是否成功 */
  success: boolean
  /** 结果内容 */
  result?: unknown
  /** 错误信息 */
  error?: string
}

/**
 * 流式事件类型
 */
export type StreamEventType =
  | 'content'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'tool_progress'
  | 'knowledge_search'
  | 'knowledge_result'
  | 'done'
  | 'error'

/**
 * 知识库搜索信息（用于 UI 展示）
 */
export interface KnowledgeSearchInfo {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 知识库名称 */
  knowledgeBaseName: string
  /** 用户查询 */
  query: string
}

/**
 * 知识库搜索结果信息（用于 UI 展示）
 */
export interface KnowledgeResultInfo {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 知识库名称 */
  knowledgeBaseName: string
  /** 用户查询 */
  query: string
  /** 搜索结果 */
  results: Array<{
    chunkId: number
    fileId: string
    fileName: string
    content: string
    similarity: number
  }>
}

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: StreamEventType
  /** 会话标识（用于多会话场景下识别事件归属） */
  sessionId?: string
  /** 内容增量 */
  content?: string
  /** Token 使用统计（仅 done 事件） */
  usage?: TokenUsage
  /** 错误信息（仅 error 事件） */
  error?: string
  /** 工具调用信息（仅 tool_call 事件） */
  toolCall?: ToolCallInfo
  /** 工具结果信息（仅 tool_result 事件） */
  toolResult?: ToolResultInfo
  /** 工具进度信息（仅 tool_progress 事件） */
  toolProgress?: {
    current: number
    total: number
    message?: string
  }
  /** 知识库搜索信息（仅 knowledge_search 事件） */
  knowledgeSearch?: KnowledgeSearchInfo
  /** 知识库搜索结果信息（仅 knowledge_result 事件） */
  knowledgeResult?: KnowledgeResultInfo
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
  /** 思考 token 数量 */
  reasoning_tokens?: number
}

/**
 * 知识库引用（用于传递选中的知识库）
 */
export interface KnowledgeBaseReference {
  /** 知识库 ID */
  id: string
  /** 知识库名称 */
  name: string
  /** 知识库描述 */
  description?: string
  /** 文档数量 */
  documentCount: number
}

/**
 * 知识库搜索结果
 */
export interface KnowledgeSearchResult {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 知识库名称 */
  knowledgeBaseName: string
  /** 用户查询 */
  query: string
  /** 搜索结果 */
  results: Array<{
    /** 文档块 ID */
    chunkId: number
    /** 文件 ID */
    fileId: string
    /** 文件名 */
    fileName: string
    /** 内容片段 */
    content: string
    /** 相似度分数 */
    similarity: number
  }>
}

/**
 * 聊天请求参数
 */
export interface ChatRequest {
  /** 消息历史 */
  messages: ChatMessage[]
  /** 模型配置 key（对应 llm_configs 中的 key） */
  modelKey: string
  /** 会话标识（用于多会话管理和事件路由） */
  sessionId: string
  /** 是否启用思考模式 */
  enableThinking?: boolean
  /** 选中的 MCP 工具列表 */
  selectedTools?: MCPToolReference[]
  /** 选中的知识库列表 */
  selectedKnowledgeBases?: KnowledgeBaseReference[]
  /** ReAct 最大迭代次数（默认 10） */
  maxReactIterations?: number
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
