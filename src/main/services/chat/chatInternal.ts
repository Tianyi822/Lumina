import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { Logger } from '../logger'
import type { MCPService } from '../mcp'
import type { StopController } from './StopController'
import type { StreamHandler } from './StreamHandler'
import type { LLMConfig } from '../../types/config'

/**
 * ReactLoopService 配置选项
 */
export interface ReactLoopServiceOptions {
  logger: Logger
  mcpService: MCPService
  stopController: StopController
  streamHandler: StreamHandler
  createClient: (config: LLMConfig) => OpenAI
  validateAndGetLLMConfig: (
    modelKey: string,
    sessionId: string,
    webContents: WebContents,
    turnId?: string
  ) => LLMConfig | null
}

/**
 * 流式响应累积状态
 */
export interface StreamAccumulatorState {
  assistantContent: string
  /** 用于 UI 展示的完整推理内容，包含原生字段和 <think> 标签内容 */
  assistantReasoningContent: string
  /** 仅包含模型原生 reasoning_content，用于工具调用后的 API 回放 */
  assistantApiReasoningContent: string
  toolCalls: Map<
    number,
    { id: string; type: 'function'; function: { name: string; arguments: string } }
  >
  hasToolCalls: boolean
}
