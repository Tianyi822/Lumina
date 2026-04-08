import type { ChatRequest, MCPToolReference } from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import { sandboxToolService } from '../sandbox'
import { knowledgeToolService } from '../knowledge'
import type { StopController } from './StopController'
import type { Logger } from '../logger'

/**
 * 工具列表构建器
 * 负责构建 ReAct 循环所需的工具列表
 */
export class ToolListBuilder {
  constructor(
    private readonly logger: Logger,
    private readonly stopController: StopController
  ) {}

  /**
   * 构建工具列表
   */
  buildToolList(
    request: ChatRequest,
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    sessionId?: string
  ): MCPToolReference[] {
    const { selectedTools, enableSandboxTools } = request
    const allTools: MCPToolReference[] = [...(selectedTools || [])]

    if (enableSandboxTools) {
      const sandboxTools = this.buildSandboxTools()
      allTools.push(...sandboxTools)

      this.logger.info('已添加沙箱工具到工具列表', 'main', {
        sessionId,
        sandboxToolCount: sandboxTools.length,
        totalToolCount: allTools.length
      })
    }

    if (selectedKnowledgeBases && selectedKnowledgeBases.length > 0 && sessionId) {
      const knowledgeTools = this.buildKnowledgeTools(selectedKnowledgeBases, sessionId)
      allTools.push(...knowledgeTools)

      this.logger.info('已添加知识库工具到工具列表', 'main', {
        sessionId,
        knowledgeToolCount: knowledgeTools.length,
        totalToolCount: allTools.length,
        selectedKnowledgeBases: selectedKnowledgeBases.map((kb) => kb.name)
      })
    }

    return allTools
  }

  /**
   * 构建沙箱工具列表
   */
  private buildSandboxTools(): MCPToolReference[] {
    return sandboxToolService.getTools().map((tool) => {
      const toolName = tool.name.startsWith('sandbox__')
        ? tool.name.slice('sandbox__'.length)
        : tool.name
      return {
        serverName: tool.serverName || 'sandbox',
        toolName: toolName,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    })
  }

  /**
   * 构建知识库工具列表
   */
  private buildKnowledgeTools(
    selectedKnowledgeBases: KnowledgeBaseReference[],
    sessionId: string
  ): MCPToolReference[] {
    const kbIds = selectedKnowledgeBases.map((kb) => kb.id)
    this.stopController.setSessionKnowledgeBases(sessionId, kbIds)

    return knowledgeToolService.getTools(kbIds).map((tool) => {
      const toolName = tool.name.startsWith('knowledge__')
        ? tool.name.slice('knowledge__'.length)
        : tool.name
      return {
        serverName: tool.serverName || 'knowledge',
        toolName,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    })
  }
}
