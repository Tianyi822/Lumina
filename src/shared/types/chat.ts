import type { KnowledgeBaseReference } from './knowledge'
import type { PaperAnnotationTextAnchor } from './paper'

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
 * 论文引用信息
 * 用户从论文阅读页选中的内容片段
 */
export type PaperQuoteSourceType = 'original' | 'translation'

export interface PaperQuoteSurroundingContext {
  /** 选区前方的上下文文本 */
  beforeText: string
  /** 选区后方的上下文文本 */
  afterText: string
  /** 包含选中文本的完整上下文文本 */
  contextualText: string
  /** 选中文本在 contextualText 中的起始偏移 */
  selectedStartOffset: number
  /** 选中文本在 contextualText 中的结束偏移 */
  selectedEndOffset: number
  /** contextualText 在当前视图纯文本中的起始偏移 */
  contextStartOffset: number
  /** contextualText 在当前视图纯文本中的结束偏移 */
  contextEndOffset: number
}

export interface PaperQuoteSourceLocation {
  /** 段落稳定 ID */
  segmentStableId: string
  /** 段落索引 */
  segmentIndex: number
  /** 页码索引列表 */
  pageIndexes?: number[]
  /** 原始块索引列表 */
  blockIndexes?: number[]
  /** 选中文本在当前视图纯文本中的起始偏移 */
  startOffset: number
  /** 选中文本在当前视图纯文本中的结束偏移 */
  endOffset: number
}

export interface PaperQuote {
  /** 引用唯一标识 */
  id: string
  /** 所属论文 ID */
  paperId: string
  /** 段落稳定 ID */
  segmentStableId: string
  /** 段落索引 */
  segmentIndex: number
  /** 视图类型：原文或译文 */
  viewKind: PaperQuoteSourceType
  /** 来源类型，兼容旧数据时可回退到 viewKind */
  sourceType?: PaperQuoteSourceType
  /** 选中的文本内容 */
  selectedText: string
  /** 围绕选中文本附带给模型理解的上下文 */
  surroundingContext?: PaperQuoteSurroundingContext
  /** 来源定位信息 */
  sourceLocation?: PaperQuoteSourceLocation
  /** 当前视图内的文本锚点 */
  textAnchor: PaperAnnotationTextAnchor
  /** 原文修订 ID */
  sourceRevisionId?: string
  /** 原文段落文本哈希 */
  segmentTextHash?: string
  /** 译文修订 ID */
  translationRevisionId?: string
  /** 译文模型名 */
  translationModelName?: string
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
  /** 附加的论文引用列表，仅 user 消息会有 */
  attachedQuotes?: PaperQuote[]
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
 * ReAct 迭代状态
 * 用于跟踪当前迭代的执行阶段
 */
export type ReactIterationStatus = 'thinking' | 'calling_tools' | 'processing'

/**
 * 流式传输时的事件类型
 * 定义了聊天过程中可能发生的各种事件
 */
export type StreamEventType =
  | 'content'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'knowledge_search'
  | 'knowledge_result'
  | 'user_interaction'
  | 'react_iteration_start'
  | 'plan_status'
  | 'plan_generated'
  | 'plan_step_update'
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
  /** 交互类型 */
  interactionType?: 'generic'
  /** 首屏展示的最大选项数 */
  initialVisibleCount?: number
}

/**
 * 计划整体执行状态
 */
export type PlanExecutionStatus =
  | 'idle'
  | 'planning'
  | 'planned'
  | 'running'
  | 'failed'
  | 'completed'
  | 'cancelled'

/**
 * 计划步骤状态
 */
export type PlanStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'

/**
 * 计划中的单个步骤
 */
export interface PlanStep {
  /** 步骤序号（从 0 开始） */
  index: number
  /** 步骤标题 */
  title: string
  /** 步骤详细描述 */
  description: string
  /** 当前执行状态 */
  status: PlanStepStatus
  /** 步骤执行摘要 */
  summary?: string
  /** 步骤失败或取消原因 */
  error?: string
  /** 当前尝试次数（从 1 开始） */
  attempt?: number
  /** 最大尝试次数 */
  maxAttempts?: number
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
  /** 本轮消息标识，用于区分同一会话内的多轮流式事件 */
  turnId?: string
  /** 新增的消息文本内容 */
  content?: string
  /** Token 使用统计，仅在事件类型为 done 时提供 */
  usage?: TokenUsage
  /** 错误信息，仅在事件类型为 error 时提供 */
  error?: string
  /** 最终执行状态，仅在 done/error 等终态事件时提供 */
  finalStatus?: Exclude<PlanExecutionStatus, 'idle' | 'planning' | 'planned' | 'running'>
  /** 工具调用信息，仅在事件类型为 tool_call 时提供 */
  toolCall?: ToolCallInfo
  /** 工具执行结果，仅在事件类型为 tool_result 时提供 */
  toolResult?: ToolResultInfo
  /** 知识库搜索信息，仅在事件类型为 knowledge_search 时提供 */
  knowledgeSearch?: KnowledgeSearchInfo
  /** 知识库搜索结果，仅在事件类型为 knowledge_result 时提供 */
  knowledgeResult?: KnowledgeResultInfo
  /** 用户交互请求，仅在事件类型为 user_interaction 时提供 */
  userInteraction?: UserInteractionRequest
  /** ReAct 迭代状态，仅在事件类型为 react_iteration_start 时提供 */
  status?: ReactIterationStatus
  /** 计划整体状态，仅在事件类型为 plan_status 时提供 */
  planStatus?: {
    status: PlanExecutionStatus
    message?: string
    error?: string
    summary?: string
  }
  /** 计划步骤列表，仅在事件类型为 plan_generated 时提供 */
  plan?: { steps: PlanStep[]; status?: PlanExecutionStatus }
  /** 计划步骤状态更新，仅在事件类型为 plan_step_update 时提供 */
  planStepUpdate?: {
    index: number
    status: PlanStepStatus
    summary?: string
    error?: string
    attempt?: number
    maxAttempts?: number
  }
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
  /** 当前论文 ID，仅论文会话使用 */
  paperId?: string
  /** 本轮消息标识，用于流式事件路由 */
  turnId?: string
  /** 是否启用模型的思考模式 */
  enableThinking?: boolean
  /** 用户选择的 MCP 工具列表 */
  selectedTools?: MCPToolReference[]
  /** 用户选择的知识库列表 */
  selectedKnowledgeBases?: KnowledgeBaseReference[]
  /** ReAct 循环的最大迭代次数，默认 10 次 */
  maxReactIterations?: number
  /** 是否启用实验室管理工具 */
  enableLabTools?: boolean
  /** 会话类型标识，用于启用会话专属功能 */
  sessionType?: string
  /** 是否启用规划模式（仅论文会话可用） */
  enablePlanMode?: boolean
  /** 是否启用论文联网搜索（仅论文会话可用） */
  enablePaperWebSearch?: boolean
}

/**
 * 聊天请求的执行结果
 */
export interface ChatResult {
  /** 请求是否执行成功 */
  success: boolean
  /** 执行失败时的错误信息 */
  error?: string
  /** 工具层可恢复错误列表 */
  toolErrors?: string[]
  /** 模型最终文本内容，用于规划模式步骤间传递执行结论 */
  finalContent?: string
  /** 工具执行结果摘要，用于规划模式步骤间保留关键上下文 */
  toolResults?: ChatToolExecutionResult[]
  /** 该次调用消耗的 token 统计 */
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    reasoning_tokens?: number
  }
}

/**
 * 聊天过程中单次工具执行结果
 */
export interface ChatToolExecutionResult {
  /** 工具调用 ID */
  toolCallId: string
  /** 工具完整名称，如 lab__exec_command */
  toolName: string
  /** 工具调用是否成功 */
  success: boolean
  /** 写入模型上下文的工具结果内容 */
  content: string
  /** 工具调用失败时的错误信息 */
  error?: string
}
