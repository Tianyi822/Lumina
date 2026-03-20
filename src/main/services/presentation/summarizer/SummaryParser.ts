import type { PptTemplateAiSummary } from '@shared/types/ppt-template'

/**
 * AI 总结结果解析器
 */
export class SummaryParser {
  /**
   * 解析模型返回内容
   */
  parse(aiResponse: string): PptTemplateAiSummary {
    const normalized = this.normalize(aiResponse)

    try {
      return JSON.parse(normalized) as PptTemplateAiSummary
    } catch (error) {
      throw new Error(`AI 总结解析失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 归一化模型返回的 JSON 字符串
   * 支持纯 JSON 和 Markdown code block
   */
  normalize(jsonString: string): string {
    const trimmed = jsonString.trim()

    if (!trimmed) {
      throw new Error('AI 总结内容为空')
    }

    if (!trimmed.startsWith('```')) {
      return trimmed
    }

    const codeBlockMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
    if (!codeBlockMatch) {
      throw new Error('AI 总结格式无效，无法从代码块中提取 JSON')
    }

    const content = codeBlockMatch[1]?.trim()
    if (!content) {
      throw new Error('AI 总结代码块内容为空')
    }

    return content
  }
}
