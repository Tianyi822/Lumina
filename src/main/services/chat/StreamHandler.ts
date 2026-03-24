import type { WebContents } from 'electron'
import type { ReactIterationStatus, StreamEvent } from '../../types/chat'

/**
 * 流式处理器
 * 负责发送流式事件到渲染进程
 */
export class StreamHandler {
  /**
   * 发送流式事件到渲染进程
   */
  sendStreamEvent(webContents: WebContents, event: StreamEvent): void {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream', event)
    }
  }

  /**
   * 发送内容事件
   */
  sendContent(webContents: WebContents, sessionId: string, content: string): void {
    this.sendStreamEvent(webContents, {
      type: 'content',
      content,
      sessionId
    })
  }

  /**
   * 发送推理内容事件
   */
  sendReasoning(webContents: WebContents, sessionId: string, content: string): void {
    this.sendStreamEvent(webContents, {
      type: 'reasoning',
      content,
      sessionId
    })
  }

  /**
   * 发送完成事件
   */
  sendDone(
    webContents: WebContents,
    sessionId: string,
    usage?: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
      reasoning_tokens?: number
    }
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'done',
      usage,
      sessionId
    })
  }

  /**
   * 发送错误事件
   */
  sendError(webContents: WebContents, sessionId: string, error: string): void {
    this.sendStreamEvent(webContents, {
      type: 'error',
      error,
      sessionId
    })
  }

  /**
   * 发送 ReAct 迭代开始事件
   */
  sendReactIterationStart(
    webContents: WebContents,
    sessionId: string,
    iteration: number,
    status: ReactIterationStatus = 'thinking'
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'react_iteration_start',
      content: String(iteration),
      sessionId,
      status
    })
  }
}

export const streamHandler = new StreamHandler()
