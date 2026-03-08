import { ipcMain } from 'electron'
import { voiceRecognitionService } from '@main/services/voiceRecognition'
import { logger } from '@main/services/logger'
import type { VoiceRecognitionConfig } from '@shared/types/config'

/**
 * 注册语音识别相关的 IPC 处理程序
 */
export function registerVoiceRecognitionHandlers(): void {
  // 测试语音识别连接
  ipcMain.handle('voiceRecognition:test', async (_event, config: VoiceRecognitionConfig) => {
    try {
      voiceRecognitionService.setConfig(config)
      const result = await voiceRecognitionService.testConnection()
      if (result.success) {
        logger.info('语音识别连接测试成功')
      } else {
        logger.warn('语音识别连接测试失败', 'main', { error: result.error })
      }
      return result
    } catch (error) {
      const errorMessage = `测试语音识别连接失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // 获取 Token
  ipcMain.handle(
    'voiceRecognition:fetchToken',
    async (_event, accessKeyId: string, accessKeySecret: string) => {
      try {
        const result = await voiceRecognitionService.fetchToken(accessKeyId, accessKeySecret)
        if (result.success) {
          logger.info('获取语音识别 Token 成功')
        } else {
          logger.warn('获取语音识别 Token 失败', 'main', { error: result.error })
        }
        return result
      } catch (error) {
        const errorMessage = `获取 Token 失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )
}
