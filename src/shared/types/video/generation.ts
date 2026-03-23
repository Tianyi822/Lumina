import type { VideoGenerationProvider, VideoQuality, VideoSize } from '../config'

/**
 * 视频任务状态
 */
export type VideoTaskStatus = 'PROCESSING' | 'SUCCESS' | 'FAIL'

/**
 * 视频生成请求参数
 */
export interface VideoGenerationRequest {
  prompt: string
  model?: string
  size?: VideoSize
  quality?: VideoQuality
  withAudio?: boolean
  fps?: number
}

/**
 * 视频生成任务基础信息
 */
export interface VideoGenerationTask {
  id: string
  requestId: string
  model: string
  taskStatus: VideoTaskStatus
}

/**
 * 视频生成错误信息
 */
export interface VideoGenerationError {
  code?: string
  message: string
}

/**
 * 视频生成结果项
 */
export interface VideoGenerationAsset {
  url: string
  coverImageUrl?: string
}

/**
 * 聊天消息中使用的视频附件载荷
 */
export interface VideoToolAttachment {
  kind: 'video'
  provider: VideoGenerationProvider
  model: string
  prompt: string
  taskId: string
  status: VideoTaskStatus
  url?: string
  coverImageUrl?: string
  errorMessage?: string
}

/**
 * 视频工具的统一返回结构
 */
export interface VideoToolResultPayload {
  taskId: string
  status: VideoTaskStatus
  attachment: VideoToolAttachment
}

/**
 * 视频生成结果
 */
export interface VideoGenerationResult extends VideoGenerationTask {
  provider: VideoGenerationProvider
  created?: number
  videoResult?: VideoGenerationAsset[]
  error?: VideoGenerationError
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
