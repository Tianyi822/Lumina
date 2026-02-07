// 缓存键生成和管理，使用 SHA256 哈希生成唯一且一致的缓存键

import { createHash } from 'crypto'

// 缓存键类型
export enum CacheKeyType {
  SystemPrompt = 'system',
  ToolDescription = 'tool',
  ExampleFormatting = 'example'
}

// 缓存键选项
export interface CacheKeyOptions {
  // 提示词配置（用于系统提示词缓存）
  promptConfig?: Record<string, unknown>
  // 工具列表（用于系统提示词和工具描述缓存）
  tools?: Array<{
    serverName?: string
    toolName?: string
    name?: string
    description?: string
    inputSchema?: object
  }>
  // 工具描述级别
  toolDescriptionLevel?: string
  // 示例 ID 列表（用于系统提示词缓存）
  exampleIds?: string[]
  // 示例内容（用于示例格式化缓存）
  example?: {
    userQuery: string
    thought: string
    finalAnswer: string
  }
}

// 缓存键生成器
export class CacheKeyGenerator {
  // 生成缓存键，格式: "{type}:{hash1}:{hash2}:...{hashN}"
  static generate(type: CacheKeyType, options: CacheKeyOptions): string {
    const parts: string[] = [type]

    switch (type) {
      case CacheKeyType.SystemPrompt: {
        parts.push(this.hashPromptConfig(options.promptConfig || {}))
        parts.push(this.hashTools(options.tools || []))
        parts.push(this.hashExampleIds(options.exampleIds || []))
        break
      }

      case CacheKeyType.ToolDescription: {
        const tool = options.tools?.[0]
        if (tool) {
          // 处理 MCPToolReference 格式
          const toolName =
            tool.serverName && tool.toolName
              ? `${tool.serverName}__${tool.toolName}`
              : tool.name || 'unknown'
          parts.push(this.sanitizeToolName(toolName))
          parts.push(options.toolDescriptionLevel || 'detailed')
        }
        break
      }

      case CacheKeyType.ExampleFormatting: {
        if (options.example) {
          parts.push(this.hashExample(options.example))
        }
        break
      }
    }

    return parts.join(':')
  }

  // 哈希提示词配置
  private static hashPromptConfig(config: Record<string, unknown>): string {
    // 规范化配置对象
    const normalized = this.normalizeObject(config)
    return this.hashString(JSON.stringify(normalized))
  }

  // 哈希工具列表
  private static hashTools(
    tools: Array<{
      serverName?: string
      toolName?: string
      name?: string
      description?: string
      inputSchema?: object
    }>
  ): string {
    // 规范化工具列表
    const normalized = tools
      .map((tool) => {
        // 处理 MCPToolReference 格式
        const name =
          tool.serverName && tool.toolName
            ? `${tool.serverName}__${tool.toolName}`
            : tool.name || ''

        return {
          name,
          desc: tool.description || '',
          schema: tool.inputSchema || {}
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return this.hashString(JSON.stringify(normalized))
  }

  // 哈希示例 ID 列表
  private static hashExampleIds(ids: string[]): string {
    const sorted = [...ids].sort()
    return this.hashString(sorted.join(','))
  }

  // 哈希示例内容
  private static hashExample(example: {
    userQuery: string
    thought: string
    finalAnswer: string
  }): string {
    const content = `${example.userQuery}|${example.thought}|${example.finalAnswer}`
    return this.hashString(content)
  }

  // 生成 SHA256 哈希（截取前12字符）
  private static hashString(input: string): string {
    return createHash('sha256').update(input, 'utf-8').digest('hex').substring(0, 12)
  }

  // 规范化对象（确保一致的键顺序）
  private static normalizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const keys = Object.keys(obj).sort()
    const normalized: Record<string, unknown> = {}

    for (const key of keys) {
      const value = obj[key]
      if (value === undefined) continue

      if (Array.isArray(value)) {
        normalized[key] = value
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = this.normalizeObject(value as Record<string, unknown>)
      } else {
        normalized[key] = value
      }
    }

    return normalized
  }

  // 清理工具名称（移除特殊字符）
  private static sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  // 解析缓存键类型
  static parseType(key: string): CacheKeyType | null {
    const parts = key.split(':')
    if (parts.length === 0) return null

    const type = parts[0]
    if (Object.values(CacheKeyType).includes(type as CacheKeyType)) {
      return type as CacheKeyType
    }

    return null
  }
}
