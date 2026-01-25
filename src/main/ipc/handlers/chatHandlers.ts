import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { chatService } from '../../services/chat'
import { logger } from '../../services/logger'
import type { ChatRequest, ChatResult } from '../../types/chat'

/**
 * 注册聊天相关的 IPC 处理程序
 */
export function registerChatHandlers(): void {
  /**
   * 发送聊天消息
   * 使用 event.sender (webContents) 发送流式响应
   */
  ipcMain.handle(
    'chat:send',
    async (event: IpcMainInvokeEvent, request: ChatRequest): Promise<ChatResult> => {
      try {
        logger.debug('收到聊天请求', 'main', {
          sessionId: request.sessionId,
          modelKey: request.modelKey,
          messageCount: request.messages.length,
          enableThinking: request.enableThinking
        })

        // 使用 event.sender 发送流式响应
        return await chatService.sendMessage(request, event.sender)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('聊天处理程序错误', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  /**
   * 中止聊天请求
   * @param sessionId 可选的会话标识。如果提供，只中止该会话的请求；否则中止所有请求
   */
  ipcMain.handle('chat:stop', async (_event: IpcMainInvokeEvent, sessionId?: string): Promise<void> => {
    try {
      logger.debug('收到中止请求', 'main', { sessionId })
      chatService.stopRequest(sessionId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('中止请求失败', 'main', { sessionId, error: errorMessage })
    }
  })
}
