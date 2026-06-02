import type { ToolResultMetadata, EnrichedToolResult, CoverageLevel } from './PipelineTypes'
import type { ToolExecutionResult } from './UnifiedToolExecutor'
import type { ToolCategory } from './UnifiedToolRegistry'
import type { MCPToolCallResult } from '@shared/types/mcp'

export class ToolResultEnricher {
  enrich(toolCallId: string, toolName: string, mcpResult: MCPToolCallResult): EnrichedToolResult {
    const metadata = this.defaultEnrich(toolName, mcpResult)
    const baseResult: ToolExecutionResult = {
      toolCallId,
      toolName,
      content: typeof mcpResult.content === 'string' ? mcpResult.content : JSON.stringify(mcpResult.content ?? ''),
      success: mcpResult.success,
      error: mcpResult.error
    }
    return { ...baseResult, metadata }
  }

  defaultEnrich(toolName: string, result: MCPToolCallResult): ToolResultMetadata {
    const content = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content ?? '')

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

  extractKeyFindings(content: string): string[] {
    return content
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return trimmed.startsWith('- ') || trimmed.startsWith('• ')
      })
      .slice(0, 5)
  }

  inferCategory(toolName: string): ToolCategory {
    const prefix = toolName.split('__')[0]
    const knownCategories: ToolCategory[] = ['paper', 'knowledge', 'lab', 'paper_web', 'mcp']
    if (knownCategories.includes(prefix as ToolCategory)) {
      return prefix as ToolCategory
    }
    return 'mcp'
  }
}
