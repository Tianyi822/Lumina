import type { MCPToolReference } from '@main/types/chat'
import type { ToolDescriptionLevel } from '../prompts/types'

/**
 * 工具描述增强器
 * 为 MCP 工具添加详细的参数说明和使用建议，
 * 支持 minimal（< 50 tokens）、basic（50-150 tokens）、detailed（150-300 tokens）三种级别
 */
class ToolDescriptionEnhancer {
  /**
   * 增强工具描述
   * @param tool 待增强的 MCP 工具引用
   * @param level 增强级别：minimal 只返回工具名+一句话，basic 追加参数名和类型，detailed 包含完整参数说明、示例和使用建议
   * @returns 增强后的工具描述文本
   */
  enhanceToolDescription(tool: MCPToolReference, level: ToolDescriptionLevel = 'detailed'): string {
    const baseDescription = tool.description || ''

    switch (level) {
      case 'minimal':
        return this.enhanceMinimal(tool, baseDescription)
      case 'basic':
        return this.enhanceBasic(tool, baseDescription)
      case 'detailed':
      default:
        return this.enhanceDetailed(tool, baseDescription)
    }
  }

  /**
   * 最小级别增强
   * 只返回工具名称和一句话描述（< 50 tokens）
   */
  private enhanceMinimal(tool: MCPToolReference, baseDescription: string): string {
    // 获取第一句话作为简短描述
    const firstSentence = baseDescription.split(/[。.！!\n]/)[0].trim()
    const toolFullName = `${tool.serverName}__${tool.toolName}`

    if (firstSentence && firstSentence.length > 0) {
      return `${toolFullName}: ${firstSentence}`
    }

    // 如果没有描述，基于工具名生成一个简单描述
    const generatedDesc = this.generateMinimalDescription(tool.toolName)
    return `${toolFullName}: ${generatedDesc}`
  }

  /**
   * 基于工具名称生成简短描述
   * 通过工具名中的关键词（search/query/read/get/create/delete 等）推断其功能
   */
  private generateMinimalDescription(toolName: string): string {
    const name = toolName.toLowerCase()

    if (name.includes('search') || name.includes('query') || name.includes('find')) {
      return '搜索查询工具'
    } else if (name.includes('read') || name.includes('get') || name.includes('fetch')) {
      return '数据获取工具'
    } else if (name.includes('write') || name.includes('create') || name.includes('save')) {
      return '数据写入工具'
    } else if (name.includes('delete') || name.includes('remove')) {
      return '数据删除工具'
    } else if (name.includes('update') || name.includes('modify')) {
      return '数据更新工具'
    } else if (name.includes('list') || name.includes('enum')) {
      return '列表枚举工具'
    } else if (name.includes('execute') || name.includes('run')) {
      return '命令执行工具'
    } else if (name.includes('file') || name.includes('dir') || name.includes('path')) {
      return '文件操作工具'
    } else if (name.includes('web') || name.includes('http') || name.includes('url')) {
      return '网络请求工具'
    } else if (name.includes('db') || name.includes('sql') || name.includes('query')) {
      return '数据库操作工具'
    }

    return '执行指定操作'
  }

  /**
   * 基础级别增强
   * 包含参数名称和类型（50-150 tokens）
   */
  private enhanceBasic(tool: MCPToolReference, baseDescription: string): string {
    const paramsInfo = this.extractParametersSummary(tool)
    if (!paramsInfo) {
      return baseDescription
    }

    return `${baseDescription}\n参数: ${paramsInfo}`
  }

  /**
   * 详细级别增强
   * 包含完整描述、参数说明、使用示例（150-300 tokens）
   */
  private enhanceDetailed(tool: MCPToolReference, baseDescription: string): string {
    let enhanced = baseDescription

    const paramsInfo = this.extractDetailedParameters(tool)
    if (paramsInfo) {
      enhanced += `\n\n参数:\n${paramsInfo}`
    }

    // 添加参数示例
    const examples = this.generateParameterExamples(tool)
    if (examples) {
      enhanced += `\n\n示例: ${examples}`
    }

    const usageTips = this.generateUsageTips(tool)
    if (usageTips) {
      enhanced += `\n\n使用建议:\n${usageTips}`
    }

    return enhanced
  }

  /**
   * 提取参数摘要
   * 用于基础级别，只列出参数名称、类型和是否必需
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
      const prop = properties[name] as Record<string, unknown>
      const isRequired = required.includes(name)
      const type = this.formatParameterType(prop)
      return `${name} (${type}, ${isRequired ? 'required' : 'optional'})`
    })

    return params.join(', ')
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
   * 生成参数示例值
   * 根据参数类型和名称生成合理的示例值
   */
  private generateParameterExamples(tool: MCPToolReference): string | null {
    const schema = tool.inputSchema
    if (!schema || !schema.properties) {
      return null
    }

    const properties = schema.properties
    const required = (schema.required as string[]) || []
    const examples: Record<string, unknown> = {}

    for (const [name, prop] of Object.entries(properties)) {
      const property = prop as Record<string, unknown>
      const type = property.type as string | undefined
      const enumValues = property.enum as unknown[] | undefined

      // 如果是必需参数，生成示例值
      if (required.includes(name)) {
        if (enumValues && enumValues.length > 0) {
          examples[name] = enumValues[0]
        } else if (type === 'string') {
          examples[name] = this.generateStringExample(name, tool.toolName)
        } else if (type === 'number' || type === 'integer') {
          examples[name] = this.generateNumberExample(name)
        } else if (type === 'boolean') {
          examples[name] = true
        } else if (type === 'array') {
          examples[name] = []
        } else {
          examples[name] = null
        }
      }
    }

    if (Object.keys(examples).length === 0) {
      return null
    }

    return JSON.stringify(examples)
  }

  /**
   * 根据参数名和工具名生成合理的字符串示例值
   */
  private generateStringExample(paramName: string, toolName: string): string {
    const name = paramName.toLowerCase()
    const tool = toolName.toLowerCase()

    if (name.includes('path') || name.includes('file')) {
      return '/path/to/file'
    } else if (name.includes('url') || name.includes('link')) {
      return 'https://example.com'
    } else if (name.includes('query') || name.includes('search')) {
      return 'search keyword'
    } else if (name.includes('name')) {
      if (tool.includes('file')) return 'filename.txt'
      if (tool.includes('container')) return 'my-container'
      return 'example-name'
    } else if (name.includes('id')) {
      return 'id-12345'
    } else if (name.includes('content') || name.includes('text')) {
      return 'content text'
    } else if (name.includes('command') || name.includes('cmd')) {
      return 'ls -la'
    } else if (name.includes('city')) {
      return '北京'
    } else if (name.includes('code')) {
      return 'CN'
    }

    return 'example-value'
  }

  /**
   * 根据参数名生成合理的数字示例值
   */
  private generateNumberExample(paramName: string): number {
    const name = paramName.toLowerCase()

    if (name.includes('limit') || name.includes('count') || name.includes('max')) {
      return 10
    } else if (name.includes('page')) {
      return 1
    } else if (name.includes('timeout')) {
      return 30000
    } else if (name.includes('port')) {
      return 8080
    } else if (name.includes('temperature')) {
      return 0.7
    }

    return 0
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
const toolDescriptionEnhancer = new ToolDescriptionEnhancer()

/**
 * 增强单个工具描述的便捷函数
 */
function enhanceToolDescription(
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
