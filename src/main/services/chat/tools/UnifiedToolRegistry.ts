import OpenAI from 'openai'
import type { MCPToolReference } from '../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { enhanceToolDescriptions } from './ToolDescriptionEnhancer'
import type { ToolDescriptionLevel } from '../prompts/types'

function getDescriptionLevelByToolCount(toolCount: number): ToolDescriptionLevel {
  if (toolCount > 20) {
    return 'minimal'
  }

  if (toolCount > 10) {
    return 'basic'
  }

  return 'detailed'
}

/**
 * 工具适配器接口
 * 每个适配器封装一类工具源（实验室、知识库、MCP），提供统一的工具获取和执行接口
 */
export interface ToolAdapter {
  /** 获取该适配器提供的工具列表 */
  getTools(): MCPToolReference[]

  /** 执行工具调用，返回结构化的工具调用结果 */
  execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>
}

/**
 * 工具类别
 */
export type ToolCategory = 'lab' | 'knowledge' | 'mcp' | 'skill' | 'paper_web'

/**
 * 工具函数定义（内部存储格式）
 */
interface ToolFunctionDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * 已注册的工具条目
 */
export interface RegisteredTool {
  /** 工具完整名称（OpenAI function name 格式：serverName__toolName） */
  fullName: string
  /** 工具来源类别 */
  category: ToolCategory
  /** 来源服务器名 */
  serverName: string
  /** 工具函数定义 */
  functionDef: ToolFunctionDef
  /** 执行适配器引用 */
  adapter: ToolAdapter
  /** 注册时间 */
  registeredAt: Date
  /** 状态 */
  status: 'available' | 'unavailable'
  /** 执行超时时间（ms），lab 默认 180s，其他 60s */
  timeoutMs: number
}

/**
 * 统一工具注册表
 * 集中管理所有工具的注册、查询和生命周期
 */
export class UnifiedToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map()
  private aliases: Map<string, string> = new Map()

  /**
   * 批量注册工具
   */
  registerBatch(tools: MCPToolReference[], adapter: ToolAdapter, category: ToolCategory): void {
    for (const tool of tools) {
      const fullName = this.buildFullName(tool.serverName, tool.toolName)
      const openAIName =
        category === 'mcp' ? this.sanitizeName(tool.serverName, tool.toolName) : fullName

      this.tools.set(fullName, {
        fullName,
        category,
        serverName: tool.serverName,
        functionDef: {
          name: tool.toolName,
          description: tool.description,
          parameters: tool.inputSchema as Record<string, unknown>
        },
        adapter,
        registeredAt: new Date(),
        status: 'available',
        timeoutMs: category === 'lab' ? 180000 : 60000
      })
      this.aliases.set(openAIName, fullName)
    }
  }

  /**
   * 按服务器名注销工具（MCP 断连时使用）
   */
  unregisterByServer(serverName: string): void {
    for (const [fullName, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        this.deleteTool(fullName)
      }
    }
  }

  /**
   * 按类别注销工具
   */
  unregisterByCategory(category: ToolCategory): void {
    for (const [fullName, tool] of this.tools.entries()) {
      if (tool.category === category) {
        this.deleteTool(fullName)
      }
    }
  }

  /**
   * 查询单个工具
   */
  getTool(fullName: string): RegisteredTool | undefined {
    return this.tools.get(fullName) ?? this.tools.get(this.aliases.get(fullName) ?? '')
  }

  /**
   * 按类别查询工具
   */
  getToolsByCategory(category: ToolCategory): RegisteredTool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category)
  }

  /**
   * 获取所有已注册工具
   */
  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取所有已注册工具的 MCPToolReference 列表
   */
  getAllToolReferences(): MCPToolReference[] {
    return this.getAllTools().map((rt) => ({
      serverName: rt.serverName,
      toolName: rt.functionDef.name,
      description: rt.functionDef.description,
      inputSchema: rt.functionDef.parameters
    }))
  }

  /**
   * 构建 OpenAI tools 定义数组
   * 替代 ToolExecutor.buildOpenAITools()，从注册表中直接生成
   */
  buildOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const allRefs = this.getAllToolReferences()
    const descriptionLevel = getDescriptionLevelByToolCount(allRefs.length)
    const enhancedDescriptions = this.enhanceDescriptionsByCategory(allRefs, descriptionLevel)
    const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    for (const rt of this.tools.values()) {
      const { name, description, parameters } = rt.functionDef

      if (rt.category === 'lab') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `lab__${name}`,
            description,
            parameters
          }
        })
        continue
      }

      if (rt.category === 'knowledge') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `knowledge__${name}`,
            description,
            parameters
          }
        })
        continue
      }

      if (rt.category === 'skill') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `skill__${name}`,
            description,
            parameters
          }
        })
        continue
      }

      if (rt.category === 'paper_web') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `paper_web__${name}`,
            description,
            parameters
          }
        })
        continue
      }

      // MCP 工具：使用增强描述
      const toolKey = `${rt.serverName}__${name}`
      const enhancedDescription = enhancedDescriptions.get(toolKey) || description

      openAITools.push({
        type: 'function' as const,
        function: {
          name: this.sanitizeName(rt.serverName, name),
          description: enhancedDescription,
          parameters
        }
      })
    }

    return openAITools
  }

  /**
   * 清除所有已注册工具
   */
  clear(): void {
    this.tools.clear()
    this.aliases.clear()
  }

  /**
   * 已注册工具数量
   */
  get size(): number {
    return this.tools.size
  }

  /**
   * 对非 lab/knowledge 的工具进行描述增强
   */
  private enhanceDescriptionsByCategory(
    tools: MCPToolReference[],
    level: ToolDescriptionLevel
  ): Map<string, string> {
    const mcpTools = tools.filter(
      (t) =>
        t.serverName !== 'lab' &&
        t.serverName !== 'knowledge' &&
        t.serverName !== 'skill' &&
        t.serverName !== 'paper_web'
    )
    return enhanceToolDescriptions(mcpTools, level)
  }

  /**
   * 构建工具完整名称
   */
  private buildFullName(serverName: string, toolName: string): string {
    return `${serverName}__${toolName}`
  }

  /**
   * 删除工具及其 OpenAI 名称别名
   */
  private deleteTool(fullName: string): void {
    this.tools.delete(fullName)
    for (const [alias, target] of this.aliases.entries()) {
      if (target === fullName) {
        this.aliases.delete(alias)
      }
    }
  }

  /**
   * 规范化工具名（替换非字母数字字符）
   */
  private sanitizeName(serverName: string, toolName: string): string {
    const sanitizedServer = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const sanitizedTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `${sanitizedServer}__${sanitizedTool}`
  }
}
