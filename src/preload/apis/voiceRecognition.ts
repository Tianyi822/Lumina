import { ipcRenderer } from 'electron'
import type { VoiceRecognitionConfig } from '@shared/types/config'

/**
 * 语音识别连接测试结果
 */
export interface VoiceRecognitionTestResult {
  success: boolean
  error?: string
}

/**
 * Token 获取结果
 */
export interface TokenFetchResult {
  success: boolean
  token?: string
  expireTime?: number
  error?: string
}

/**
 * 语音识别相关的 API
 */
export const voiceRecognitionApi = {
  /**
   * 测试语音识别连接
   */
  test: (config: VoiceRecognitionConfig): Promise<VoiceRecognitionTestResult> => {
    return ipcRenderer.invoke('voiceRecognition:test', config)
  },

  /**
   * 使用 AccessKey 获取 Token
   */
  fetchToken: (accessKeyId: string, accessKeySecret: string): Promise<TokenFetchResult> => {
    return ipcRenderer.invoke('voiceRecognition:fetchToken', accessKeyId, accessKeySecret)
  }
}
