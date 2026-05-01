import OpenAI from 'openai'
import type { WebContents } from 'electron'
import { configManager } from '../config'
import { logger } from '../logger'
import { mcpService } from '../mcp'
import { skillService } from '../skill'
import type { ChatRequest, ChatResult, KnowledgeSearchResult, TokenUsage } from '../../types/chat'
import type { LLMConfig } from '../../types/config'
import {
  formatMessagesWithKnowledge,
  createThinkParserState,
  flushThinkParserState,
  splitThinkTaggedContent
} from './message'
import { ModelRetryHandler } from './ModelRetryHandler'
import { PlanExecuteService } from './PlanExecuteService'
import { StopController } from './StopController'
import { StreamHandler } from './StreamHandler'
import { ReactLoopService } from './ReactLoopService'
import { promptBuilder } from './PromptBuilder'

/**
 * 聊天服务
 * 处理与 OpenAI 兼容 API 的通信，支持流式响应和 ReAct 推理模式
 */
export class ChatService {
  private stopController: StopController
  private streamHandler: StreamHandler
  private reactLoopService: ReactLoopService
  private planExecuteService: PlanExecuteService
  private modelRetryHandler: ModelRetryHandler

  constructor() {
    this.stopController = new StopController()
    this.streamHandler = new StreamHandler()

    this.modelRetryHandler = new ModelRetryHandler({
      logger,
      checkStopped: (sessionId) => this.stopController.checkStopped(sessionId),
      delayWithAbort: (ms, sessionId, signal) =>
        this.stopController.delayWithAbort(ms, sessionId, signal)
    })

    this.reactLoopService = new ReactLoopService({
      logger,
      mcpService,
      stopController: this.stopController,
      streamHandler: this.streamHandler,
      createClient: (config) => this.createClient(config),
      validateAndGetLLMConfig: (modelKey, sessionId, webContents) =>
        this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    })

    this.planExecuteService = new PlanExecuteService({
      logger,
      stopController: this.stopController,
      streamHandler: this.streamHandler,
      createClient: (config) => this.createClient(config),
      validateAndGetLLMConfig: (modelKey, sessionId, webContents) =>
        this.validateAndGetLLMConfig(modelKey, sessionId, webContents),
      reactLoopService: this.reactLoopService
    })
  }

  /**
   * 发送聊天消息并流式返回响应
   * 根据是否选择了工具或知识库来决定使用 ReAct 模式还是直接调用
   */
  async sendMessage(request: ChatRequest, webContents: WebContents): Promise<ChatResult> {
    const { selectedTools, selectedKnowledgeBases, sessionId } = request

    this.stopController.clearStoppedSession(sessionId)

    const hasKnowledgeBases = selectedKnowledgeBases && selectedKnowledgeBases.length > 0
    const hasTools = (selectedTools && selectedTools.length > 0) || request.enableLabTools
    const matchedSkills = skillService.matchSkills(request)

    if (matchedSkills.length > 0) {
      logger.info('聊天请求匹配到 Skill', 'main', {
        sessionId,
        skills: matchedSkills.map((skill) => skill.name)
      })
    }

    // 论文会话 + 规划模式：走 PlanExecuteService
    const isPlanMode = request.sessionType === 'paper' && request.enablePlanMode
    if (isPlanMode) {
      const result = await this.planExecuteService.sendMessageWithPlan(
        request,
        webContents,
        matchedSkills
      )
      this.stopController.clearStoppedSession(sessionId)
      return result
    }

    if (hasKnowledgeBases || hasTools) {
      const result = await this.reactLoopService.sendMessageWithReact(
        request,
        webContents,
        undefined,
        selectedKnowledgeBases,
        matchedSkills
      )
      this.stopController.clearStoppedSession(sessionId)
      return result
    }

    const result = await this.sendMessageDirect(request, webContents, undefined, matchedSkills)
    this.stopController.clearStoppedSession(sessionId)
    return result
  }

  /**
   * 直接发送消息
   * 不使用工具调用，直接调用 LLM API
   */
  private async sendMessageDirect(
    request: ChatRequest,
    webContents: WebContents,
    knowledgeResults?: KnowledgeSearchResult[],
    matchedSkills = skillService.matchSkills(request)
  ): Promise<ChatResult> {
    const { messages, modelKey, sessionId } = request

    logger.info('开始发送聊天消息（直接模式）', 'main', {
      sessionId,
      modelKey,
      messageCount: messages.length
    })

    const llmConfig = this.validateAndGetLLMConfig(modelKey, sessionId, webContents)
    if (!llmConfig) {
      return { success: false, error: '配置验证失败' }
    }

    if (this.stopController.isStopped(sessionId)) {
      this.streamHandler.sendDone(webContents, sessionId)
      return { success: true }
    }

    const abortController = this.stopController.getOrCreateAbortController(sessionId)

    try {
      const client = this.createClient(llmConfig)
      const formattedMessages = formatMessagesWithKnowledge(messages, knowledgeResults)
      const skillPrompt = promptBuilder.buildSkillInstructionsPrompt(matchedSkills)
      const conversationMessages = skillPrompt
        ? ([
            { role: 'system' as const, content: skillPrompt },
            ...formattedMessages
          ] as typeof formattedMessages)
        : formattedMessages

      const stream = await this.modelRetryHandler.createChatCompletionWithRetry(
        client,
        {
          model: llmConfig.model_name,
          messages: conversationMessages,
          stream: true,
          stream_options: { include_usage: true }
        },
        abortController,
        sessionId,
        'direct'
      )

      let usage: TokenUsage | undefined
      const thinkParserState = createThinkParserState()

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
            reasoning_tokens: (chunk.usage as { reasoning_tokens?: number }).reasoning_tokens
          }
        }

        const choice = chunk.choices?.[0]
        if (choice) {
          const delta = choice.delta as {
            content?: string | null
            reasoning_content?: string | null
          }

          if (delta.reasoning_content) {
            this.streamHandler.sendReasoning(webContents, sessionId, delta.reasoning_content)
          }

          if (delta.content) {
            const { reasoningDelta, contentDelta } = splitThinkTaggedContent(
              delta.content,
              thinkParserState
            )

            if (reasoningDelta) {
              this.streamHandler.sendReasoning(webContents, sessionId, reasoningDelta)
            }

            if (contentDelta) {
              this.streamHandler.sendContent(webContents, sessionId, contentDelta)
            }
          }
        }
      }

      const { reasoningDelta, contentDelta } = flushThinkParserState(thinkParserState)
      if (reasoningDelta) {
        this.streamHandler.sendReasoning(webContents, sessionId, reasoningDelta)
      }
      if (contentDelta) {
        this.streamHandler.sendContent(webContents, sessionId, contentDelta)
      }

      this.streamHandler.sendDone(webContents, sessionId, usage)

      logger.info('聊天消息发送完成', 'main', { usage })

      return { success: true }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('用户中止了请求', 'main', { sessionId })
        this.streamHandler.sendDone(webContents, sessionId)
        return { success: true }
      }

      const errorMessage = this.modelRetryHandler.normalizeModelError(error)
      logger.error('聊天请求失败', 'main', {
        sessionId,
        error: this.modelRetryHandler.getModelErrorMessage(error),
        normalizedError: errorMessage,
        status: this.modelRetryHandler.getModelErrorStatus(error)
      })
      this.streamHandler.sendError(webContents, sessionId, errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      this.stopController.deleteAbortController(sessionId)
      this.stopController.clearStoppedSession(sessionId)
    }
  }

  /**
   * 中止请求
   */
  stopRequest(sessionId?: string): void {
    this.stopController.stopRequest(sessionId)
  }

  /**
   * 创建 OpenAI 客户端
   */
  private createClient(config: LLMConfig): OpenAI {
    return new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: 120000
    })
  }

  /**
   * 验证并获取 LLM 配置
   */
  private validateAndGetLLMConfig(
    modelKey: string,
    sessionId: string,
    webContents: WebContents
  ): LLMConfig | null {
    const config = configManager.getConfig()
    if (!config) {
      const error = '配置未加载'
      logger.error(error, 'main')
      this.streamHandler.sendError(webContents, sessionId, error)
      return null
    }

    const llmConfig = config.llm_config.models.find((m) => m.model_name === modelKey)
    if (!llmConfig) {
      const error = `未找到模型配置: ${modelKey}`
      logger.error(error, 'main')
      this.streamHandler.sendError(webContents, sessionId, error)
      return null
    }

    return llmConfig
  }
}
