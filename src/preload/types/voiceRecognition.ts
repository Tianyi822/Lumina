/**
 * 语音识别配置
 */
export interface VoiceRecognitionConfig {
  provider: 'aliyun'
  accessKeyId?: string
  accessKeySecret?: string
  token?: string
  appkey?: string
  enabled?: boolean
}

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
 * 语音识别启动结果
 */
export interface VoiceRecognitionStartResult {
  success: boolean
  error?: string
  info?: string
  refreshedToken?: string
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
 * 语音识别 API
 */
export interface VoiceRecognitionApi {
  test: (config: VoiceRecognitionConfig) => Promise<VoiceRecognitionTestResult>
  fetchToken: (accessKeyId: string, accessKeySecret: string) => Promise<TokenFetchResult>
  start: () => Promise<VoiceRecognitionStartResult>
  stop: () => Promise<{ success: boolean; error?: string }>
  sendAudio: (audioData: Uint8Array) => void
  onResult: (callback: (event: VoiceRecognitionResultEvent) => void) => () => void
}
