import { BrowserWindow, type WebContents } from 'electron'
import { logger } from '@main/services/logger'
import { sessionService } from '@main/services/session'
import type { AttachedVideo, ToolResultInfo } from '@shared/types/chat'
import type { MCPTool, MCPToolCallResult } from '@shared/types/mcp'
import type {
  ReActIterationData,
  ReActStepData,
  SessionData,
  SessionMessage
} from '@shared/types/session'
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

interface VideoToolExecutionContext {
  sessionId: string
  toolCallId: string
  toolName: string
  webContents?: WebContents
}

interface PendingVideoTaskRecord {
  context: Omit<VideoToolExecutionContext, 'webContents'>
  prompt: string
  taskId: string
  model: string
}

const VIDEO_SIZE_OPTIONS = ['1920x1080', '1080x1920', '1280x720'] as const
const VIDEO_QUALITY_OPTIONS = ['quality', 'speed'] as const
const VIDEO_DURATION_OPTIONS = [5, 10] as const
const SESSION_UPDATE_RETRY_INTERVAL_MS = 1000
const SESSION_UPDATE_MAX_WAIT_MS = 30000

/**
 * 视频工具服务
 * 将视频生成能力封装为聊天内可调用的内建工具
 */
const videoGenerationService = new VideoGenerationService()

export class VideoToolService {
  private readonly activeTrackingTasks = new Set<string>()

  /**
   * 获取工具定义
   */
  getTools(): MCPTool[] {
    if (!videoGenerationService.isEnabled()) {
      return []
    }

    return [
      {
        name: 'video__request_generation_config',
        description:
          '当用户想生成视频，但还没有明确确认当前视频的分辨率、质量、是否生成音频、视频时长时，先调用此工具向用户收集本次视频配置；这些选择只影响当前视频，不会修改全局默认配置。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'video'
      },
      {
        name: 'video__generate',
        description:
          '当用户明确要求生成视频、制作短视频片段、把文字场景转成视频，并且已经明确给出或刚确认了本次视频配置时使用。若分辨率、质量、音频、时长尚未确认，先调用 video__request_generation_config。输入自然语言描述即可生成一个 5-10 秒的视频，并返回可播放的视频附件信息。',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: '视频画面的详细描述，应包含主体、动作、场景、镜头或氛围等关键信息'
            },
            size: {
              type: 'string',
              enum: [...VIDEO_SIZE_OPTIONS],
              description: '视频分辨率，可选；不传则使用设置中的默认分辨率'
            },
            quality: {
              type: 'string',
              enum: [...VIDEO_QUALITY_OPTIONS],
              description: '生成质量，可选；不传则使用设置中的默认质量'
            },
            withAudio: {
              type: 'boolean',
              description: '是否同时生成音频，可选；不传则使用设置中的默认值'
            },
            duration: {
              type: 'integer',
              enum: [...VIDEO_DURATION_OPTIONS],
              description: '视频时长（秒），可选；不传则使用默认 5 秒'
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
  async callTool(
    name: string,
    args: ToolArgs,
    context?: VideoToolExecutionContext
  ): Promise<MCPToolCallResult> {
    logger.info(`执行视频工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        case 'video__request_generation_config':
          return this.requestGenerationConfig()
        case 'video__generate':
          return await this.generateVideo(args, context)
        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`视频工具执行失败: ${name}`, 'main', {
        error: errorMessage,
        args,
        sessionId: context?.sessionId,
        toolCallId: context?.toolCallId
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 启动时恢复会话里未完成的视频任务
   */
  async recoverPendingTasks(): Promise<void> {
    if (!videoGenerationService.isEnabled()) {
      logger.info('跳过恢复未完成视频任务，视频服务当前不可用', 'main')
      return
    }

    sessionService.initialize()

    const pendingTasks = await this.collectPendingTasks()
    if (pendingTasks.length === 0) {
      logger.info('启动恢复未发现未完成的视频任务', 'main')
      return
    }

    logger.info('启动恢复未完成的视频任务', 'main', {
      taskCount: pendingTasks.length,
      sessionCount: new Set(pendingTasks.map((task) => task.context.sessionId)).size
    })

    for (const pendingTask of pendingTasks) {
      this.trackVideoTask(
        {
          context: pendingTask.context,
          prompt: pendingTask.prompt,
          submittedTask: {
            id: pendingTask.taskId,
            requestId: pendingTask.taskId,
            model: pendingTask.model,
            taskStatus: 'PROCESSING'
          }
        },
        'recovery'
      )
    }
  }

  private requestGenerationConfig(): MCPToolCallResult {
    const config = videoGenerationService.getConfig()

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            interactionType: 'video_generation_config',
            question:
              '请选择当前视频生成配置，我会只按这一次的选择继续生成，不会改动全局默认配置。',
            options: [],
            videoGenerationConfig: {
              defaultSize: config.defaultSize,
              sizeOptions: [...VIDEO_SIZE_OPTIONS],
              defaultQuality: config.defaultQuality,
              qualityOptions: [...VIDEO_QUALITY_OPTIONS],
              defaultWithAudio: config.defaultWithAudio,
              durationOptions: [...VIDEO_DURATION_OPTIONS],
              defaultDuration: 5
            }
          })
        }
      ]
    }
  }

  private async generateVideo(
    args: ToolArgs,
    context?: VideoToolExecutionContext
  ): Promise<MCPToolCallResult> {
    const request = this.parseGenerateRequest(args)
    if ('error' in request) {
      return {
        success: false,
        error: request.error
      }
    }

    if (context && !this.hasCompleteGenerationConfig(request.value)) {
      return this.requestGenerationConfig()
    }

    if (!context) {
      return this.generateVideoSynchronously(request.value)
    }

    return this.generateVideoAsynchronously(request.value, context)
  }

  private async generateVideoSynchronously(
    request: VideoGenerationRequest
  ): Promise<MCPToolCallResult> {
    let submittedTask: VideoGenerationTask | null = null
    let result: VideoGenerationResult | null = null

    try {
      submittedTask = await videoGenerationService.submitGenerationTask(request)

      if (submittedTask.taskStatus === 'SUCCESS' || submittedTask.taskStatus === 'FAIL') {
        result = await videoGenerationService.getTaskResult(submittedTask.id)
      } else {
        result = await videoGenerationService.pollTaskResult(submittedTask.id)
      }

      const payload = this.buildToolPayload(request.prompt, result)

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
        ? this.buildToolPayload(request.prompt, result)
        : this.buildFailurePayload(request.prompt, errorMessage, submittedTask)

      return {
        success: false,
        error: errorMessage,
        content: fallbackPayload
      }
    }
  }

  private async generateVideoAsynchronously(
    request: VideoGenerationRequest,
    context: VideoToolExecutionContext
  ): Promise<MCPToolCallResult> {
    const submittedTask = await videoGenerationService.submitGenerationTask(request)

    if (submittedTask.taskStatus === 'SUCCESS' || submittedTask.taskStatus === 'FAIL') {
      const result = await videoGenerationService.getTaskResult(submittedTask.id)
      const payload = this.buildToolPayload(request.prompt, result)

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
    }

    const processingPayload = this.buildProcessingPayload(request.prompt, submittedTask)

    this.trackVideoTask({
      context,
      prompt: request.prompt,
      submittedTask
    })

    return {
      success: true,
      content: processingPayload
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

    if (args.duration === 5 || args.duration === 10) {
      request.duration = args.duration
    }

    return {
      value: request
    }
  }

  private hasCompleteGenerationConfig(request: VideoGenerationRequest): boolean {
    return Boolean(
      request.size && request.quality && typeof request.withAudio === 'boolean' && request.duration
    )
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

  private buildProcessingPayload(
    prompt: string,
    task: VideoGenerationTask
  ): VideoToolResultPayload {
    return {
      taskId: task.id,
      status: 'PROCESSING',
      attachment: {
        kind: 'video',
        provider: 'zhipu',
        model: task.model,
        prompt,
        taskId: task.id,
        status: 'PROCESSING'
      }
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

  private trackVideoTask(
    params: {
      context: VideoToolExecutionContext
      prompt: string
      submittedTask: VideoGenerationTask
    },
    source: 'runtime' | 'recovery' = 'runtime'
  ): void {
    const trackingKey = this.getTrackingKey(
      params.context.sessionId,
      params.context.toolCallId,
      params.submittedTask.id
    )

    if (this.activeTrackingTasks.has(trackingKey)) {
      logger.info('跳过重复的视频任务轮询', 'main', {
        source,
        sessionId: params.context.sessionId,
        toolCallId: params.context.toolCallId,
        taskId: params.submittedTask.id
      })
      return
    }

    this.activeTrackingTasks.add(trackingKey)
    void this.runTrackedVideoTask(params, trackingKey, source)
  }

  private async runTrackedVideoTask(
    params: {
      context: VideoToolExecutionContext
      prompt: string
      submittedTask: VideoGenerationTask
    },
    trackingKey: string,
    source: 'runtime' | 'recovery'
  ): Promise<void> {
    const { context, prompt, submittedTask } = params

    logger.info('开始后台轮询视频任务', 'main', {
      source,
      sessionId: context.sessionId,
      toolCallId: context.toolCallId,
      taskId: submittedTask.id
    })

    try {
      const result = await videoGenerationService.pollTaskResult(submittedTask.id)
      const payload = this.buildToolPayload(prompt, result)
      const success = result.taskStatus === 'SUCCESS' && Boolean(payload.attachment.url)
      const error = success ? undefined : payload.attachment.errorMessage || '视频生成失败'

      await this.persistVideoResult(context, payload, success, error)
      this.emitToolResultUpdate(context, payload, success, error)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const payload = this.buildFailurePayload(prompt, errorMessage, submittedTask)

      await this.persistVideoResult(context, payload, false, errorMessage)
      this.emitToolResultUpdate(context, payload, false, errorMessage)
    } finally {
      this.activeTrackingTasks.delete(trackingKey)
    }
  }

  private async collectPendingTasks(): Promise<PendingVideoTaskRecord[]> {
    const pendingTasks = new Map<string, PendingVideoTaskRecord>()

    for await (const session of sessionService.iterateSessionsAsync()) {
      for (const task of this.extractPendingTasksFromSession(session)) {
        pendingTasks.set(
          this.getTrackingKey(task.context.sessionId, task.context.toolCallId, task.taskId),
          task
        )
      }
    }

    return [...pendingTasks.values()]
  }

  private extractPendingTasksFromSession(session: SessionData): PendingVideoTaskRecord[] {
    const pendingTasks: PendingVideoTaskRecord[] = []

    for (const message of session.messages) {
      if (message.role !== 'tool' || !message.tool_call_id) {
        continue
      }

      const payload = this.parseVideoToolPayload(message.content)
      if (
        !payload ||
        payload.status !== 'PROCESSING' ||
        payload.attachment.status !== 'PROCESSING'
      ) {
        continue
      }

      const assistantMessage = this.findAssistantMessage(session, message.tool_call_id)
      const toolName = this.resolveToolName(assistantMessage, message.tool_call_id)

      pendingTasks.push({
        context: {
          sessionId: session.sessionId,
          toolCallId: message.tool_call_id,
          toolName
        },
        prompt: payload.attachment.prompt,
        taskId: payload.taskId,
        model: payload.attachment.model
      })
    }

    return pendingTasks
  }

  private parseVideoToolPayload(content: string): VideoToolResultPayload | null {
    try {
      const parsed = JSON.parse(content) as unknown
      if (this.isVideoToolResultPayload(parsed)) {
        return parsed
      }

      if (
        parsed &&
        typeof parsed === 'object' &&
        'result' in parsed &&
        this.isVideoToolResultPayload((parsed as { result?: unknown }).result)
      ) {
        return (parsed as { result: VideoToolResultPayload }).result
      }

      return null
    } catch {
      return null
    }
  }

  private isVideoToolResultPayload(result: unknown): result is VideoToolResultPayload {
    if (!result || typeof result !== 'object') {
      return false
    }

    const payload = result as Partial<VideoToolResultPayload>
    return (
      typeof payload.taskId === 'string' &&
      typeof payload.status === 'string' &&
      !!payload.attachment &&
      typeof payload.attachment === 'object' &&
      (payload.attachment as { kind?: string }).kind === 'video'
    )
  }

  private resolveToolName(message: SessionMessage | null, toolCallId: string): string {
    const functionName = message?.tool_calls?.find((toolCall) => toolCall.id === toolCallId)
      ?.function.name

    if (!functionName) {
      return 'generate'
    }

    return functionName.startsWith('video__') ? functionName.slice('video__'.length) : functionName
  }

  private getTrackingKey(sessionId: string, toolCallId: string, taskId: string): string {
    return `${sessionId}:${toolCallId}:${taskId}`
  }

  private async persistVideoResult(
    context: VideoToolExecutionContext,
    payload: VideoToolResultPayload,
    success: boolean,
    error?: string
  ): Promise<void> {
    const session = await this.waitForSession(context.sessionId, context.toolCallId)
    if (!session) {
      logger.warn('视频任务完成，但未找到对应会话进行回填', 'main', {
        sessionId: context.sessionId,
        toolCallId: context.toolCallId,
        taskId: payload.taskId
      })
      return
    }

    const assistantMessage = this.findAssistantMessage(session, context.toolCallId)
    if (!assistantMessage) {
      logger.warn('视频任务完成，但未找到对应 assistant 消息', 'main', {
        sessionId: context.sessionId,
        toolCallId: context.toolCallId,
        taskId: payload.taskId
      })
      return
    }

    this.upsertAttachedVideo(assistantMessage, payload.attachment)
    this.upsertToolResultStep(assistantMessage, context, payload, success, error)
    this.upsertToolMessage(session, context, payload, success, error)

    const saveResult = sessionService.saveSession(session)
    if (!saveResult.success) {
      logger.warn('视频任务结果写回会话失败', 'main', {
        sessionId: context.sessionId,
        toolCallId: context.toolCallId,
        error: saveResult.error
      })
    }
  }

  private emitToolResultUpdate(
    context: VideoToolExecutionContext,
    payload: VideoToolResultPayload,
    success: boolean,
    error?: string
  ): void {
    const webContents = context.webContents
    const event = {
      type: 'tool_result',
      sessionId: context.sessionId,
      toolResult: {
        id: context.toolCallId,
        name: context.toolName,
        success,
        result: payload,
        error
      }
    }

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('chat:stream', event)
      return
    }

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('chat:stream', event)
      }
    }
  }

  private async waitForSession(sessionId: string, toolCallId: string): Promise<SessionData | null> {
    const deadline = Date.now() + SESSION_UPDATE_MAX_WAIT_MS

    while (Date.now() < deadline) {
      const session = sessionService.loadSession(sessionId)
      if (session && this.findAssistantMessage(session, toolCallId)) {
        return session
      }

      await this.sleep(SESSION_UPDATE_RETRY_INTERVAL_MS)
    }

    return sessionService.loadSession(sessionId)
  }

  private findAssistantMessage(session: SessionData, toolCallId: string): SessionMessage | null {
    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index]
      if (
        message.role === 'assistant' &&
        (message.tool_calls?.some((toolCall) => toolCall.id === toolCallId) ||
          message.reactSteps?.some(
            (step) => step.toolCall?.id === toolCallId || step.toolResult?.id === toolCallId
          ) ||
          message.reactIterations?.some((iteration) =>
            iteration.steps.some(
              (step) => step.toolCall?.id === toolCallId || step.toolResult?.id === toolCallId
            )
          ))
      ) {
        return message
      }
    }

    return null
  }

  private upsertAttachedVideo(message: SessionMessage, attachment: VideoToolAttachment): void {
    const attachedVideo: AttachedVideo = {
      provider: attachment.provider,
      model: attachment.model,
      prompt: attachment.prompt,
      url: attachment.url || '',
      coverImageUrl: attachment.coverImageUrl,
      taskId: attachment.taskId,
      status: attachment.status,
      errorMessage: attachment.errorMessage
    }

    if (!message.attachedVideos) {
      message.attachedVideos = []
    }

    const existingIndex = message.attachedVideos.findIndex(
      (video) =>
        (attachedVideo.taskId && video.taskId === attachedVideo.taskId) ||
        (!attachedVideo.taskId &&
          video.prompt === attachedVideo.prompt &&
          video.model === attachedVideo.model)
    )

    if (existingIndex >= 0) {
      message.attachedVideos[existingIndex] = attachedVideo
      return
    }

    message.attachedVideos.push(attachedVideo)
  }

  private upsertToolResultStep(
    message: SessionMessage,
    context: VideoToolExecutionContext,
    payload: VideoToolResultPayload,
    success: boolean,
    error?: string
  ): void {
    const toolResult: ToolResultInfo = {
      id: context.toolCallId,
      name: context.toolName,
      success,
      result: payload,
      error
    }
    const timestamp = new Date().toISOString()

    const updatedLegacy = this.updateToolResultInSteps(
      message.reactSteps,
      context.toolCallId,
      toolResult
    )
    const updatedIterations = this.updateToolResultInIterations(
      message.reactIterations,
      context.toolCallId,
      toolResult
    )

    if (!updatedLegacy) {
      if (!message.reactSteps) {
        message.reactSteps = []
      }
      message.reactSteps.push({
        type: 'tool_result',
        toolResult,
        timestamp
      })
    }

    if (!updatedIterations) {
      if (!message.reactIterations) {
        message.reactIterations = []
      }

      const lastIteration = message.reactIterations[message.reactIterations.length - 1]
      if (lastIteration) {
        lastIteration.steps.push({
          type: 'tool_result',
          toolResult,
          timestamp
        })
      }
    }
  }

  private updateToolResultInSteps(
    steps: ReActStepData[] | undefined,
    toolCallId: string,
    toolResult: ToolResultInfo
  ): boolean {
    if (!steps) {
      return false
    }

    const existing = steps.find(
      (step) => step.type === 'tool_result' && step.toolResult?.id === toolCallId
    )

    if (!existing) {
      return false
    }

    existing.toolResult = toolResult
    existing.timestamp = new Date().toISOString()
    return true
  }

  private updateToolResultInIterations(
    iterations: ReActIterationData[] | undefined,
    toolCallId: string,
    toolResult: ToolResultInfo
  ): boolean {
    if (!iterations) {
      return false
    }

    for (const iteration of iterations) {
      const updated = this.updateToolResultInSteps(iteration.steps, toolCallId, toolResult)
      if (updated) {
        return true
      }
    }

    return false
  }

  private upsertToolMessage(
    session: SessionData,
    context: VideoToolExecutionContext,
    payload: VideoToolResultPayload,
    success: boolean,
    error?: string
  ): void {
    const serializedContent = success
      ? JSON.stringify(payload)
      : JSON.stringify({
          error,
          result: payload
        })

    const existingMessage = session.messages.find(
      (message) => message.role === 'tool' && message.tool_call_id === context.toolCallId
    )

    if (existingMessage) {
      existingMessage.content = serializedContent
      existingMessage.timestamp = new Date().toISOString()
      return
    }

    session.messages.push({
      id: `tool-${context.toolCallId}-${Date.now()}`,
      role: 'tool',
      content: serializedContent,
      timestamp: new Date().toISOString(),
      tool_call_id: context.toolCallId
    })
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const videoToolService = new VideoToolService()
