import type { MCPToolReference } from '@main/types/chat'
import type { ToolDescriptionLevel } from './prompts/types'

/**
 * 工具描述增强器
 * 为 MCP 工具添加详细的参数说明和使用建议
 */
export class ToolDescriptionEnhancer {
  /**
   * 增强工具描述
   * 根据指定的级别返回不同程度的工具描述
   */
  enhanceToolDescription(tool: MCPToolReference, level: ToolDescriptionLevel = 'detailed'): string {
    const baseDescription = tool.description || ''

    switch (level) {
      case 'minimal':
        return baseDescription
      case 'basic':
        return this.enhanceBasic(tool, baseDescription)
      case 'detailed':
      default:
        return this.enhanceDetailed(tool, baseDescription)
    }
  }

  /**
   * 基础级别增强
   * 只添加参数列表，不添加详细说明和使用建议
   */
  private enhanceBasic(tool: MCPToolReference, baseDescription: string): string {
    const paramsInfo = this.extractParametersSummary(tool)
    if (!paramsInfo) {
      return baseDescription
    }

    return `${baseDescription}\n\n**参数**:\n${paramsInfo}`
  }

  /**
   * 详细级别增强
   * 添加参数说明、类型信息和智能生成使用建议
   */
  private enhanceDetailed(tool: MCPToolReference, baseDescription: string): string {
    let enhanced = baseDescription

    const paramsInfo = this.extractDetailedParameters(tool)
    if (paramsInfo) {
      enhanced += `\n\n**参数**:\n${paramsInfo}`
    }

    const usageTips = this.generateUsageTips(tool)
    if (usageTips) {
      enhanced += `\n\n**使用建议**:\n${usageTips}`
    }

    return enhanced
  }

  /**
   * 提取参数摘要
   * 用于基础级别，只列出参数名称和是否必需
   */
  private extractParametersSummary(tool: MCPToolReference): string | null {
    const schema = tool.inputSchema
    if (!schema || !schema.properties) {
      return null
    }

    const properties = schema.properties
    const paramNames = Object.keys(properties)

    if (paramNames.length === 0) {
      return null
    }

    const required = (schema.required as string[]) || []
    const params = paramNames.map((name) => {
      const isRequired = required.includes(name)
      return `- \`${name}\`${isRequired ? ' (必需)' : ' (可选)'}`
    })

    return params.join('\n')
  }

  /**
   * 提取详细参数说明
   * 用于详细级别，包含参数类型、是否必需和参数描述
   */
  private extractDetailedParameters(tool: MCPToolReference): string | null {
    const schema = tool.inputSchema
    if (!schema || !schema.properties) {
      return null
    }

    const properties = schema.properties
    const required = (schema.required as string[]) || []
    const paramNames = Object.keys(properties)

    if (paramNames.length === 0) {
      return null
    }

    const params = paramNames.map((name) => {
      const prop = properties[name] as Record<string, unknown>
      const isRequired = required.includes(name)
      const type = this.formatParameterType(prop)
      const description = (prop.description as string) || ''

      let line = `- \`${name}\` (${type}${isRequired ? ', 必需' : ', 可选'})`
      if (description) {
        line += `: ${description}`
      }
      return line
    })

    return params.join('\n')
  }

  /**
   * 格式化参数类型
   * 将参数的类型信息转换为易读的字符串
   */
  private formatParameterType(prop: Record<string, unknown>): string {
    const type = prop.type as string | undefined
    const enumValues = prop.enum as unknown[] | undefined

    if (enumValues && enumValues.length > 0) {
      return `enum: ${enumValues.map((v) => `\`${v}\``).join(', ')}`
    }

    if (type === 'array') {
      const items = prop.items as Record<string, unknown> | undefined
      const itemType = items?.type as string | undefined
      return itemType ? `${itemType}[]` : 'array'
    }

    return type || 'any'
  }

  /**
   * 生成工具使用建议
   * 根据工具名称和参数智能生成相关的使用建议
   */
  private generateUsageTips(tool: MCPToolReference): string | null {
    const toolName = tool.toolName.toLowerCase()
    const tips: string[] = []

    if (toolName.includes('search') || toolName.includes('query')) {
      tips.push('- 使用具体、明确的关键词以获得更好的结果')
      tips.push('- 如果第一次结果不理想，尝试调整搜索词或使用同义词')
      tips.push('- 考虑使用多个关键词组合来缩小搜索范围')
    } else if (toolName.includes('read') || toolName.includes('get')) {
      tips.push('- 确保提供的路径或标识符是正确的')
      tips.push('- 检查是否有权限访问该资源')
      tips.push('- 如果读取失败，验证资源是否存在')
    } else if (
      toolName.includes('write') ||
      toolName.includes('create') ||
      toolName.includes('save')
    ) {
      tips.push('- 确保提供完整的内容数据')
      tips.push('- 检查目标路径是否存在，或是否需要创建父目录')
      tips.push('- 注意文件格式和编码是否正确')
    } else if (
      toolName.includes('file') ||
      toolName.includes('directory') ||
      toolName.includes('folder')
    ) {
      tips.push('- 使用绝对路径以避免路径错误')
      tips.push('- 注意不同操作系统的路径分隔符差异')
      tips.push('- 确保路径中包含必要的文件扩展名')
    } else if (
      toolName.includes('execute') ||
      toolName.includes('run') ||
      toolName.includes('command')
    ) {
      tips.push('- 小心使用系统命令，确保参数安全')
      tips.push('- 测试命令时考虑使用非破坏性参数（如 --dry-run）')
      tips.push('- 某些命令可能需要特定的执行环境或权限')
    } else if (
      toolName.includes('web') ||
      toolName.includes('http') ||
      toolName.includes('fetch')
    ) {
      tips.push('- 检查 URL 的完整性和格式正确性')
      tips.push('- 考虑网络超时设置，避免长时间等待')
      tips.push('- 注意某些网站可能有访问频率限制')
    }

    const schema = tool.inputSchema
    if (schema?.properties) {
      const required = (schema.required as string[]) || []
      const hasOptionalParams = Object.keys(schema.properties).some(
        (name) => !required.includes(name)
      )
      if (hasOptionalParams) {
        tips.push('- 可选参数可以提供更精确的结果，但不是必需的')
      }
    }

    return tips.length > 0 ? tips.join('\n') : null
  }
}

/**
 * 单例实例
 */
export const toolDescriptionEnhancer = new ToolDescriptionEnhancer()

/**
 * 增强单个工具描述的便捷函数
 */
export function enhanceToolDescription(
  tool: MCPToolReference,
  level: ToolDescriptionLevel = 'detailed'
): string {
  return toolDescriptionEnhancer.enhanceToolDescription(tool, level)
}

/**
 * 批量增强工具描述的便捷函数
 */
export function enhanceToolDescriptions(
  tools: MCPToolReference[],
  level: ToolDescriptionLevel = 'detailed'
): Map<string, string> {
  const enhanced = new Map<string, string>()
  for (const tool of tools) {
    const key = `${tool.serverName}__${tool.toolName}`
    enhanced.set(key, enhanceToolDescription(tool, level))
  }
  return enhanced
}
