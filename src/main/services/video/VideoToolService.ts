import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@shared/types/mcp'
import type {
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoGenerationTask,
  VideoToolAttachment,
  VideoToolResultPayload
} from '@shared/types/video'
import { VideoGenerationService } from './VideoGenerationService'

interface ToolArgs {
  [key: string]: unknown
}

/**
 * 视频工具服务
 * 将视频生成能力封装为聊天内可调用的内建工具
 */
const videoGenerationService = new VideoGenerationService()

export class VideoToolService {
  /**
   * 获取工具定义
   */
  getTools(): MCPTool[] {
    if (!videoGenerationService.isEnabled()) {
      return []
    }

    return [
      {
        name: 'video__generate',
        description:
          '当用户明确要求生成视频、制作短视频片段、把文字场景转成视频时使用。输入自然语言描述即可生成一个 5-10 秒的视频，并返回可播放的视频附件信息。',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: '视频画面的详细描述，应包含主体、动作、场景、镜头或氛围等关键信息'
            },
            size: {
              type: 'string',
              enum: ['1920x1080', '1080x1920', '1280x720'],
              description: '视频分辨率，可选；不传则使用设置中的默认分辨率'
            },
            quality: {
              type: 'string',
              enum: ['quality', 'speed'],
              description: '生成质量，可选；不传则使用设置中的默认质量'
            },
            withAudio: {
              type: 'boolean',
              description: '是否同时生成音频，可选；不传则使用设置中的默认值'
            }
          },
          required: ['prompt']
        },
        serverName: 'video'
      }
    ]
  }

  /**
   * 执行视频工具调用
   */
  async callTool(name: string, args: ToolArgs): Promise<MCPToolCallResult> {
    logger.info(`执行视频工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        case 'video__generate':
          return await this.generateVideo(args)
        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`视频工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  private async generateVideo(args: ToolArgs): Promise<MCPToolCallResult> {
    const request = this.parseGenerateRequest(args)
    if ('error' in request) {
      return {
        success: false,
        error: request.error
      }
    }

    let submittedTask: VideoGenerationTask | null = null
    let result: VideoGenerationResult | null = null

    try {
      submittedTask = await videoGenerationService.submitGenerationTask(request.value)

      if (submittedTask.taskStatus === 'SUCCESS' || submittedTask.taskStatus === 'FAIL') {
        result = await videoGenerationService.getTaskResult(submittedTask.id)
      } else {
        result = await videoGenerationService.pollTaskResult(submittedTask.id)
      }

      const payload = this.buildToolPayload(request.value.prompt, result)

      if (result.taskStatus === 'SUCCESS' && payload.attachment.url) {
        return {
          success: true,
          content: payload
        }
      }

      return {
        success: false,
        error: payload.attachment.errorMessage || '视频生成失败',
        content: payload
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const fallbackPayload = result
        ? this.buildToolPayload(request.value.prompt, result)
        : this.buildFailurePayload(request.value.prompt, errorMessage, submittedTask)

      return {
        success: false,
        error: errorMessage,
        content: fallbackPayload
      }
    }
  }

  private parseGenerateRequest(
    args: ToolArgs
  ): { value: VideoGenerationRequest } | { error: string } {
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''

    if (!prompt) {
      return {
        error: '缺少必需参数: prompt'
      }
    }

    const request: VideoGenerationRequest = {
      prompt
    }

    if (args.size === '1920x1080' || args.size === '1080x1920' || args.size === '1280x720') {
      request.size = args.size
    }

    if (args.quality === 'quality' || args.quality === 'speed') {
      request.quality = args.quality
    }

    if (typeof args.withAudio === 'boolean') {
      request.withAudio = args.withAudio
    }

    return {
      value: request
    }
  }

  private buildToolPayload(prompt: string, result: VideoGenerationResult): VideoToolResultPayload {
    const asset = result.videoResult?.[0]
    const attachment: VideoToolAttachment = {
      kind: 'video',
      provider: result.provider,
      model: result.model,
      prompt,
      taskId: result.id,
      status: result.taskStatus,
      url: asset?.url,
      coverImageUrl: asset?.coverImageUrl,
      errorMessage: result.error?.message
    }

    return {
      taskId: result.id,
      status: result.taskStatus,
      attachment
    }
  }

  private buildFailurePayload(
    prompt: string,
    errorMessage: string,
    task?: VideoGenerationTask | null
  ): VideoToolResultPayload {
    return {
      taskId: task?.id || '',
      status: 'FAIL',
      attachment: {
        kind: 'video',
        provider: 'zhipu',
        model: task?.model || videoGenerationService.getConfig().model,
        prompt,
        taskId: task?.id || '',
        status: 'FAIL',
        errorMessage
      }
    }
  }
}

export const videoToolService = new VideoToolService()
