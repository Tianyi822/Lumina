import { TokenUsage, MessageRole } from './chat'

/**
 * 持久化消息结构（兼容现有 ChatMessage，增加元数据）
 */
export interface SessionMessage {
  /** 消息唯一标识 */
  id: string
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
  /** 思考过程 */
  reasoning?: string
  /** 消息时间戳 */
  timestamp: string
  /** 使用的模型名称 */
  modelName?: string
  /** Token 使用统计 */
  usage?: TokenUsage
}

/**
 * 会话元数据
 */
export interface SessionMeta {
  /** 会话唯一标识 */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 会话简介 */
  description?: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * 完整会话数据（存储在 JSON 文件中）
 */
export interface SessionData extends SessionMeta {
  /** 消息列表 */
  messages: SessionMessage[]
}

/**
 * 会话列表项（用于侧边栏显示）
 */
export interface SessionListItem {
  /** 会话唯一标识 */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * 会话操作结果
 */
export interface SessionResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}
