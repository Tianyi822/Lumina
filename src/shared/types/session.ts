import { TokenUsage, MessageRole, ToolCallMessage } from './chat'

/**
 * 会话的类型
 */
export type SessionType = 'default' | 'tool' | 'knowledge'

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
 * 完整的会话数据
 * 存储在 JSON 文件中
 */
export interface SessionData extends SessionMeta {
  /** 会话包含的所有消息 */
  messages: SessionMessage[]
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
  /** 操作失败时的错误信息 */
  error?: string
}
