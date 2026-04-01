import type { ChatRequest, MCPToolReference } from '../../types/chat'
import type { KnowledgeBaseReference } from '@shared/types/knowledge'
import { sandboxToolService } from '../sandbox'
import { knowledgeToolService } from '../knowledge'
import { presentationToolService } from '../presentation'
import { videoToolService } from '../video'
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
   * 判断当前请求是否需要暴露 PPT 工具
   * 通过关键词匹配检测 PPT 意图
   */
  shouldExposePresentationTools(request: ChatRequest): boolean {
    const content = request.messages
      .map((m) => m.content)
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const pptKeywords = ['ppt', '幻灯片', '演示文稿', 'presentation', 'slide', 'powerpoint']
    return pptKeywords.some((keyword) => content.includes(keyword))
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

      this.logger.info('已添加 PPT 工具到工具列表', 'main', {
        sessionId,
        presentationToolCount: presentationTools.length,
        totalToolCount: allTools.length
      })
    }

    const videoTools = this.buildVideoTools()
    if (videoTools.length > 0) {
      allTools.push(...videoTools)

      this.logger.info('已添加视频工具到工具列表', 'main', {
        sessionId,
        videoToolCount: videoTools.length,
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
   * 构建 PPT 工具列表
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
   * 构建视频工具列表
   */
  private buildVideoTools(): MCPToolReference[] {
    return videoToolService.getTools().map((tool) => {
      const toolName = tool.name.startsWith('video__')
        ? tool.name.slice('video__'.length)
        : tool.name
      return {
        serverName: tool.serverName || 'video',
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
        toolName,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    })
  }
}
