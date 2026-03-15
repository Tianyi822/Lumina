import { ipcRenderer } from 'electron'
import type { ChatRequest, ChatResult, StreamEvent } from '@shared/types/chat'
import { createIpcListener } from './base'

/**
 * 聊天相关的 API
 */
export const chatApi = {
  /**
   * 发送聊天消息
   */
  send: (request: ChatRequest): Promise<ChatResult> => {
    return ipcRenderer.invoke('chat:send', request)
  },

  /**
   * 停止聊天请求
   */
  stop: (sessionId?: string): Promise<void> => {
    return ipcRenderer.invoke('chat:stop', sessionId)
  },

  /**
   * 监听流式响应事件
   */
  onStream: (callback: (event: StreamEvent) => void): (() => void) => {
    return createIpcListener<StreamEvent>('chat:stream', callback)
  }
}
