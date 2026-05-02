import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type {
  ChatRequest,
  ChatResult,
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
import { SkillToolAdapter } from './tools'
import { skillService } from '../skill'

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
    webContents: WebContents
  ) => LLMConfig | null
  reactLoopService: ReactLoopService
}

interface ParsedPlan {
  steps: Array<{ title: string; description: string }>
}

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
  private readonly skillAdapter = new SkillToolAdapter()

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
    const { sessionId, modelKey } = request

    this.logger.info('开始规划模式消息处理', 'main', { sessionId, modelKey })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.stopController.isStopped(sessionId)) {
      this.streamHandler.sendDone(webContents, sessionId)
      return { success: true }
    }

    try {
      // 阶段 1：生成计划
      const planSteps = await this.generatePlan(request, llmConfig)
      if (!planSteps || planSteps.length === 0) {
        this.logger.info('计划为空，回退到直接 ReAct 模式', 'main', { sessionId })
        return this.reactLoopService.sendMessageWithReact(
          request,
          webContents,
          undefined,
          request.selectedKnowledgeBases
        )
      }

      this.logger.info('计划生成完成', 'main', {
        sessionId,
        stepCount: planSteps.length,
        steps: planSteps.map((s) => s.title)
      })

      // 发送计划到前端
      this.streamHandler.sendPlanGenerated(webContents, sessionId, planSteps)

      // 阶段 2：逐步执行
      const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      const previousResults: string[] = []

      for (let i = 0; i < planSteps.length; i++) {
        if (this.stopController.isStopped(sessionId)) {
          this.logger.info('规划执行被中止', 'main', { sessionId, stepIndex: i })
          break
        }

        this.updateStepStatus(webContents, sessionId, i, 'in_progress')

        const stepResult = await this.executePlanStep(
          planSteps[i],
          i,
          request,
          llmConfig,
          webContents,
          previousResults
        )

        if (this.stopController.isStopped(sessionId)) {
          this.updateStepStatus(webContents, sessionId, i, 'failed')
          break
        }

        if (stepResult.success) {
          this.updateStepStatus(webContents, sessionId, i, 'completed', stepResult.summary)
          previousResults.push(stepResult.summary || '步骤已完成')
        } else {
          this.updateStepStatus(webContents, sessionId, i, 'failed', stepResult.error)
          this.logger.warn('计划步骤执行失败', 'main', {
            sessionId,
            stepIndex: i,
            error: stepResult.error
          })
          previousResults.push(`步骤执行失败: ${stepResult.error ?? '未知错误'}`)
        }
      }

      this.streamHandler.sendDone(webContents, sessionId, totalUsage)
      this.logger.info('规划模式执行完成', 'main', { sessionId, totalUsage })

      return { success: true }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.info('用户中止了规划模式请求', 'main', { sessionId })
        this.streamHandler.sendDone(webContents, sessionId)
        return { success: true }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('规划模式请求失败', 'main', { sessionId, error: errorMessage })
      this.streamHandler.sendError(webContents, sessionId, errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 调用 LLM 生成执行计划
   */
  private async generatePlan(request: ChatRequest, llmConfig: LLMConfig): Promise<PlanStep[]> {
    const client = this.createClient(llmConfig)

    const planPrompt = promptBuilder.buildPlanSystemPrompt(
      this.buildPlanningTools(request),
      this.hasPaperContext(request.messages) ? '论文内容已包含在对话中' : undefined
    )

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: planPrompt },
      ...request.messages.slice(-4).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || ''
      }))
    ]

    const response = await client.chat.completions.create({
      model: llmConfig.model_name,
      messages,
      temperature: 0.3
    })

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
      status: 'pending' as PlanStepStatus
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
  private async executePlanStep(
    step: PlanStep,
    stepIndex: number,
    request: ChatRequest,
    _llmConfig: LLMConfig,
    webContents: WebContents,
    previousResults: string[]
  ): Promise<{ success: boolean; summary?: string; error?: string }> {
    try {
      // 构建步骤上下文注入
      const stepContext = promptBuilder.buildStepExecutionPrompt(
        step.title,
        step.description,
        previousResults
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
        request.selectedKnowledgeBases
      )

      // 收集步骤结果摘要
      const summary = previousResults.length > 0 ? `步骤 ${stepIndex + 1} 已完成` : undefined

      return {
        success: result.success,
        summary,
        error: result.error
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  private updateStepStatus(
    webContents: WebContents,
    sessionId: string,
    index: number,
    status: PlanStepStatus,
    summary?: string
  ): void {
    this.streamHandler.sendPlanStepUpdate(webContents, sessionId, index, status, summary)
  }

  private hasPaperContext(messages: ChatRequest['messages']): boolean {
    return messages.some((m) => m.role === 'system' && m.content && m.content.length > 100)
  }

  private buildPlanningTools(request: ChatRequest): MCPToolReference[] {
    const tools = [...(request.selectedTools ?? [])]
    if (skillService.hasAvailableSkills()) {
      tools.push(...this.skillAdapter.getTools())
    }
    return tools
  }
}
