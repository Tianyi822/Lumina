import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@main/types/mcp'
import type { ToolArgs, LabToolDefinition } from './tools/types'
import { execTools } from './tools/execTools'
import { fileTools } from './tools/fileTools'
import { fileReadTools } from './tools/fileReadTools'
import { ptyTools } from './tools/ptyTools'

/**
 * 实验室工具服务
 * 将实验室操作封装为 LLM 可调用的 MCP 工具格式
 */
export class LabToolService {
  private tools: Map<string, LabToolDefinition> = new Map()

  constructor() {
    this.registerTools([...execTools, ...fileTools, ...fileReadTools, ...ptyTools])
  }

  /**
   * 注册工具
   */
  private registerTools(tools: LabToolDefinition[]): void {
    tools.forEach((tool) => {
      this.tools.set(tool.name, tool)
    })
  }

  /**
   * 获取所有实验室管理工具定义（含交互类工具 lab__ask_user）
   * @returns MCP 工具定义数组
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
      name: 'lab__ask_user',
      description:
        '向用户提问并提供选项，等待用户选择后继续。仅在缺少无法根据上下文安全推断的关键决策、继续会产生高成本/不可逆影响，或用户明确要求选择时使用；能用合理默认值继续时不要调用此工具',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '向用户提出的问题，应只包含当前无法自行判断且必须由用户决定的内容'
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
      serverName: 'lab'
    })

    return mcpTools
  }

  /**
   * 执行指定工具
   * @param name - 工具名称
   * @param args - 工具参数
   * @param onProgress - 进度回调
   */
  async callTool(
    name: string,
    args: ToolArgs,
    onProgress?: (message: string) => void
  ): Promise<MCPToolCallResult> {
    // 当前工具的 args 不携带凭据（连接已移至 UI 侧 IPC），可直接记录
    logger.info(`执行实验室工具: ${name}`, 'main', { args })

    try {
      // 检查是否是交互类工具
      if (name === 'lab__ask_user') {
        return this.askUser(args)
      }

      const tool = this.tools.get(name)
      if (tool) {
        return await tool.execute(args, onProgress)
      }

      return {
        success: false,
        error: `未知工具: ${name}`
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`实验室工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 向用户提问并等待选择
   * 返回特殊 user_interaction_required 信号，ChatService 检测后会暂停 ReAct 循环并向用户展示选项
   * @param args - 包含 question 和 options 参数
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
 * 实验室工具服务单例
 */
export const labToolService = new LabToolService()
