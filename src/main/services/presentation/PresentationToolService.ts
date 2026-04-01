/**
 * PPT 工具服务
 * 将妙笔 PPT 生成能力封装为模型可调用的内建工具
 */

import { logger } from '@main/services/logger'
import { aliyunMiaobiService } from './aliyun'
import type { MCPTool, MCPToolCallResult } from '@main/types/mcp'

interface ToolArgs {
  [key: string]: unknown
}

interface PresentationToolCallContext {
  sessionId?: string
  onOutlineChunk?: (text: string) => void
}

interface OutlineConfirmationContext {
  prompt: string
  outline: string
  taskId: string
}

/**
 * PPT 工具服务
 */
export class PresentationToolService {
  private latestOutlineContextBySession = new Map<string, OutlineConfirmationContext>()

  /**
   * 获取可用工具定义
   */
  getTools(): MCPTool[] {
    return [
      {
        name: 'presentation__generate_ppt',
        description: '当用户要制作 PPT、幻灯片、演示文稿时使用。根据用户描述生成 PPT 大纲内容。',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'PPT 主题或用户需求描述'
            }
          },
          required: ['prompt']
        },
        serverName: 'presentation'
      },
      {
        name: 'presentation__request_outline_confirmation',
        description:
          '在 PPT 大纲生成完成后使用。将大纲展示给用户确认或修改，等待用户确认后再继续。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'presentation'
      }
    ]
  }

  /**
   * 执行工具调用
   */
  async callTool(
    name: string,
    args: ToolArgs,
    context: PresentationToolCallContext = {}
  ): Promise<MCPToolCallResult> {
    logger.info(`执行 PPT 工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        case 'presentation__generate_ppt':
          return await this.generatePpt(args, context)
        case 'presentation__request_outline_confirmation':
          return this.requestOutlineConfirmation(context)
        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`PPT 工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 生成 PPT 大纲
   */
  private async generatePpt(
    args: ToolArgs,
    context: PresentationToolCallContext
  ): Promise<MCPToolCallResult> {
    const prompt = typeof args.prompt === 'string' ? args.prompt : ''

    if (!prompt.trim()) {
      return {
        success: false,
        error: '缺少必需参数: prompt'
      }
    }

    const normalizedPrompt = prompt.trim()
    const sessionId = context.sessionId?.trim() || ''
    const result = await aliyunMiaobiService.generateOutline(
      normalizedPrompt,
      (text) => {
        context.onOutlineChunk?.(text)
      },
      sessionId
    )

    if (!result.success || !result.outline) {
      return {
        success: false,
        error: result.error || '大纲生成失败'
      }
    }

    if (sessionId && result.taskId) {
      this.latestOutlineContextBySession.set(sessionId, {
        prompt: normalizedPrompt,
        outline: result.outline,
        taskId: result.taskId
      })
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId: result.taskId,
            outline: result.outline
          })
        }
      ]
    }
  }

  /**
   * 请求用户确认大纲
   */
  private requestOutlineConfirmation(context: PresentationToolCallContext): MCPToolCallResult {
    const sessionId = context.sessionId?.trim() || ''
    const latestOutlineContext = sessionId
      ? this.latestOutlineContextBySession.get(sessionId)
      : undefined

    if (!latestOutlineContext) {
      return {
        success: false,
        error: '当前会话暂无可确认的 PPT 大纲，请先生成大纲'
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            interactionType: 'ppt_outline_confirmation',
            question: 'PPT 大纲已生成，请确认或修改后继续。',
            prompt: latestOutlineContext.prompt,
            outline: latestOutlineContext.outline,
            taskId: latestOutlineContext.taskId,
            options: [
              {
                value: 'confirm',
                label: '确认并生成 PPT',
                description: '使用当前大纲直接生成 PPT'
              },
              { value: 'edit', label: '修改大纲', description: '在大纲编辑器中修改内容' }
            ]
          })
        }
      ]
    }
  }
}

/**
 * PPT 工具服务单例
 */
export const presentationToolService = new PresentationToolService()
