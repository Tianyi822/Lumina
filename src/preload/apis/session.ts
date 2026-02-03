import { ipcRenderer } from 'electron'

/**
 * Token 使用统计
 */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}

/**
 * 会话消息类型
 */
export interface SessionMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: string
  modelName?: string
  usage?: TokenUsage
}

/**
 * 会话数据类型
 */
export interface SessionData {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

/**
 * 会话列表项类型
 */
export interface SessionListItem {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
}

/**
 * 会话操作结果类型
 */
export interface SessionResult {
  success: boolean
  error?: string
}

/**
 * 会话相关的 API
 */
export const sessionApi = {
  /**
   * 创建新会话
   */
  create: (title?: string): Promise<SessionData> => {
    return ipcRenderer.invoke('session:create', title)
  },

  /**
   * 保存会话
   */
  save: (data: SessionData): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:save', data)
  },

  /**
   * 加载会话
   */
  load: (sessionId: string): Promise<SessionData | null> => {
    return ipcRenderer.invoke('session:load', sessionId)
  },

  /**
   * 获取会话列表
   */
  list: (): Promise<SessionListItem[]> => {
    return ipcRenderer.invoke('session:list')
  },

  /**
   * 删除会话
   */
  delete: (sessionId: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:delete', sessionId)
  },

  /**
   * 重命名会话
   */
  rename: (sessionId: string, newTitle: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:rename', sessionId, newTitle)
  }
}
