import type { KnowledgeBaseReference } from './knowledge'

/**
 * 定义聊天消息中发送者的角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 附加文档信息
 * 包含解析后的文档内容
 */
export interface AttachedDocument {
  /** 文档名称 */
  fileName: string
  /** 文档类型（txt, md, pdf, doc, docx, csv） */
  fileType: string
  /** 文档大小（字节） */
  fileSize: number
  /** 解析后的文本内容 */
  parsedContent: string
}

/**
 * 附加图片信息
 * 包含压缩后的 Base64 图片数据
 */
export interface AttachedImage {
  /** 原始文件名 */
  fileName: string
  /** MIME 类型，如 'image/jpeg' */
  mimeType: string
  /** 压缩后宽度 */
  width: number
  /** 压缩后高度 */
  height: number
  /** 原始文件大小（字节） */
  originalSize: number
  /** 压缩后大小（字节） */
  compressedSize: number
  /** 完整 data URL: "data:image/jpeg;base64,..." */
  base64Data: string
}

/**
 * 表示一条聊天消息的完整结构
 * 包含角色、内容、工具调用和思考过程等信息
 */
export interface ChatMessage {
  /** 消息发送者角色 */
  role: MessageRole
  /** 消息文本内容，可能为空 */
  content: string | null
  /** 工具调用信息，仅 assistant 消息会有 */
  tool_calls?: ToolCallMessage[]
  /** 工具调用的 ID，仅 tool 消息会有 */
  tool_call_id?: string
  /** 模型思考过程的内容 */
  reasoning_content?: string
  /** 附加的文档列表，仅 user 消息会有 */
  attachedDocuments?: AttachedDocument[]
  /** 附加的图片列表，仅 user 消息会有 */
  attachedImages?: AttachedImage[]
}

/**
 * 表示一次工具调用的详细信息
 */
export interface ToolCallMessage {
  /** 本次工具调用的唯一标识 */
  id: string
  /** 调用类型，目前只支持函数调用 */
  type: 'function'
  /** 函数调用的具体信息 */
  function: {
    name: string
    arguments: string
  }
}

/**
 * 表示用户选中的 MCP 工具引用
 * 用于在发起聊天时传递选中的工具信息
 */
export interface MCPToolReference {
  /** MCP 服务器名称 */
  serverName: string
  /** 工具名称 */
  toolName: string
  /** 工具的描述文本 */
  description: string
  /** 工具输入参数的结构定义 */
  inputSchema: Record<string, unknown>
}

/**
 * 工具调用时展示给用户的信息
 */
export interface ToolCallInfo {
  /** 工具调用的唯一标识 */
  id: string
  /** 工具的名称 */
  name: string
  /** 所属 MCP 服务器名称 */
  serverName: string
  /** 传递给工具的参数 */
  arguments: Record<string, unknown>
}

/**
 * 工具调用完成后返回的结果展示信息
 */
export interface ToolResultInfo {
  /** 工具调用的唯一标识 */
  id: string
  /** 工具的名称 */
  name: string
  /** 工具执行是否成功 */
  success: boolean
  /** 工具返回的结果数据 */
  result?: unknown
  /** 工具执行失败时的错误信息 */
  error?: string
}

/**
 * 流式传输时的事件类型
 * 定义了聊天过程中可能发生的各种事件
 */
export type StreamEventType =
  | 'content'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'tool_progress'
  | 'knowledge_search'
  | 'knowledge_result'
  | 'user_interaction'
  | 'react_iteration_start'
  | 'done'
  | 'error'

/**
 * 知识库搜索操作的信息展示
 */
export interface KnowledgeSearchInfo {
  /** 知识库的唯一标识 */
  knowledgeBaseId: string
  /** 知识库的名称 */
  knowledgeBaseName: string
  /** 用户的查询内容 */
  query: string
}

/**
 * 知识库搜索完成后的结果信息展示
 */
export interface KnowledgeResultInfo {
  /** 知识库的唯一标识 */
  knowledgeBaseId: string
  /** 知识库的名称 */
  knowledgeBaseName: string
  /** 用户的查询内容 */
  query: string
  /** 搜索到的相关文档片段 */
  results: Array<{
    chunkId: number
    fileId: string
    fileName: string
    content: string
    similarity: number
  }>
}

/**
 * 用户交互选项
 */
export interface UserInteractionOption {
  /** 选项值 */
  value: string
  /** 显示标签 */
  label: string
  /** 选项描述 */
  description?: string
}

/**
 * 用户交互请求信息
 * 当模型需要用户做出选择时，返回此信息
 */
export interface UserInteractionRequest {
  /** 问题描述 */
  question: string
  /** 选项列表 */
  options: UserInteractionOption[]
}

/**
 * 聊天流式传输事件
 * 每个事件包含不同类型的增量数据
 */
export interface StreamEvent {
  /** 事件的具体类型 */
  type: StreamEventType
  /** 会话标识，用于多会话场景下区分不同会话的事件 */
  sessionId?: string
  /** 新增的消息文本内容 */
  content?: string
  /** Token 使用统计，仅在事件类型为 done 时提供 */
  usage?: TokenUsage
  /** 错误信息，仅在事件类型为 error 时提供 */
  error?: string
  /** 工具调用信息，仅在事件类型为 tool_call 时提供 */
  toolCall?: ToolCallInfo
  /** 工具执行结果，仅在事件类型为 tool_result 时提供 */
  toolResult?: ToolResultInfo
  /** 工具执行进度，仅在事件类型为 tool_progress 时提供 */
  toolProgress?: {
    current: number
    total: number
    message?: string
  }
  /** 知识库搜索信息，仅在事件类型为 knowledge_search 时提供 */
  knowledgeSearch?: KnowledgeSearchInfo
  /** 知识库搜索结果，仅在事件类型为 knowledge_result 时提供 */
  knowledgeResult?: KnowledgeResultInfo
  /** 用户交互请求，仅在事件类型为 user_interaction 时提供 */
  userInteraction?: UserInteractionRequest
}

/**
 * 统计 Token 使用情况
 */
export interface TokenUsage {
  /** 输入模型使用的 Token 数量 */
  prompt_tokens: number
  /** 模型输出的 Token 数量 */
  completion_tokens: number
  /** 总共使用的 Token 数量 */
  total_tokens: number
  /** 思考过程使用的 Token 数量 */
  reasoning_tokens?: number
}

/**
 * 知识库搜索的完整结果
 * 包含搜索到的文档片段和相关度信息
 */
export interface KnowledgeSearchResult {
  /** 知识库的唯一标识 */
  knowledgeBaseId: string
  /** 知识库的名称 */
  knowledgeBaseName: string
  /** 用户的查询内容 */
  query: string
  /** 搜索结果列表 */
  results: Array<{
    /** 文档块的唯一标识 */
    chunkId: number
    /** 文件的唯一标识 */
    fileId: string
    /** 文件名 */
    fileName: string
    /** 文档片段的内容 */
    content: string
    /** 与查询的相似度分数 */
    similarity: number
  }>
}

/**
 * 发起聊天请求所需的完整参数
 */
export interface ChatRequest {
  /** 历史消息列表 */
  messages: ChatMessage[]
  /** 模型配置的键名，对应 llm_configs 中的某个配置 */
  modelKey: string
  /** 会话标识，用于多会话管理和事件路由 */
  sessionId: string
  /** 是否启用模型的思考模式 */
  enableThinking?: boolean
  /** 用户选择的 MCP 工具列表 */
  selectedTools?: MCPToolReference[]
  /** 用户选择的知识库列表 */
  selectedKnowledgeBases?: KnowledgeBaseReference[]
  /** ReAct 循环的最大迭代次数，默认 10 次 */
  maxReactIterations?: number
  /** 是否启用沙箱管理工具 */
  enableSandboxTools?: boolean
}

/**
 * 聊天请求的执行结果
 */
export interface ChatResult {
  /** 请求是否执行成功 */
  success: boolean
  /** 执行失败时的错误信息 */
  error?: string
}
