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

function normalizeImagePayload(base64Image: string): string {
  const trimmed = base64Image.trim()
  if (trimmed.startsWith('data:')) {
    return trimmed
  }

  // 论文页图当前统一保存为 JPEG，这里补齐 data URL 前缀以匹配 OCR 接口示例。
  return `data:image/jpeg;base64,${trimmed}`
}

function extractRemoteErrorMessage(responseText: string): string | undefined {
  if (!responseText) {
    return undefined
  }

  try {
    const parsed = JSON.parse(responseText) as {
      error?: { message?: string }
      message?: string
      msg?: string
      detail?: string
    }
    return (
      parsed.error?.message ||
      parsed.message ||
      parsed.msg ||
      parsed.detail ||
      undefined
    )
  } catch {
    return responseText.trim().slice(0, 200)
  }
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
        file: normalizeImagePayload(params.base64Image),
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
        const responseText = await response.text()
        const remoteErrorMessage = extractRemoteErrorMessage(responseText)
        logger.warn('OCR 请求返回非成功状态码', 'main', {
          statusCode: response.status,
          responseText: responseText.slice(0, 500)
        })
        return {
          success: false,
          error: remoteErrorMessage
            ? `请求失败（${response.status}）：${remoteErrorMessage}`
            : `请求失败（${response.status}）`,
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
