import { ipcMain, BrowserWindow } from 'electron'
import { voiceRecognitionService } from '@main/services/voiceRecognition'
import { configManager } from '@main/services/config'
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

  // 开始实时语音识别
  ipcMain.handle('voiceRecognition:start', async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        return { success: false, error: '无法获取窗口' }
      }

      // 从 ConfigManager 获取语音识别配置
      const appConfig = configManager.getConfig()
      const voiceConfig = appConfig?.voiceRecognition

      if (!voiceConfig || !voiceConfig.token || !voiceConfig.appkey) {
        return { success: false, error: '语音识别配置未设置，请先在设置中配置语音识别' }
      }

      // 设置配置到服务
      voiceRecognitionService.setConfig(voiceConfig)

      const result = await voiceRecognitionService.startRealtimeRecognition(window)
      if (result.success) {
        logger.info('实时语音识别已启动')
      } else {
        logger.warn('实时语音识别启动失败', 'main', { error: result.error })
      }
      return result
    } catch (error) {
      const errorMessage = `启动实时语音识别失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // 停止实时语音识别
  ipcMain.handle('voiceRecognition:stop', async () => {
    try {
      await voiceRecognitionService.stopRealtimeRecognition()
      logger.info('实时语音识别已停止')
      return { success: true }
    } catch (error) {
      const errorMessage = `停止实时语音识别失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // 发送音频数据
  ipcMain.on('voiceRecognition:sendAudio', (_event, audioData: Buffer) => {
    try {
      voiceRecognitionService.sendAudioData(audioData)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('发送音频数据失败', 'main', { error: errorMessage })
    }
  })
}
