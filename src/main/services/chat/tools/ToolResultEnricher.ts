import type { ToolResultMetadata, EnrichedToolResult, CoverageLevel } from './PipelineTypes'
import type { ToolExecutionResult } from './UnifiedToolExecutor'
import type { ToolCategory } from './UnifiedToolRegistry'
import type { MCPToolCallResult } from '@shared/types/mcp'

/**
 * 工具结果增强器
 * 为工具执行结果附加元数据（覆盖度、关键发现、可信度等），
 * 供 ToolOrchestrator 和 ToolResultMerger 决策使用
 */
export class ToolResultEnricher {
  /**
   * 增强单个工具执行结果
   * @param toolCallId 工具调用 ID
   * @param toolName 工具名称
   * @param mcpResult 原始工具调用结果
   * @returns 携带元数据的增强结果
   */
  enrich(toolCallId: string, toolName: string, mcpResult: MCPToolCallResult): EnrichedToolResult {
    const metadata = this.defaultEnrich(toolName, mcpResult)
    const baseResult: ToolExecutionResult = {
      toolCallId,
      toolName,
      content:
        typeof mcpResult.content === 'string'
          ? mcpResult.content
          : JSON.stringify(mcpResult.content ?? ''),
      success: mcpResult.success,
      error: mcpResult.error
    }
    return { ...baseResult, metadata }
  }

  /**
   * 默认结果增强策略
   * 根据内容长度和章节数量评估覆盖度，提取关键发现
   */
  defaultEnrich(toolName: string, result: MCPToolCallResult): ToolResultMetadata {
    const content =
      typeof result.content === 'string' ? result.content : JSON.stringify(result.content ?? '')

    const sectionCount = (content.match(/^##\s/gm) || []).length
    const contentLength = content.length

    let coverage: CoverageLevel
    if (!result.success) {
      coverage = 'low'
    } else if (sectionCount >= 3 && contentLength > 1000) {
      coverage = 'high'
    } else if (sectionCount >= 1 && contentLength > 300) {
      coverage = 'medium'
    } else {
      coverage = 'low'
    }

    const keyFindings = this.extractKeyFindings(content)

    return {
      coverage,
      keyFindings,
      sourceType: this.inferCategory(toolName),
      sourceName: toolName,
      confidence: result.success ? Math.min((sectionCount + 1) / 4, 1) : 0
    }
  }

  /**
   * 从内容中提取以 - 或 * 开头的列表项作为关键发现
   * 最多返回 5 条
   */
  extractKeyFindings(content: string): string[] {
    return content
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return trimmed.startsWith('- ') || trimmed.startsWith('• ')
      })
      .slice(0, 5)
  }

  /**
   * 从工具名中推断类别
   * 按 name__prefix 格式解析前缀（如 paper__read_page → paper）
   */
  inferCategory(toolName: string): ToolCategory {
    const prefix = toolName.split('__')[0]
    const knownCategories: ToolCategory[] = ['paper', 'knowledge', 'paper_web', 'writer', 'mcp']
    if (knownCategories.includes(prefix as ToolCategory)) {
      return prefix as ToolCategory
    }
    return 'mcp'
  }
}
