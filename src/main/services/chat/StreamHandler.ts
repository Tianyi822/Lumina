import type { WebContents } from 'electron'
import type {
  PlanExecutionStatus,
  PlanStep,
  PlanStepStatus,
  ReactIterationStatus,
  StreamEvent,
  TokenUsage
} from '../../types/chat'

/**
 * 流式处理器
 * 负责发送流式事件到渲染进程
 */
export class StreamHandler {
  /**
   * 发送流式事件到渲染进程
   */
  sendStreamEvent(webContents: WebContents, event: StreamEvent): void {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream', event)
    }
  }

  /**
   * 发送内容事件
   */
  sendContent(webContents: WebContents, sessionId: string, content: string, turnId?: string): void {
    this.sendStreamEvent(webContents, {
      type: 'content',
      content,
      sessionId,
      turnId
    })
  }

  /**
   * 发送推理内容事件
   */
  sendReasoning(
    webContents: WebContents,
    sessionId: string,
    content: string,
    turnId?: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'reasoning',
      content,
      sessionId,
      turnId
    })
  }

  /**
   * 发送完成事件
   */
  sendDone(
    webContents: WebContents,
    sessionId: string,
    usage?: TokenUsage,
    turnId?: string,
    finalStatus?: StreamEvent['finalStatus']
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'done',
      usage,
      sessionId,
      turnId,
      finalStatus
    })
  }

  /**
   * 发送错误事件
   */
  sendError(
    webContents: WebContents,
    sessionId: string,
    error: string,
    turnId?: string,
    finalStatus: StreamEvent['finalStatus'] = 'failed'
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'error',
      error,
      sessionId,
      turnId,
      finalStatus
    })
  }

  /**
   * 发送 ReAct 迭代开始事件
   */
  sendReactIterationStart(
    webContents: WebContents,
    sessionId: string,
    iteration: number,
    status: ReactIterationStatus = 'thinking',
    turnId?: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'react_iteration_start',
      content: String(iteration),
      sessionId,
      status,
      turnId
    })
  }

  /**
   * 发送计划整体状态事件
   */
  sendPlanStatus(
    webContents: WebContents,
    sessionId: string,
    status: PlanExecutionStatus,
    message?: string,
    error?: string,
    turnId?: string,
    summary?: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'plan_status',
      sessionId,
      turnId,
      planStatus: {
        status,
        message,
        error,
        summary
      }
    })
  }

  /**
   * 发送计划生成完成事件
   */
  sendPlanGenerated(
    webContents: WebContents,
    sessionId: string,
    steps: PlanStep[],
    turnId?: string
  ): void {
    this.sendStreamEvent(webContents, {
      type: 'plan_generated',
      sessionId,
      turnId,
      plan: { steps, status: 'planned' }
    })
  }

  /**
   * 发送计划步骤状态更新事件
   */
  sendPlanStepUpdate(
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
    this.sendStreamEvent(webContents, {
      type: 'plan_step_update',
      sessionId,
      turnId,
      planStepUpdate: { index, status, summary, error, attempt, maxAttempts }
    })
  }
}
