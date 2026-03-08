import { logger } from '@main/services/logger'
import type { VoiceRecognitionConfig } from '@shared/types/config'

/**
 * 语音识别服务
 * 负责与阿里云语音识别 API 对接
 */
export class VoiceRecognitionService {
  private config: VoiceRecognitionConfig | null = null

  /**
   * 设置配置
   */
  setConfig(config: VoiceRecognitionConfig): void {
    this.config = config
  }

  /**
   * 获取当前配置
   */
  getConfig(): VoiceRecognitionConfig | null {
    return this.config
  }

  /**
   * 验证配置是否完整
   */
  isConfigValid(): boolean {
    if (!this.config) return false
    const { appkey, token } = this.config
    // Token 和 Appkey 是必需的
    return !!(token && appkey)
  }

  /**
   * 测试连接
   * 验证语音识别服务配置是否可用
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.config) {
      return { success: false, error: '语音识别配置未设置' }
    }

    const { token, appkey } = this.config

    if (!token) {
      return { success: false, error: 'Token 未配置' }
    }

    if (!appkey) {
      return { success: false, error: 'Appkey 未配置' }
    }

    try {
      // 动态导入阿里云 NLS SDK
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Nls = require('alibabacloud-nls')

      const URL = 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1'

      return new Promise((resolve) => {
        try {
          const st = new Nls.SpeechTranscription({
            url: URL,
            appkey,
            token
          })

          let resolved = false

          st.on('started', () => {
            if (!resolved) {
              resolved = true
              // 连接成功后立即关闭
              st.shutdown()
              logger.info('语音识别连接测试成功')
              resolve({ success: true })
            }
          })

          st.on('failed', (msg: string) => {
            if (!resolved) {
              resolved = true
              logger.warn('语音识别连接测试失败', 'main', { msg })
              resolve({ success: false, error: `连接失败: ${msg}` })
            }
          })

          // 设置超时
          setTimeout(() => {
            if (!resolved) {
              resolved = true
              st.shutdown()
              resolve({ success: false, error: '连接超时' })
            }
          }, 10000)

          // 尝试启动连接
          st.start(st.defaultStartParams(), true, 6000).catch((error: Error) => {
            if (!resolved) {
              resolved = true
              resolve({ success: false, error: error.message })
            }
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error('语音识别连接测试异常', 'main', { error: errorMessage })
          resolve({ success: false, error: errorMessage })
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // SDK 未安装
      if (errorMessage.includes('Cannot find module')) {
        return {
          success: false,
          error: '阿里云语音识别 SDK 未安装，请运行: yarn add alibabacloud-nls'
        }
      }
      logger.error('语音识别测试失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 使用 AccessKey 获取 Token
   * 参考: https://help.aliyun.com/zh/isi/getting-started/obtain-an-access-token
   */
  async fetchToken(accessKeyId: string, accessKeySecret: string): Promise<{
    success: boolean
    token?: string
    expireTime?: number
    error?: string
  }> {
    try {
      // 使用 HTTP 请求获取 Token
      const https = require('https')
      const crypto = require('crypto')

      // 构建请求参数
      // 阿里云 API 要求时间戳格式为 YYYY-MM-DDTHH:mm:ssZ (UTC 时间)
      const now = new Date()
      const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
      const nonce = Math.random().toString(36).substring(2)

      const params = {
        AccessKeyId: accessKeyId,
        Action: 'CreateToken',
        Format: 'JSON',
        RegionId: 'cn-shanghai',
        SignatureMethod: 'HMAC-SHA1',
        SignatureNonce: nonce,
        SignatureVersion: '1.0',
        Timestamp: timestamp,
        Version: '2019-02-28'
      }

      // 构建签名字符串
      const canonicalizedQueryString = Object.keys(params)
        .sort()
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key as keyof typeof params])}`)
        .join('&')

      const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQueryString)}`

      // 计算签名
      const signature = crypto
        .createHmac('sha1', `${accessKeySecret}&`)
        .update(stringToSign)
        .digest('base64')

      const signatureEncoded = encodeURIComponent(signature)

      // 构建完整 URL
      const url = `https://nls-meta.cn-shanghai.aliyuncs.com/?${canonicalizedQueryString}&Signature=${signatureEncoded}`

      return new Promise((resolve) => {
        https
          .get(url, (res: any) => {
            let data = ''
            res.on('data', (chunk: string) => {
              data += chunk
            })
            res.on('end', () => {
              try {
                const result = JSON.parse(data)
                if (result.Token) {
                  logger.info('语音识别 Token 获取成功')
                  resolve({
                    success: true,
                    token: result.Token.Id,
                    expireTime: result.Token.ExpireTime
                  })
                } else if (result.Code) {
                  logger.warn('语音识别 Token 获取失败', 'main', { code: result.Code, message: result.Message })
                  resolve({
                    success: false,
                    error: `${result.Code}: ${result.Message}`
                  })
                } else {
                  resolve({ success: false, error: '未知响应格式' })
                }
              } catch (parseError) {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError)
                logger.error('解析 Token 响应失败', 'main', { error: errorMessage })
                resolve({ success: false, error: errorMessage })
              }
            })
          })
          .on('error', (error: Error) => {
            logger.error('请求 Token 失败', 'main', { error: error.message })
            resolve({ success: false, error: error.message })
          })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Token 异常', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}

/**
 * 语音识别服务单例
 */
export const voiceRecognitionService = new VoiceRecognitionService()
