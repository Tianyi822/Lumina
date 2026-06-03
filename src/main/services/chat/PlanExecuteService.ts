import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type {
  ChatRequest,
  ChatResult,
  ChatToolExecutionResult,
  MCPToolReference,
  PlanStep,
  PlanStepStatus
} from '../../types/chat'
import type { LLMConfig } from '../../types/config'
import type { Logger } from '../logger'
import type { StopController } from './StopController'
import type { StreamHandler } from './StreamHandler'
import type { ReactLoopService } from './ReactLoopService'
import { promptBuilder } from './PromptBuilder'
import { formatMessagesWithKnowledge } from './message'

/**
 * PlanExecuteService 配置选项
 */
export interface PlanExecuteServiceOptions {
  logger: Logger
  stopController: StopController
  streamHandler: StreamHandler
  createClient: (config: LLMConfig) => OpenAI
  validateAndGetLLMConfig: (
    modelKey: string,
    sessionId: string,
    webContents: WebContents,
    turnId?: string
  ) => LLMConfig | null
  reactLoopService: ReactLoopService
}

interface ParsedPlan {
  steps: Array<{ title: string; description: string }>
}

interface PlanStepExecutionResult {
  success: boolean
  summary?: string
  context?: string
  error?: string
  recoverable?: boolean
  attempt?: number
  usage?: ChatResult['usage']
}

const PLAN_STEP_MAX_ATTEMPTS = 2
const STEP_CONTEXT_MAX_CHARS = 6000
const TOOL_RESULT_MAX_CHARS = 1600

/**
 * 规划执行服务
 * 在 ReAct 循环之上增加"先规划再执行"的编排层
 */
export class PlanExecuteService {
  private readonly logger: PlanExecuteServiceOptions['logger']
  private readonly stopController: PlanExecuteServiceOptions['stopController']
  private readonly streamHandler: PlanExecuteServiceOptions['streamHandler']
  private readonly createClient: PlanExecuteServiceOptions['createClient']
  private readonly validateAndGetLLMConfig: PlanExecuteServiceOptions['validateAndGetLLMConfig']
  private readonly reactLoopService: PlanExecuteServiceOptions['reactLoopService']

  constructor(options: PlanExecuteServiceOptions) {
    this.logger = options.logger
    this.stopController = options.stopController
    this.streamHandler = options.streamHandler
    this.createClient = options.createClient
    this.validateAndGetLLMConfig = options.validateAndGetLLMConfig
    this.reactLoopService = options.reactLoopService
  }

  /**
   * 使用规划模式发送消息
   * 1. 调用 LLM 生成执行计划
   * 2. 逐步骤委托 ReactLoopService 执行
   * 3. 汇总结果
   */
  async sendMessageWithPlan(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { sessionId, modelKey, turnId } = request

    this.logger.info('开始规划模式消息处理', 'main', { sessionId, modelKey })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents, turnId)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.stopController.isStopped(sessionId)) {
      this.streamHandler.sendPlanStatus(
        webContents,
        sessionId,
        'cancelled',
        undefined,
        undefined,
        turnId
      )
      this.streamHandler.sendDone(webContents, sessionId, undefined, turnId, 'cancelled')
      return { success: true }
    }

    const abortController = this.stopController.getOrCreateAbortController(sessionId)
    const totalUsage: NonNullable<ChatResult['usage']> = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
    const previousResults: string[] = []
    let planSteps: PlanStep[] = []
    let currentStepIndex = -1

    try {
      this.streamHandler.sendPlanStatus(
        webContents,
        sessionId,
        'planning',
        undefined,
        undefined,
        turnId
      )

      planSteps = await this.generatePlan(request, llmConfig, abortController)
      this.stopController.checkStopped(sessionId)

      if (!planSteps || planSteps.length === 0) {
        this.logger.info('计划为空，回退到直接 ReAct 模式', 'main', { sessionId })
        this.streamHandler.sendPlanStatus(
          webContents,
          sessionId,
          'idle',
          undefined,
          undefined,
          turnId
        )
        return this.reactLoopService.sendMessageWithReact(
          request,
          webContents,
          undefined,
          request.selectedKnowledgeBases,
          {
            abortController,
            preserveAbortController: true
          }
        )
      }

      this.logger.info('计划生成完成', 'main', {
        sessionId,
        stepCount: planSteps.length,
        steps: planSteps.map((s) => s.title)
      })

      this.streamHandler.sendPlanGenerated(webContents, sessionId, planSteps, turnId)
      this.streamHandler.sendPlanStatus(
        webContents,
        sessionId,
        'running',
        undefined,
        undefined,
        turnId
      )

      for (let i = 0; i < planSteps.length; i++) {
        this.stopController.checkStopped(sessionId)
        currentStepIndex = i

        const stepResult = await this.executePlanStepWithRetry(
          planSteps[i],
          i,
          request,
          webContents,
          previousResults,
          abortController,
          sessionId,
          turnId
        )

        this.stopController.checkStopped(sessionId)

        // 累加 token 使用量
        if (stepResult.usage) {
          totalUsage.prompt_tokens += stepResult.usage.prompt_tokens
          totalUsage.completion_tokens += stepResult.usage.completion_tokens
          totalUsage.total_tokens += stepResult.usage.total_tokens
          if (stepResult.usage.reasoning_tokens) {
            totalUsage.reasoning_tokens =
              (totalUsage.reasoning_tokens ?? 0) + stepResult.usage.reasoning_tokens
          }
        }

        if (stepResult.success) {
          planSteps[i].status = 'success'
          planSteps[i].summary = stepResult.summary
          planSteps[i].attempt = stepResult.attempt
          planSteps[i].maxAttempts = PLAN_STEP_MAX_ATTEMPTS
          this.updateStepStatus(
            webContents,
            sessionId,
            i,
            'success',
            stepResult.summary,
            undefined,
            turnId,
            stepResult.attempt,
            PLAN_STEP_MAX_ATTEMPTS
          )
          previousResults.push(stepResult.context || stepResult.summary || '步骤已完成')
        } else {
          const errorMessage = stepResult.error || `步骤 ${i + 1} 执行失败`
          planSteps[i].status = 'failed'
          planSteps[i].error = errorMessage
          planSteps[i].attempt = stepResult.attempt
          planSteps[i].maxAttempts = PLAN_STEP_MAX_ATTEMPTS
          this.markRemainingStepsSkipped(webContents, sessionId, planSteps, i, errorMessage, turnId)
          this.streamHandler.sendPlanStatus(
            webContents,
            sessionId,
            'failed',
            undefined,
            errorMessage,
            turnId
          )
          this.streamHandler.sendDone(webContents, sessionId, totalUsage, turnId, 'failed')
          this.logger.warn('规划模式执行失败，存在未完成步骤', 'main', {
            sessionId,
            stepIndex: i,
            stepTitle: planSteps[i].title,
            attempt: stepResult.attempt,
            maxAttempts: PLAN_STEP_MAX_ATTEMPTS,
            error: errorMessage
          })
          return { success: false, error: errorMessage, toolErrors: [errorMessage] }
        }
      }

      // 所有步骤执行完成，生成总结并发送到聊天气泡
      const summaryContent = this.buildFinalSummary(planSteps)
      this.streamHandler.sendPlanStatus(
        webContents,
        sessionId,
        'completed',
        undefined,
        undefined,
        turnId,
        summaryContent
      )
      this.streamHandler.sendContent(webContents, sessionId, summaryContent, turnId)
      this.streamHandler.sendDone(webContents, sessionId, totalUsage, turnId, 'completed')
      this.logger.info('规划模式执行完成', 'main', { sessionId, totalUsage })

      return { success: true, usage: totalUsage }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.info('用户中止了规划模式请求', 'main', { sessionId })
        this.markRemainingStepsCancelled(
          webContents,
          sessionId,
          planSteps,
          currentStepIndex,
          turnId
        )
        this.streamHandler.sendPlanStatus(
          webContents,
          sessionId,
          'cancelled',
          undefined,
          '用户已取消',
          turnId
        )
        this.streamHandler.sendDone(webContents, sessionId, undefined, turnId, 'cancelled')
        return { success: true }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('规划模式请求失败', 'main', { sessionId, error: errorMessage })
      this.markFailedPlan(webContents, sessionId, planSteps, currentStepIndex, errorMessage, turnId)
      this.streamHandler.sendPlanStatus(
        webContents,
        sessionId,
        'failed',
        undefined,
        errorMessage,
        turnId
      )
      this.streamHandler.sendError(webContents, sessionId, errorMessage, turnId, 'failed')
      return { success: false, error: errorMessage }
    } finally {
      this.stopController.deleteAbortController(sessionId)
      this.stopController.clearStoppedSession(sessionId)
      this.stopController.deletePendingUserInteraction(sessionId)
    }
  }

  /**
   * 调用 LLM 生成执行计划
   */
  private async generatePlan(
    request: ChatRequest,
    llmConfig: LLMConfig,
    abortController: AbortController
  ): Promise<PlanStep[]> {
    const client = this.createClient(llmConfig)

    const planPrompt = promptBuilder.buildPlanSystemPrompt(
      this.buildPlanningTools(request),
      this.hasPaperContext(request)
        ? '论文上下文检索工具已启用，可通过工具按需获取论文内容'
        : undefined
    )

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: planPrompt },
      ...formatMessagesWithKnowledge(request.messages.slice(-4))
    ]

    const response = await client.chat.completions.create(
      {
        model: llmConfig.model_name,
        messages,
        temperature: 1
      },
      { signal: abortController.signal }
    )

    const content = response.choices[0]?.message?.content
    if (!content) {
      return []
    }

    const parsed = this.parsePlanResponse(content)
    if (!parsed) {
      return []
    }

    return parsed.steps.map((step, index) => ({
      index,
      title: step.title,
      description: step.description,
      status: 'pending' as PlanStepStatus,
      maxAttempts: PLAN_STEP_MAX_ATTEMPTS
    }))
  }

  /**
   * 解析 LLM 返回的计划 JSON
   */
  private parsePlanResponse(content: string): ParsedPlan | null {
    try {
      // 尝试从 markdown 代码块中提取 JSON
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim()

      const parsed = JSON.parse(jsonStr)
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return {
          steps: parsed.steps.map((s: { title?: string; description?: string }) => ({
            title: s.title || '未命名步骤',
            description: s.description || ''
          }))
        }
      }
      return null
    } catch {
      this.logger.warn('计划 JSON 解析失败', 'main', { content: content.slice(0, 200) })
      return null
    }
  }

  /**
   * 执行单个计划步骤
   */
  private async executePlanStepWithRetry(
    step: PlanStep,
    stepIndex: number,
    request: ChatRequest,
    webContents: WebContents,
    previousResults: string[],
    abortController: AbortController,
    sessionId: string,
    turnId?: string
  ): Promise<PlanStepExecutionResult> {
    let previousFailure: string | undefined

    for (let attempt = 1; attempt <= PLAN_STEP_MAX_ATTEMPTS; attempt++) {
      step.status = 'running'
      step.attempt = attempt
      step.maxAttempts = PLAN_STEP_MAX_ATTEMPTS
      step.error = undefined
      this.updateStepStatus(
        webContents,
        sessionId,
        stepIndex,
        'running',
        undefined,
        undefined,
        turnId,
        attempt,
        PLAN_STEP_MAX_ATTEMPTS
      )

      if (attempt > 1) {
        this.logger.warn('重试计划步骤', 'main', {
          sessionId,
          stepIndex,
          stepTitle: step.title,
          attempt,
          maxAttempts: PLAN_STEP_MAX_ATTEMPTS,
          previousFailure
        })
      }

      const result = await this.executePlanStep(
        step,
        stepIndex,
        request,
        webContents,
        previousResults,
        abortController,
        previousFailure
      )

      if (result.success) {
        return { ...result, attempt }
      }

      previousFailure = result.error || '未知错误'
      this.logger.warn('计划步骤执行失败', 'main', {
        sessionId,
        stepIndex,
        stepTitle: step.title,
        attempt,
        maxAttempts: PLAN_STEP_MAX_ATTEMPTS,
        recoverable: result.recoverable === true,
        error: previousFailure
      })

      if (!result.recoverable || attempt >= PLAN_STEP_MAX_ATTEMPTS) {
        step.status = 'failed'
        step.error = previousFailure
        step.attempt = attempt
        step.maxAttempts = PLAN_STEP_MAX_ATTEMPTS
        this.updateStepStatus(
          webContents,
          sessionId,
          stepIndex,
          'failed',
          undefined,
          previousFailure,
          turnId,
          attempt,
          PLAN_STEP_MAX_ATTEMPTS
        )
        return { ...result, error: previousFailure, attempt }
      }
    }

    return {
      success: false,
      recoverable: false,
      error: previousFailure || '步骤执行失败',
      attempt: PLAN_STEP_MAX_ATTEMPTS
    }
  }

  private async executePlanStep(
    step: PlanStep,
    stepIndex: number,
    request: ChatRequest,
    webContents: WebContents,
    previousResults: string[],
    abortController: AbortController,
    previousFailure?: string
  ): Promise<PlanStepExecutionResult> {
    try {
      // 构建步骤上下文注入
      const stepContext = promptBuilder.buildStepExecutionPrompt(
        step.title,
        step.description,
        previousResults,
        previousFailure
      )

      // 创建带有步骤上下文的子请求
      const stepRequest: ChatRequest = {
        ...request,
        messages: [
          ...request.messages,
          {
            role: 'user',
            content: stepContext
          }
        ],
        maxReactIterations: request.maxReactIterations ?? 5
      }

      // 委托 ReactLoopService 执行
      const result = await this.reactLoopService.sendMessageWithReact(
        stepRequest,
        webContents,
        undefined,
        request.selectedKnowledgeBases,
        {
          abortController,
          preserveAbortController: true,
          suppressFinalEvents: true
        }
      )

      const summary = result.finalContent?.trim().slice(0, 120) || `步骤 ${stepIndex + 1} 已完成`
      const context = this.buildStepResultContext(stepIndex, result)

      if (result.success && result.toolErrors && result.toolErrors.length > 0) {
        return {
          success: false,
          recoverable: true,
          error: result.toolErrors[0]
        }
      }

      return {
        success: result.success,
        summary,
        context,
        error: result.error,
        recoverable: false,
        usage: result.usage
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, recoverable: false }
    }
  }

  private updateStepStatus(
    webContents: WebContents,
    sessionId: string,
    index: number,
    status: PlanStepStatus,
    summary?: string,
    error?: string,
    turnId?: string,
    attempt?: number,
    maxAttempts?: number
  ): void {
    this.streamHandler.sendPlanStepUpdate(
      webContents,
      sessionId,
      index,
      status,
      summary,
      error,
      turnId,
      attempt,
      maxAttempts
    )
  }

  private markRemainingStepsCancelled(
    webContents: WebContents,
    sessionId: string,
    steps: PlanStep[],
    currentStepIndex: number,
    turnId?: string
  ): void {
    for (const step of steps) {
      if (step.status === 'success' || step.status === 'failed') {
        continue
      }
      if (currentStepIndex >= 0 && step.index < currentStepIndex) {
        continue
      }
      this.updateStepStatus(
        webContents,
        sessionId,
        step.index,
        'cancelled',
        undefined,
        '用户已取消',
        turnId,
        step.attempt,
        step.maxAttempts
      )
    }
  }

  private markRemainingStepsSkipped(
    webContents: WebContents,
    sessionId: string,
    steps: PlanStep[],
    failedIndex: number,
    error: string,
    turnId?: string
  ): void {
    for (const step of steps) {
      if (step.index <= failedIndex || step.status === 'success' || step.status === 'failed') {
        continue
      }
      step.status = 'skipped'
      step.error = error
      this.updateStepStatus(webContents, sessionId, step.index, 'skipped', undefined, error, turnId)
    }
  }

  private markFailedPlan(
    webContents: WebContents,
    sessionId: string,
    steps: PlanStep[],
    currentStepIndex: number,
    error: string,
    turnId?: string
  ): void {
    if (steps.length === 0) {
      return
    }

    const failedIndex = currentStepIndex >= 0 ? currentStepIndex : 0
    this.updateStepStatus(
      webContents,
      sessionId,
      failedIndex,
      'failed',
      undefined,
      error,
      turnId,
      steps[failedIndex]?.attempt,
      steps[failedIndex]?.maxAttempts
    )

    for (const step of steps) {
      if (step.index <= failedIndex || step.status === 'success' || step.status === 'failed') {
        continue
      }
      this.updateStepStatus(webContents, sessionId, step.index, 'skipped', undefined, error, turnId)
    }
  }

  private hasPaperContext(request: ChatRequest): boolean {
    return request.sessionType === 'paper' && !!request.paperId
  }

  private buildPlanningTools(request: ChatRequest): MCPToolReference[] {
    return [...(request.selectedTools ?? [])]
  }

  private buildStepResultContext(stepIndex: number, result: ChatResult): string {
    const lines: string[] = [`## 步骤 ${stepIndex + 1} 执行结果`]

    if (result.finalContent?.trim()) {
      lines.push('### 模型结论')
      lines.push(this.truncateText(result.finalContent.trim(), TOOL_RESULT_MAX_CHARS))
    }

    if (result.toolResults && result.toolResults.length > 0) {
      lines.push('### 工具观察')
      for (const toolResult of result.toolResults) {
        lines.push(this.formatToolResultForContext(toolResult))
      }
    }

    lines.push(
      '后续步骤必须优先复用以上已有实验室、容器、预览地址和项目根目录；除非用户明确要求新建，不要重复创建同名实验室或容器。'
    )

    return this.truncateText(lines.join('\n\n'), STEP_CONTEXT_MAX_CHARS)
  }

  private formatToolResultForContext(toolResult: ChatToolExecutionResult): string {
    const status = toolResult.success ? '成功' : '失败'
    const content = this.extractReadableToolContent(toolResult.content)
    const lines = [`- 工具: ${toolResult.toolName}`, `  状态: ${status}`]

    if (toolResult.error) {
      lines.push(`  错误: ${toolResult.error}`)
    }

    if (content) {
      lines.push(`  输出:\n${this.indentText(this.truncateText(content, TOOL_RESULT_MAX_CHARS))}`)
    }

    return lines.join('\n')
  }

  private extractReadableToolContent(content: string): string {
    const trimmed = content.trim()
    if (!trimmed) {
      return ''
    }

    const parsed = this.tryParseJson(trimmed)
    if (parsed === undefined) {
      return trimmed
    }

    return this.stringifyToolContent(parsed)
  }

  private stringifyToolContent(value: unknown): string {
    if (Array.isArray(value)) {
      const texts = value
        .map((item) => {
          if (this.isTextContentBlock(item)) {
            return item.text
          }
          return this.stringifyToolContent(item)
        })
        .filter(Boolean)

      return texts.join('\n')
    }

    if (this.isTextContentBlock(value)) {
      return value.text
    }

    if (typeof value === 'object' && value !== null) {
      const resultValue = (value as Record<string, unknown>).result
      if (resultValue !== undefined) {
        return this.stringifyToolContent(resultValue)
      }

      return JSON.stringify(value, null, 2)
    }

    return String(value)
  }

  private isTextContentBlock(value: unknown): value is { type: string; text: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).type === 'text' &&
      typeof (value as Record<string, unknown>).text === 'string'
    )
  }

  private tryParseJson(content: string): unknown | undefined {
    try {
      return JSON.parse(content)
    } catch {
      return undefined
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text
    }

    return `${text.slice(0, maxLength)}\n...（已截断）`
  }

  private indentText(text: string): string {
    return text
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  }

  /**
   * 根据所有步骤的执行结果构建最终总结文本
   */
  private buildFinalSummary(steps: PlanStep[]): string {
    const successSteps = steps.filter((s) => s.status === 'success')
    const failedSteps = steps.filter((s) => s.status === 'failed')

    const lines: string[] = []

    // 先给一个总体结论
    if (failedSteps.length === 0) {
      lines.push(`已成功完成全部 ${successSteps.length} 个步骤：`)
    } else {
      lines.push(
        `已完成 ${successSteps.length}/${steps.length} 个步骤，${failedSteps.length} 个步骤失败：`
      )
    }

    lines.push('')

    for (const step of steps) {
      const statusIcon = step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏭️'
      const summary = step.summary ? ` — ${step.summary}` : ''
      const error = step.error && step.status === 'failed' ? `\n   **失败原因**：${step.error}` : ''
      lines.push(`${statusIcon} **${step.title}**${summary}${error}`)
      if (step.attempt && step.maxAttempts && step.attempt > 1) {
        lines.push(`   （共尝试 ${step.attempt} 次）`)
      }
    }

    return lines.join('\n')
  }
}
