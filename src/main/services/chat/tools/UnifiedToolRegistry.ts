import OpenAI from 'openai'
import type { MCPToolReference } from '../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolCategory } from '@shared/types/tool-stats'
import { enhanceToolDescriptions } from './ToolDescriptionEnhancer'
import type { ToolDescriptionLevel } from '../prompts/types'
import { deepSortPromptCacheValue } from '../PromptCacheOptimizer'

/**
 * 根据工具数量自动选择合适的描述级别
 * 工具越多，单个工具的权重越低，描述应更精简
 */
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
 * 每个适配器封装一类工具源（实验室、知识库、MCP 等），提供统一的工具获取和执行接口
 */
export interface ToolAdapter {
  /** 获取该适配器提供的工具列表 */
  getTools(): Promise<MCPToolReference[]>

  /**
   * 执行工具调用，返回结构化的工具调用结果
   * @param toolName 工具名称
   * @param args 调用参数
   * @param onProgress 执行进度回调（仅 lab 适配器支持）
   */
  execute(
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (message: string) => void
  ): Promise<MCPToolCallResult>

  /**
   * 可选：自定义结果增强
   * 不实现则使用 ToolResultEnricher 默认策略
   */
  enrichResult?(
    toolName: string,
    args: Record<string, unknown>,
    result: MCPToolCallResult
  ): import('./PipelineTypes').ToolResultMetadata
}

/**
 * 工具类别（从 @shared/types/tool-stats 重导出，保持向后兼容）
 */
export type { ToolCategory }

/** 工具函数定义（内部存储格式） */
interface ToolFunctionDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** 已注册的工具条目 */
export interface RegisteredTool {
  /** 工具完整名称（OpenAI function name 格式：serverName__toolName） */
  fullName: string
  /** 工具来源类别（paper/knowledge/lab/mcp 等） */
  category: ToolCategory
  /** 来源服务器名 */
  serverName: string
  /** 工具函数定义（名称、描述、参数 schema） */
  functionDef: ToolFunctionDef
  /** 执行适配器引用 */
  adapter: ToolAdapter
  /** 注册时间戳 */
  registeredAt: Date
  /** 当前可用状态 */
  status: 'available' | 'unavailable'
  /** 执行超时时间（ms），lab 默认 180s，其他 60s */
  timeoutMs: number
}

/**
 * 统一工具注册表
 * 集中管理所有工具的注册、查询和生命周期。
 * 支持按服务器名或类别批量注册/注销，自动维护 OpenAI 安全名称的别名映射。
 */
export class UnifiedToolRegistry {
  /** fullName -> RegisteredTool 映射 */
  private tools: Map<string, RegisteredTool> = new Map()
  /** OpenAI 安全名称 -> fullName 别名映射 */
  private aliases: Map<string, string> = new Map()

  /**
   * 批量注册工具
   * @param tools 工具引用列表
   * @param adapter 对应的执行适配器
   * @param category 工具类别
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
        timeoutMs: 60000
      })
      this.aliases.set(openAIName, fullName)
    }
  }

  /**
   * 按服务器名注销工具
   * 通常用于 MCP 服务器断连时清理其注册的工具
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
   * 查询单个工具（支持通过 OpenAI 安全名称查找）
   * @param fullName 工具完整名称或 OpenAI 安全名称
   */
  getTool(fullName: string): RegisteredTool | undefined {
    return this.tools.get(fullName) ?? this.tools.get(this.aliases.get(fullName) ?? '')
  }

  /**
   * 按类别查询工具列表
   */
  getToolsByCategory(category: ToolCategory): RegisteredTool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category)
  }

  /**
   * 获取所有已注册工具（按 OpenAI 工具名排序）
   */
  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      this.getOpenAIToolName(a).localeCompare(this.getOpenAIToolName(b))
    )
  }

  /**
   * 获取所有已注册工具的 MCPToolReference 列表
   * 用于传递给模型或序列化展示
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
   * 从注册表中直接生成，按类别添加前缀（knowledge__、paper__、paper_web__），
   * 并对 MCP 工具进行安全名称处理和描述增强
   */
  buildOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const allRefs = this.getAllToolReferences().map((tool) => ({
      ...tool,
      inputSchema: deepSortPromptCacheValue(tool.inputSchema) as Record<string, unknown>
    }))
    const descriptionLevel = getDescriptionLevelByToolCount(allRefs.length)
    const enhancedDescriptions = this.enhanceDescriptionsByCategory(allRefs, descriptionLevel)
    const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    for (const rt of this.getAllTools()) {
      const { name, description, parameters } = rt.functionDef
      const stableParameters = deepSortPromptCacheValue(parameters) as Record<string, unknown>

      if (rt.category === 'knowledge') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `knowledge__${name}`,
            description,
            parameters: stableParameters
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
            parameters: stableParameters
          }
        })
        continue
      }

      if (rt.category === 'paper') {
        openAITools.push({
          type: 'function' as const,
          function: {
            name: `paper__${name}`,
            description,
            parameters: stableParameters
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
          parameters: stableParameters
        }
      })
    }

    return openAITools
  }

  /** 清除所有已注册工具和别名 */
  clear(): void {
    this.tools.clear()
    this.aliases.clear()
  }

  /** 当前已注册的工具数量 */
  get size(): number {
    return this.tools.size
  }

  /**
   * 对非 lab/knowledge/paper 的工具进行描述增强
   * 内置工具的描述已人工优化，不需要再次增强
   */
  private enhanceDescriptionsByCategory(
    tools: MCPToolReference[],
    level: ToolDescriptionLevel
  ): Map<string, string> {
    const mcpTools = tools.filter(
      (t) =>
        t.serverName !== 'knowledge' && t.serverName !== 'paper' && t.serverName !== 'paper_web'
    )
    return enhanceToolDescriptions(mcpTools, level)
  }

  /** 构建工具完整名称（serverName__toolName 格式） */
  private buildFullName(serverName: string, toolName: string): string {
    return `${serverName}__${toolName}`
  }

  /**
   * 获取最终发给 OpenAI 的工具名称，用于排序输出
   * 内置类别添加对应前缀，MCP 工具使用安全名称
   */
  private getOpenAIToolName(tool: RegisteredTool): string {
    const { name } = tool.functionDef
    if (tool.category === 'knowledge') return `knowledge__${name}`
    if (tool.category === 'paper') return `paper__${name}`
    if (tool.category === 'paper_web') return `paper_web__${name}`
    return this.sanitizeName(tool.serverName, name)
  }

  /** 删除工具及其所有相关的别名映射 */
  private deleteTool(fullName: string): void {
    this.tools.delete(fullName)
    for (const [alias, target] of this.aliases.entries()) {
      if (target === fullName) {
        this.aliases.delete(alias)
      }
    }
  }

  /**
   * 规范化工具名（将非字母数字字符替换为连字符）
   * OpenAI 的 function name 只允许 a-zA-Z0-9_-，需要对任意 MCP 工具名做安全处理
   */
  private sanitizeName(serverName: string, toolName: string): string {
    const sanitizedServer = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const sanitizedTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `${sanitizedServer}__${sanitizedTool}`
  }
}
