import { ipcMain, BrowserWindow } from 'electron'
import { voiceRecognitionService } from '@main/services/voiceRecognition'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { VoiceRecognitionConfig } from '@shared/types/config'

interface VoiceRecognitionStartResult {
  success: boolean
  error?: string
  info?: string
  refreshedToken?: string
}

function shouldAutoRefreshVoiceToken(error?: string): boolean {
  if (!error) {
    return false
  }

  return (
    /\b403\b/i.test(error) ||
    /forbidden/i.test(error) ||
    /token.*expired|expired.*token/i.test(error)
  )
}

async function refreshVoiceRecognitionToken(
  voiceConfig: VoiceRecognitionConfig
): Promise<
  | { success: true; config: VoiceRecognitionConfig; token: string }
  | { success: false; error: string }
> {
  if (!voiceConfig.accessKeyId || !voiceConfig.accessKeySecret) {
    return { success: false, error: '缺少 AccessKey，无法自动刷新 Token' }
  }

  const tokenResult = await voiceRecognitionService.fetchToken(
    voiceConfig.accessKeyId,
    voiceConfig.accessKeySecret
  )

  if (!tokenResult.success || !tokenResult.token) {
    return {
      success: false,
      error: tokenResult.error || '自动刷新 Token 失败'
    }
  }

  const updatedConfig: VoiceRecognitionConfig = {
    ...voiceConfig,
    token: tokenResult.token
  }

  const saveResult = configManager.updateConfig({
    voiceRecognition: updatedConfig
  })

  if (saveResult.success) {
    logger.info('自动刷新后的语音识别 Token 已保存', 'main')
  } else {
    logger.warn('自动刷新后的语音识别 Token 持久化失败', 'main', {
      error: saveResult.error
    })
  }

  return {
    success: true,
    config: updatedConfig,
    token: tokenResult.token
  }
}

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

      let activeConfig = voiceConfig
      let infoMessage: string | undefined
      let refreshedToken: string | undefined

      voiceRecognitionService.setConfig(activeConfig)

      let result = await voiceRecognitionService.startRealtimeRecognition(window)

      if (!result.success && shouldAutoRefreshVoiceToken(result.error)) {
        logger.warn('检测到语音识别鉴权可能已失效，准备自动刷新 Token', 'main', {
          error: result.error
        })

        const refreshResult = await refreshVoiceRecognitionToken(activeConfig)

        if (!refreshResult.success) {
          logger.warn('语音识别自动刷新 Token 失败', 'main', { error: refreshResult.error })
          result = {
            success: false,
            error: `${result.error || '启动语音识别失败'}；自动刷新 Token 失败：${refreshResult.error}`
          }
        } else {
          activeConfig = refreshResult.config
          infoMessage = '语音识别鉴权已自动刷新'
          refreshedToken = refreshResult.token

          logger.info('语音识别鉴权已自动刷新，正在重试启动', 'main')

          voiceRecognitionService.setConfig(activeConfig)
          result = await voiceRecognitionService.startRealtimeRecognition(window)
        }
      }

      if (result.success) {
        logger.info('实时语音识别已启动')
      } else {
        logger.warn('实时语音识别启动失败', 'main', { error: result.error })
      }

      const response: VoiceRecognitionStartResult = {
        ...result,
        info: infoMessage,
        refreshedToken
      }

      return response
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
