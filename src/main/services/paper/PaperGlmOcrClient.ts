import { net } from 'electron'
import { logger } from '@main/services/logger'
import type { OcrProviderId } from '@shared/types/config'
import { getOcrProviderPreset } from '@shared/types/config'

export const OCR_REQUEST_TIMEOUT_MS = 120_000

export interface GlmOcrRequestParams {
  provider: OcrProviderId
  apiKey: string
  base64Image: string
}

export interface GlmOcrRawResponse {
  success: boolean
  data?: unknown
  error?: string
  statusCode?: number
}

export class PaperGlmOcrClient {
  async recognizePage(params: GlmOcrRequestParams): Promise<GlmOcrRawResponse> {
    const preset = getOcrProviderPreset(params.provider)
    if (!preset) {
      return { success: false, error: '未知的 OCR 服务提供商' }
    }

    if (!params.apiKey?.trim()) {
      return { success: false, error: '请先在设置中配置 GLM-OCR API Key' }
    }

    try {
      const body = JSON.stringify({
        model: preset.modelName,
        file: params.base64Image,
        return_crop_images: true,
        need_layout_visualization: false
      })

      const response = await net.fetch(preset.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey.trim()}`
        },
        body,
        signal: AbortSignal.timeout(OCR_REQUEST_TIMEOUT_MS)
      })

      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'API Key 无效或已过期', statusCode: response.status }
      }

      if (response.status === 429) {
        return {
          success: false,
          error: 'API 调用额度已用尽，请稍后再试',
          statusCode: response.status
        }
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: `服务端错误（${response.status}），请稍后再试`,
          statusCode: response.status
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: `请求失败（${response.status}）`,
          statusCode: response.status
        }
      }

      const data = await response.json()
      return { success: true, data, statusCode: response.status }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
        return { success: false, error: '请求超时，请检查网络后重试' }
      }
      logger.error('OCR 请求失败', 'main', { error: errorMessage })
      return { success: false, error: '网络连接失败，请检查网络后重试' }
    }
  }
}
