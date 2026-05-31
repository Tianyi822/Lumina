import { ipcRenderer } from 'electron'
import type {
  SessionData,
  SessionListItem,
  SessionResult,
  SessionType
} from '@shared/types/session'

/**
 * 会话相关的 API
 */
export const sessionApi = {
  /**
   * 创建新会话
   */
  create: (title?: string, type?: SessionType): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:create', title, type)
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
  load: (sessionId: string): Promise<SessionResult> => {
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
