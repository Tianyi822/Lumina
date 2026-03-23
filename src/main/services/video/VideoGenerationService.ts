import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import {
  createDefaultVideoGenerationConfig,
  type VideoGenerationConfig
} from '@shared/types/config'
import type {
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoGenerationTask,
  VideoTaskStatus
} from '@shared/types/video'

const DEFAULT_FPS = 30
const MIN_TIMEOUT_MS = 1000
const MAX_REQUEST_TIMEOUT_MS = 30000

interface ZhipuVideoTaskResponse {
  id: string
  model: string
  request_id: string
  task_status: VideoTaskStatus
}

interface ZhipuVideoResultResponse extends ZhipuVideoTaskResponse {
  created?: number
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  video_result?: Array<{
    url: string
    cover_image_url?: string
  }>
  error?: {
    code?: string
    message?: string
  }
}

/**
 * 视频生成服务
 * 负责使用主进程原生 fetch 对接智谱视频生成接口
 */
export class VideoGenerationService {
  /**
   * 获取当前视频配置
   */
  getConfig(): VideoGenerationConfig {
    return {
      ...createDefaultVideoGenerationConfig(),
      ...configManager.getConfig()?.videoGeneration
    }
  }

  /**
   * 配置是否完整
   */
  isConfigured(config: VideoGenerationConfig = this.getConfig()): boolean {
    return Boolean(config.baseUrl.trim() && config.apiKey?.trim() && config.model.trim())
  }

  /**
   * 功能是否可用
   */
  isEnabled(config: VideoGenerationConfig = this.getConfig()): boolean {
    return config.enabled && this.isConfigured(config)
  }

  /**
   * 提交视频生成任务
   */
  async submitGenerationTask(
    request: VideoGenerationRequest,
    configOverride?: VideoGenerationConfig
  ): Promise<VideoGenerationTask> {
    const config = this.requireUsableConfig(configOverride)
    const prompt = request.prompt.trim()

    if (!prompt) {
      throw new Error('视频生成提示词不能为空')
    }

    const payload = {
      model: request.model?.trim() || config.model,
      prompt,
      quality: request.quality || config.defaultQuality,
      with_audio: request.withAudio ?? config.defaultWithAudio,
      duration: request.duration ?? 5,
      size: request.size || config.defaultSize,
      fps: request.fps ?? DEFAULT_FPS
    }

    logger.info('开始提交视频生成任务', 'main', {
      model: payload.model,
      size: payload.size,
      quality: payload.quality,
      withAudio: payload.with_audio,
      duration: payload.duration
    })

    const response = await this.requestJson<ZhipuVideoTaskResponse>(
      '/api/paas/v4/videos/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      },
      config,
      this.getSingleRequestTimeoutMs(config)
    )

    return this.normalizeTask(response)
  }

  /**
   * 获取单次异步结果
   */
  async getTaskResult(
    taskId: string,
    configOverride?: VideoGenerationConfig,
    timeoutMs?: number
  ): Promise<VideoGenerationResult> {
    const config = this.requireUsableConfig(configOverride)
    const normalizedTaskId = taskId.trim()

    if (!normalizedTaskId) {
      throw new Error('视频任务 ID 不能为空')
    }

    const response = await this.requestJson<ZhipuVideoResultResponse>(
      `/api/paas/v4/async-result/${encodeURIComponent(normalizedTaskId)}`,
      {
        method: 'GET'
      },
      config,
      timeoutMs ?? this.getSingleRequestTimeoutMs(config)
    )

    return this.normalizeResult(response)
  }

  /**
   * 轮询直到任务完成
   */
  async pollTaskResult(
    taskId: string,
    configOverride?: VideoGenerationConfig
  ): Promise<VideoGenerationResult> {
    const config = this.requireUsableConfig(configOverride)
    const timeoutMs = this.getTotalTimeoutMs(config)
    const pollIntervalMs = this.getPollIntervalMs(config)
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now()
      const result = await this.getTaskResult(
        taskId,
        config,
        this.getSingleRequestTimeoutMs(config, remainingMs)
      )

      if (result.taskStatus === 'SUCCESS' || result.taskStatus === 'FAIL') {
        logger.info('视频任务轮询结束', 'main', {
          taskId,
          status: result.taskStatus,
          hasVideo: Boolean(result.videoResult?.length)
        })
        return result
      }

      if (Date.now() + pollIntervalMs >= deadline) {
        break
      }

      await this.sleep(pollIntervalMs)
    }

    throw new Error(`视频生成超时，超过 ${timeoutMs}ms 仍未完成`)
  }

  /**
   * 提交任务并轮询到结束
   */
  async generateVideo(
    request: VideoGenerationRequest,
    configOverride?: VideoGenerationConfig
  ): Promise<VideoGenerationResult> {
    const task = await this.submitGenerationTask(request, configOverride)
    if (task.taskStatus === 'SUCCESS' || task.taskStatus === 'FAIL') {
      return this.getTaskResult(task.id, configOverride)
    }
    return this.pollTaskResult(task.id, configOverride)
  }

  private requireUsableConfig(configOverride?: VideoGenerationConfig): VideoGenerationConfig {
    const config = {
      ...createDefaultVideoGenerationConfig(),
      ...configOverride,
      ...(!configOverride ? configManager.getConfig()?.videoGeneration : {})
    }

    if (!config.enabled) {
      throw new Error('视频生成功能未启用')
    }

    if (!this.isConfigured(config)) {
      throw new Error('视频生成配置不完整，请检查 Base URL、API Key 和模型名')
    }

    return {
      ...config,
      baseUrl: this.normalizeBaseUrl(config.baseUrl)
    }
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '')
  }

  private getPollIntervalMs(config: VideoGenerationConfig): number {
    return Math.max(config.pollIntervalMs ?? 5000, 1000)
  }

  private getTotalTimeoutMs(config: VideoGenerationConfig): number {
    return Math.max(config.requestTimeoutMs ?? 180000, MIN_TIMEOUT_MS)
  }

  private getSingleRequestTimeoutMs(config: VideoGenerationConfig, remainingMs?: number): number {
    const preferred = Math.min(this.getTotalTimeoutMs(config), MAX_REQUEST_TIMEOUT_MS)
    if (remainingMs === undefined) {
      return Math.max(preferred, MIN_TIMEOUT_MS)
    }
    return Math.max(Math.min(preferred, remainingMs), MIN_TIMEOUT_MS)
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    config: VideoGenerationConfig,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${config.apiKey?.trim() || ''}`,
          ...init.headers
        },
        signal: controller.signal
      })

      const rawText = await response.text()
      const data = this.parseJsonSafely(rawText)

      if (!response.ok) {
        throw new Error(this.extractErrorMessage(data) || `请求失败，状态码 ${response.status}`)
      }

      if (data === null) {
        throw new Error('视频服务返回了空响应')
      }

      return data as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`视频服务请求超时，超过 ${timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseJsonSafely(rawText: string): unknown {
    if (!rawText) {
      return null
    }

    try {
      return JSON.parse(rawText) as unknown
    } catch {
      return {
        message: rawText
      }
    }
  }

  private extractErrorMessage(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') {
      return undefined
    }

    const error = data as {
      error?: {
        message?: string
      }
      message?: string
    }

    return error.error?.message || error.message
  }

  private normalizeTask(response: ZhipuVideoTaskResponse): VideoGenerationTask {
    return {
      id: response.id,
      requestId: response.request_id,
      model: response.model,
      taskStatus: response.task_status
    }
  }

  private normalizeResult(response: ZhipuVideoResultResponse): VideoGenerationResult {
    return {
      ...this.normalizeTask(response),
      provider: 'zhipu',
      created: response.created,
      videoResult: response.video_result?.map((item) => ({
        url: item.url,
        coverImageUrl: item.cover_image_url
      })),
      error: response.error?.message
        ? {
            code: response.error.code,
            message: response.error.message
          }
        : undefined,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0
          }
        : undefined
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
