import { logger } from '@main/services/logger'
import { MCPTool, MCPToolCallResult } from '@main/types/mcp'
import { ToolArgs, SandboxToolDefinition } from './tools/types'
import { queryTools } from './tools/queryTools'
import { managementTools } from './tools/managementTools'
import { execTools } from './tools/execTools'
import { fileTools } from './tools/fileTools'
import { frontendTools } from './tools/frontendTools'

/**
 * 沙箱工具服务
 * 将 Docker 沙箱操作封装为 LLM 可调用的 MCP 工具格式
 */
export class SandboxToolService {
  private tools: Map<string, SandboxToolDefinition> = new Map()

  constructor() {
    this.registerTools([
      ...queryTools,
      ...managementTools,
      ...execTools,
      ...fileTools,
      ...frontendTools
    ])
  }

  /**
   * 注册工具
   */
  private registerTools(tools: SandboxToolDefinition[]): void {
    tools.forEach((tool) => {
      this.tools.set(tool.name, tool)
    })
  }

  /**
   * 获取所有沙箱管理工具定义
   */
  getTools(): MCPTool[] {
    const mcpTools = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName: tool.serverName
    }))

    // 添加交互类工具定义
    mcpTools.push({
      name: 'sandbox__ask_user',
      description: '向用户提问并提供选项，等待用户选择后继续。当需要用户确认或选择时使用此工具',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '向用户提出的问题'
          },
          options: {
            type: 'array',
            description: '供用户选择的选项列表',
            items: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  description: '选项的值，将作为用户选择结果返回'
                },
                label: {
                  type: 'string',
                  description: '选项显示的标签文本'
                },
                description: {
                  type: 'string',
                  description: '选项的详细描述（可选）'
                }
              },
              required: ['value', 'label']
            }
          }
        },
        required: ['question', 'options']
      },
      serverName: 'sandbox'
    })

    return mcpTools
  }

  /**
   * 执行指定工具
   */
  async callTool(name: string, args: ToolArgs): Promise<MCPToolCallResult> {
    logger.info(`执行沙箱工具: ${name}`, 'main', { args })

    try {
      // 检查是否是交互类工具
      if (name === 'sandbox__ask_user') {
        return this.askUser(args)
      }

      const tool = this.tools.get(name)
      if (tool) {
        return await tool.execute(args)
      }

      return {
        success: false,
        error: `未知工具: ${name}`
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`沙箱工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 向用户提问并等待选择
   * 返回特殊信号，ChatService 检测后会暂停 ReAct 循环并显示选项
   */
  private askUser(args: ToolArgs): MCPToolCallResult {
    const question = args.question as string
    const options = args.options as Array<{ value: string; label: string; description?: string }>

    if (!question) {
      return {
        success: false,
        error: '缺少必需参数: question'
      }
    }

    if (!options || !Array.isArray(options) || options.length === 0) {
      return {
        success: false,
        error: '缺少必需参数: options（至少需要一个选项）'
      }
    }

    // 返回用户交互请求信号
    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            question,
            options
          })
        }
      ]
    }
  }
}

/**
 * 沙箱工具服务单例
 */
export const sandboxToolService = new SandboxToolService()
