import OpenApiClient, { $OpenApiUtil } from '@alicloud/openapi-core'
import * as $Dara from '@darabonba/typescript'
import { logger } from '@main/services/logger'
import type { AliyunMiaobiConfig } from '@shared/types/config'
import { aliyunConfig } from './AliyunConfig'

const MIAOBI_ENDPOINT = 'aimiaobi.cn-beijing.aliyuncs.com'
const API_VERSION = '2023-08-01'
const CONNECTION_TEST_TASK_PREFIX = '__sparrow_miaobi_connection_test_'
const CONNECTION_TEST_OUTLINE = '# 连接测试'
const DEFAULT_RUNTIME = new $Dara.RuntimeOptions({
  readTimeout: 1000 * 60,
  connectTimeout: 1000 * 60
})

interface MiaobiBaseResponse<T> {
  RequestId?: string
  Success?: boolean
  Code?: string
  Message?: string
  HttpStatusCode?: number
  Data?: T
}

/** 妙笔大纲生成 SSE 事件的实际响应结构 */
interface OutlineEventPayload {
  TaskId?: string
  Outline?: string
  Text?: string
  Delta?: string
  Content?: string
  Header?: {
    ErrorCode?: string
    ErrorMessage?: string
    Event?: string
    SessionId?: string
    StatusCode?: number
    TaskId?: string
    TraceId?: string
  }
  Payload?: {
    Output?: {
      Text?: string
    }
  }
  RequestId?: string
  HttpStatusCode?: number
  Code?: string
  Message?: string
  Success?: boolean
}

interface InitiateCreationData {
  AppKey?: string
  Appkey?: string
  Code?: string
}

interface BindArtifactData {
  TaskId?: string
}

export interface GenerateOutlineResult {
  success: boolean
  taskId?: string
  outline?: string
  error?: string
}

export interface InitiateCreationResult {
  success: boolean
  appkey?: string
  code?: string
  error?: string
}

export interface BindArtifactResult {
  success: boolean
  error?: string
}

export interface TestConnectionResult {
  success: boolean
  error?: string
}

function buildErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

function normalizeConfig(config?: Partial<AliyunMiaobiConfig> | null): AliyunMiaobiConfig {
  return {
    accessKeyId: config?.accessKeyId?.trim() || '',
    accessKeySecret: config?.accessKeySecret?.trim() || '',
    workspaceId: config?.workspaceId?.trim() || ''
  }
}

function extractChunkText(payload: OutlineEventPayload): string {
  return (
    payload.Payload?.Output?.Text ||
    payload.Outline ||
    payload.Text ||
    payload.Delta ||
    payload.Content ||
    ''
  )
}

function extractTaskId(payload: OutlineEventPayload): string {
  return payload.Header?.TaskId || payload.TaskId || ''
}

function extractSnapshotDelta(previous: string, next: string): string {
  if (!next) {
    return ''
  }

  if (!previous) {
    return next
  }

  if (next.startsWith(previous)) {
    return next.slice(previous.length)
  }

  return ''
}

export class AliyunMiaobiService {
  private client: OpenApiClient | null = null
  private clientKey = ''

  private createClient(config: AliyunMiaobiConfig): OpenApiClient {
    const { accessKeyId, accessKeySecret } = normalizeConfig(config)
    const nextClientKey = `${accessKeyId}:${accessKeySecret}`

    if (this.client && this.clientKey === nextClientKey) {
      return this.client
    }

    const clientConfig = new $OpenApiUtil.Config({
      accessKeyId,
      accessKeySecret,
      endpoint: MIAOBI_ENDPOINT
    })

    this.client = new OpenApiClient(clientConfig)
    this.clientKey = nextClientKey
    return this.client
  }

  private buildParams(
    action: string,
    pathname: string,
    bodyType: 'json' | 'sse'
  ): InstanceType<typeof $OpenApiUtil.Params> {
    return new $OpenApiUtil.Params({
      action,
      version: API_VERSION,
      protocol: 'HTTPS',
      method: 'POST',
      authType: 'AK',
      style: 'V3',
      pathname,
      reqBodyType: 'json',
      bodyType
    })
  }

  private async callJsonApi<T>(
    config: AliyunMiaobiConfig,
    action: string,
    pathname: string,
    body: Record<string, unknown>
  ): Promise<MiaobiBaseResponse<T>> {
    const client = this.createClient(config)

    const request = new $OpenApiUtil.OpenApiRequest({
      body
    })

    const response = await client.callApi(
      this.buildParams(action, pathname, 'json'),
      request,
      DEFAULT_RUNTIME
    )

    // callApi 返回 { body, headers, statusCode }，业务数据在 body 中
    if (response && typeof response === 'object' && 'body' in response) {
      return (response as { body: MiaobiBaseResponse<T> }).body
    }

    return response as MiaobiBaseResponse<T>
  }

  private isConnectivityFailureMessage(message: string): boolean {
    const normalizedMessage = message.toLowerCase()

    return [
      'accesskey',
      'access key',
      'signature',
      'unauthorized',
      'forbidden',
      'permission',
      'workspace',
      'workspaceid',
      '鉴权',
      '签名',
      '权限',
      '工作空间',
      '业务空间'
    ].some((keyword) => normalizedMessage.includes(keyword))
  }

  private isExpectedConnectionTestFailure(message: string): boolean {
    const normalizedMessage = message.toLowerCase()
    const mentionsTask = ['task', 'taskid', 'outline', '大纲', '任务'].some((keyword) =>
      normalizedMessage.includes(keyword)
    )
    const mentionsInvalid = [
      'invalid',
      'not found',
      'not exist',
      'alreadyexist',
      'already exist',
      '已存在',
      '非法',
      '无效',
      '不存在'
    ].some((keyword) => normalizedMessage.includes(keyword))

    return mentionsTask && mentionsInvalid && !this.isConnectivityFailureMessage(message)
  }

  async testConnection(config: AliyunMiaobiConfig): Promise<TestConnectionResult> {
    const normalizedConfig = normalizeConfig(config)
    logger.info('妙笔连接测试：开始', 'main', {
      accessKeyIdLength: normalizedConfig.accessKeyId.length,
      accessKeySecretLength: normalizedConfig.accessKeySecret.length,
      workspaceId: normalizedConfig.workspaceId
    })

    if (!aliyunConfig.isConfigured(normalizedConfig)) {
      logger.warn('妙笔连接测试：配置不完整', 'main', {
        hasAccessKeyId: !!normalizedConfig.accessKeyId,
        hasAccessKeySecret: !!normalizedConfig.accessKeySecret,
        hasWorkspaceId: !!normalizedConfig.workspaceId
      })
      return {
        success: false,
        error: '请先完整填写 AccessKey ID、AccessKey Secret 和 Workspace ID'
      }
    }

    try {
      const testTaskId = `${CONNECTION_TEST_TASK_PREFIX}${Date.now()}`

      logger.info('妙笔连接测试：调用 InitiatePptCreation API', 'main', {
        endpoint: MIAOBI_ENDPOINT,
        workspaceId: normalizedConfig.workspaceId,
        taskId: testTaskId
      })

      const response = await this.callJsonApi<InitiateCreationData>(
        normalizedConfig,
        'InitiatePptCreation',
        '/quanmiao/miaobi/initiatePptCreation',
        {
          WorkspaceId: normalizedConfig.workspaceId,
          TaskId: testTaskId,
          Outline: CONNECTION_TEST_OUTLINE
        }
      )

      logger.info('妙笔连接测试：收到 API 响应', 'main', {
        rawResponse: JSON.stringify(response),
        success: response.Success,
        code: response.Code,
        message: response.Message,
        httpStatus: response.HttpStatusCode,
        hasData: !!response.Data
      })

      const responseMessage = [response.Code, response.Message].filter(Boolean).join(' ').trim()

      if (response.Success || this.isExpectedConnectionTestFailure(responseMessage)) {
        logger.info('妙笔 PPT 连接测试成功', 'main', {
          workspaceId: normalizedConfig.workspaceId,
          reason: response.Success ? 'api-success' : 'expected-failure'
        })
        return { success: true }
      }

      logger.warn('妙笔连接测试：API 返回失败', 'main', {
        responseMessage,
        isConnectivityFailure: this.isConnectivityFailureMessage(responseMessage)
      })

      return {
        success: false,
        error: response.Message || response.Code || '妙笔连接测试失败'
      }
    } catch (error) {
      const errorMessage = buildErrorMessage(error, '妙笔连接测试失败')
      const errorStack = error instanceof Error ? error.stack : undefined

      logger.error('妙笔连接测试：捕获异常', 'main', {
        errorMessage,
        errorStack,
        isExpectedFailure: this.isExpectedConnectionTestFailure(errorMessage)
      })

      if (this.isExpectedConnectionTestFailure(errorMessage)) {
        logger.info('妙笔 PPT 连接测试成功（预期内业务错误）', 'main', {
          workspaceId: normalizedConfig.workspaceId
        })
        return { success: true }
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  async generateOutline(
    prompt: string,
    onChunk?: (text: string) => void,
    sessionId?: string
  ): Promise<GenerateOutlineResult> {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      return {
        success: false,
        error: 'PPT 提示词不能为空'
      }
    }

    const configResult = aliyunConfig.getConfig()
    if (!configResult.success || !configResult.configured) {
      return {
        success: false,
        error: configResult.error || '阿里云妙笔尚未完成配置'
      }
    }

    const client = this.createClient(configResult.config)

    const request = new $OpenApiUtil.OpenApiRequest({
      body: {
        WorkspaceId: configResult.config.workspaceId,
        Prompt: trimmedPrompt
      }
    })

    const params = this.buildParams(
      'RunPptOutlineGeneration',
      '/pop/ppt/runPptOutlineGeneration',
      'sse'
    )

    let taskId = ''
    let outlineSnapshot = ''

    try {
      logger.info('开始生成妙笔 PPT 大纲', 'main', {
        sessionId,
        promptLength: trimmedPrompt.length
      })

      const response = client.callSSEApi(params, request, DEFAULT_RUNTIME)
      for await (const event of response) {
        const rawData = event.event?.data
        if (!rawData) {
          continue
        }

        let payload: OutlineEventPayload
        try {
          payload = JSON.parse(rawData) as OutlineEventPayload
        } catch {
          logger.warn('妙笔大纲流返回了无法解析的事件', 'main', {
            sessionId,
            rawData
          })
          continue
        }

        const headerEvent = payload.Header?.Event
        logger.debug('妙笔大纲 SSE 事件', 'main', {
          sessionId,
          event: headerEvent,
          hasTaskId: !!payload.Header?.TaskId,
          hasText: !!payload.Payload?.Output?.Text,
          textLength: payload.Payload?.Output?.Text?.length ?? 0
        })

        // 从 Header 中提取 TaskId
        const nextTaskId = extractTaskId(payload)
        if (nextTaskId) {
          taskId = nextTaskId
        }

        // 从 Payload.Output.Text 提取流式文本
        const outlineText = extractChunkText(payload)
        if (outlineText) {
          const deltaText = extractSnapshotDelta(outlineSnapshot, outlineText)

          if (!deltaText && outlineSnapshot && outlineSnapshot !== outlineText) {
            logger.debug('妙笔大纲 SSE 返回了重置后的完整快照', 'main', {
              sessionId,
              event: headerEvent,
              previousLength: outlineSnapshot.length,
              nextLength: outlineText.length
            })
          }

          outlineSnapshot = outlineText

          if (deltaText) {
            onChunk?.(deltaText)
          }
        }
      }

      const finalOutline = outlineSnapshot.trim()
      if (!taskId || !finalOutline) {
        logger.warn('妙笔大纲生成结果缺少必要字段', 'main', {
          sessionId,
          taskId,
          outlineLength: finalOutline.length
        })
      } else {
        logger.info('妙笔大纲生成完成', 'main', {
          sessionId,
          taskId,
          outlineLength: finalOutline.length
        })
      }

      return {
        success: Boolean(taskId && finalOutline),
        taskId: taskId || undefined,
        outline: finalOutline || undefined,
        error: taskId && finalOutline ? undefined : '妙笔未返回完整的大纲结果'
      }
    } catch (error) {
      const errorMessage = buildErrorMessage(error, '生成 PPT 大纲失败')
      logger.error('生成妙笔 PPT 大纲失败', 'main', {
        sessionId,
        error: errorMessage
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  async initiateCreation(taskId: string, outline: string): Promise<InitiateCreationResult> {
    const trimmedTaskId = taskId.trim()
    const trimmedOutline = outline.trim()

    if (!trimmedTaskId) {
      return {
        success: false,
        error: 'TaskId 不能为空'
      }
    }

    if (!trimmedOutline) {
      return {
        success: false,
        error: 'PPT 大纲不能为空'
      }
    }

    const configResult = aliyunConfig.getConfig()
    if (!configResult.success || !configResult.configured) {
      return {
        success: false,
        error: configResult.error || '阿里云妙笔尚未完成配置'
      }
    }

    try {
      const response = await this.callJsonApi<InitiateCreationData>(
        configResult.config,
        'InitiatePptCreation',
        '/quanmiao/miaobi/initiatePptCreation',
        {
          WorkspaceId: configResult.config.workspaceId,
          TaskId: trimmedTaskId,
          Outline: trimmedOutline
        }
      )

      const appkey = response.Data?.AppKey || response.Data?.Appkey
      const code = response.Data?.Code

      if (!response.Success || !appkey || !code) {
        return {
          success: false,
          error: response.Message || response.Code || '初始化 PPT 创建会话失败'
        }
      }

      logger.info('妙笔 PPT 创建会话初始化成功', 'main', {
        taskId: trimmedTaskId
      })

      return {
        success: true,
        appkey,
        code
      }
    } catch (error) {
      const errorMessage = buildErrorMessage(error, '初始化 PPT 创建会话失败')
      logger.error('初始化妙笔 PPT 创建会话失败', 'main', {
        taskId: trimmedTaskId,
        error: errorMessage
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  async bindArtifact(taskId: string, artifactId: number): Promise<BindArtifactResult> {
    const trimmedTaskId = taskId.trim()

    if (!trimmedTaskId) {
      return {
        success: false,
        error: 'TaskId 不能为空'
      }
    }

    if (!Number.isFinite(artifactId) || artifactId <= 0) {
      return {
        success: false,
        error: 'ArtifactId 非法'
      }
    }

    const configResult = aliyunConfig.getConfig()
    if (!configResult.success || !configResult.configured) {
      return {
        success: false,
        error: configResult.error || '阿里云妙笔尚未完成配置'
      }
    }

    try {
      const response = await this.callJsonApi<BindArtifactData>(
        configResult.config,
        'BindPptArtifact',
        '/quanmiao/miaobi/bindPptArtifact',
        {
          WorkspaceId: configResult.config.workspaceId,
          TaskId: trimmedTaskId,
          ArtifactId: artifactId
        }
      )

      if (!response.Success) {
        return {
          success: false,
          error: response.Message || response.Code || '绑定 PPT 作品失败'
        }
      }

      logger.info('妙笔 PPT 作品绑定成功', 'main', {
        taskId: trimmedTaskId,
        artifactId
      })

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = buildErrorMessage(error, '绑定 PPT 作品失败')
      logger.error('绑定妙笔 PPT 作品失败', 'main', {
        taskId: trimmedTaskId,
        artifactId,
        error: errorMessage
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }
}

export const aliyunMiaobiService = new AliyunMiaobiService()
