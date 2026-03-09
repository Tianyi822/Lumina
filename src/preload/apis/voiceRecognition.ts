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
 * 语音识别结果事件
 */
export interface VoiceRecognitionResultEvent {
  type: 'started' | 'partial' | 'final' | 'stopped' | 'error'
  data: {
    text?: string
    message?: string
    error?: string
  }
}

/**
 * 语音识别相关的 API
 */
export const voiceRecognitionApi = {
  /**
   * 测试语音识别连接
   */
  test: (config: VoiceRecognitionConfig): Promise<VoiceRecognitionTestResult> => {
    return ipcRenderer.invoke('voiceRecognition:test', { ...config })
  },

  /**
   * 使用 AccessKey 获取 Token
   */
  fetchToken: (accessKeyId: string, accessKeySecret: string): Promise<TokenFetchResult> => {
    return ipcRenderer.invoke('voiceRecognition:fetchToken', accessKeyId, accessKeySecret)
  },

  /**
   * 开始实时语音识别
   */
  start: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('voiceRecognition:start')
  },

  /**
   * 停止实时语音识别
   */
  stop: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('voiceRecognition:stop')
  },

  /**
   * 发送音频数据
   * @param audioData PCM 格式音频数据 (16kHz, 16bit, 单声道)
   */
  sendAudio: (audioData: Uint8Array): void => {
    ipcRenderer.send('voiceRecognition:sendAudio', Buffer.from(audioData))
  },

  /**
   * 监听语音识别结果
   * @param callback 回调函数
   * @returns 取消监听函数
   */
  onResult: (callback: (event: VoiceRecognitionResultEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: VoiceRecognitionResultEvent): void => {
      callback(data)
    }
    ipcRenderer.on('voiceRecognition:result', handler)
    return () => {
      ipcRenderer.removeListener('voiceRecognition:result', handler)
    }
  }
}
