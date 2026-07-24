import {
  TokenUsage,
  MessageRole,
  ToolCallMessage,
  ToolCallInfo,
  ToolResultInfo,
  AttachedDocument,
  AttachedImage,
  PaperQuote,
  PlanStep
} from './chat'
import type { KnowledgeBase } from './knowledge'
import type { MCPTool } from './mcp'

/**
 * 会话的类型
 */
export type SessionType = 'default' | 'tool' | 'knowledge' | 'paper'

/**
 * ReAct 步骤（持久化用）
 */
export interface ReActStepData {
  type: 'tool_call' | 'tool_result'
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
  timestamp: string
}

/**
 * ReAct 迭代数据（持久化用）
 * 每次 ReAct 循环迭代的思考过程和工具调用步骤
 */
export interface ReActIterationData {
  /** 迭代序号（从 0 开始） */
  iteration: number
  /** 该迭代的思考内容 */
  reasoning: string
  /** 该迭代的工具调用/结果步骤 */
  steps: ReActStepData[]
  /** 该迭代的文本输出内容（Plan 模式下按步骤累加） */
  content?: string
  /** Plan 模式下所属的任务编号（1-based） */
  taskNumber?: number
}

/**
 * 持久化的消息结构
 * 兼容现有的 ChatMessage，增加了元数据字段
 */
export interface SessionMessage {
  /** 消息的唯一标识 */
  id: string
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
  /** 思考过程的内容 */
  reasoning?: string
  /** 消息产生的时间戳 */
  timestamp: string
  /** 生成消息使用的模型名称 */
  modelName?: string
  /** Token 使用统计 */
  usage?: TokenUsage
  /** 工具调用信息，仅 assistant 消息会有 */
  tool_calls?: ToolCallMessage[]
  /** 工具调用的 ID，仅 tool 消息会有 */
  tool_call_id?: string
  /** 当前助手轮次实际产生的模型消息序列 */
  modelTranscript?: import('./chat').ChatMessage[]
  /** ReAct 推理步骤，仅 assistant 消息会有 */
  reactSteps?: ReActStepData[]
  /** ReAct 迭代分组数据，仅 assistant 消息会有 */
  reactIterations?: ReActIterationData[]
  /** 附加的文档列表，仅 user 消息会有 */
  attachedDocuments?: AttachedDocument[]
  /** 附加的图片列表，仅 user 消息会有 */
  attachedImages?: AttachedImage[]
  /** 附加的论文引用列表，仅 user 消息会有 */
  attachedQuotes?: PaperQuote[]
  /** 是否为隐藏上下文消息 */
  hidden?: boolean
  /** 隐藏上下文类型 */
  contextKind?: 'paper_fulltext'
  /** 隐藏上下文来源论文 ID */
  sourcePaperId?: string
  /** 规划模式的计划步骤数据 */
  planSteps?: PlanStep[]
}

/**
 * 会话的元数据信息
 */
export interface SessionMeta {
  /** 会话的唯一标识 */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 会话的简介 */
  description?: string
  /** 会话类型 */
  sessionType: SessionType
  /** 会话创建时间 */
  createdAt: string
  /** 会话最后更新时间 */
  updatedAt: string
}

/**
 * 会话级选择状态
 * 用于持久化当前会话选择的 MCP 工具、知识库和实验室开关
 */
export interface SessionSelectionState {
  /** 当前会话选中的 MCP 工具 */
  selectedMCPTools: MCPTool[]
  /** 当前会话选中的知识库 */
  selectedKnowledgeBases: KnowledgeBase[]
  /** 当前会话是否启用实验室工具 */
  enableLabTools?: boolean
  /** 当前会话选中的模型 */
  selectedModel: string
  /** 当前会话是否启用规划模式（仅论文会话） */
  enablePlanMode?: boolean
  /** 当前会话是否启用论文联网搜索（仅论文会话） */
  enablePaperWebSearch?: boolean
  /** 当前会话绑定的已连接实验室 ID；null 表示未绑定 */
  activeLabId?: string | null
}

/**
 * 完整的会话数据
 * 存储在 JSON 文件中
 */
export interface SessionData extends SessionMeta {
  /** 会话包含的所有消息 */
  messages: SessionMessage[]
  /** 会话级选择状态 */
  selectionState?: SessionSelectionState
  /** 活跃能力状态（可选，兼容旧会话） */
  capabilities?: ActiveCapabilityState
}

export interface ActiveCapabilityState {
  presetId: string
  activeCapabilities: string[]
}

/**
 * 会话列表项
 * 用于在侧边栏显示会话信息
 */
export interface SessionListItem {
  /** 会话的唯一标识 */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 会话类型 */
  sessionType: SessionType
  /** 会话创建时间 */
  createdAt: string
  /** 会话最后更新时间 */
  updatedAt: string
}

/**
 * 会话操作的结果
 */
export interface SessionResult {
  /** 操作是否成功 */
  success: boolean
  /** 操作成功时返回的数据 */
  data?: SessionData
  /** 操作失败时的错误信息 */
  error?: string
}
