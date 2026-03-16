import type { ChatRequest, MCPToolReference } from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import { sandboxToolService } from '../sandbox'
import { knowledgeToolService } from '../knowledge'
import { getPptTemplateService, presentationToolService } from '../presentation'
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
   * 判断当前请求是否需要暴露 PPT 模板工具
   */
  shouldExposePresentationTools(request: ChatRequest): boolean {
    if (request.selectedPptTemplate) {
      return true
    }
    return getPptTemplateService().getAvailableTemplates().length > 0
  }

  /**
   * 构建工具列表
   */
  buildToolList(
    request: ChatRequest,
    selectedKnowledgeBases?: KnowledgeBaseReference[],
    sessionId?: string,
    enablePresentationTools?: boolean
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

    if (enablePresentationTools) {
      const presentationTools = this.buildPresentationTools()
      allTools.push(...presentationTools)

      this.logger.info('已添加 PPT 模板工具到工具列表', 'main', {
        sessionId,
        presentationToolCount: presentationTools.length,
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
   * 构建 PPT 模板工具列表
   */
  private buildPresentationTools(): MCPToolReference[] {
    return presentationToolService.getTools().map((tool) => {
      const toolName = tool.name.startsWith('presentation__')
        ? tool.name.slice('presentation__'.length)
        : tool.name
      return {
        serverName: tool.serverName || 'presentation',
        toolName,
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
        toolName: toolName,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    })
  }
}
