import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@shared/types/mcp'
import { knowledgeCoreService } from './KnowledgeCoreService'

/**
 * 工具调用参数
 */
interface ToolArgs {
  [key: string]: unknown
}

/**
 * 知识库工具服务
 * 将知识库操作封装为 LLM 可调用的 MCP 工具格式
 * 让模型按需调用知识库搜索，而非自动搜索
 *
 * 注意：此服务通过 KnowledgeCoreService 实现核心业务逻辑，
 * 与 KnowledgeMCPServerService（MCP 服务）共享相同的底层实现
 */
class KnowledgeToolService {
  /**
   * 获取知识库工具定义
   * @param selectedKnowledgeBaseIds 选中的知识库 ID 列表，如果指定则只搜索这些知识库
   */
  async getTools(selectedKnowledgeBaseIds?: string[]): Promise<MCPTool[]> {
    // 获取可用知识库信息用于工具描述
    const knowledgeBases = await knowledgeCoreService.getKnowledgeBases({
      knowledgeBaseIds: selectedKnowledgeBaseIds
    })

    const kbDescription =
      knowledgeBases.length > 0
        ? `当前可用的知识库: ${knowledgeBases.map((kb) => `"${kb.name}"(${kb.id})`).join(', ')}`
        : '当前没有可用的知识库'

    return [
      {
        name: 'knowledge__search',
        description: `在用户显式选择的知识库中搜索相关内容。${kbDescription}。仅当用户明确要求使用知识库、跨文档比较或补充当前论文之外的资料时使用；不要把它作为当前论文检索不足时的自动兜底。使用精确的搜索词可以获得更好的结果。`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询文本，应该是一个描述性的关键词或问题'
            },
            knowledgeBaseId: {
              type: 'string',
              description:
                '知识库ID（可选）。如果不指定，则搜索所有可用知识库；如果指定，则只搜索该知识库'
            },
            limit: {
              type: 'number',
              description: '返回结果数量，默认为 5，最大为 20',
              default: 5
            }
          },
          required: ['query']
        },
        serverName: 'knowledge'
      },
      {
        name: 'knowledge__list',
        description: `获取可用知识库列表。${kbDescription}。当需要了解有哪些知识库可用时使用此工具。`,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'knowledge'
      },
      {
        name: 'knowledge__documents',
        description: `获取知识库中的文档列表。使用此工具了解某个知识库中有哪些文档。`,
        inputSchema: {
          type: 'object',
          properties: {
            knowledgeBaseId: {
              type: 'string',
              description: '知识库ID（必需）'
            }
          },
          required: ['knowledgeBaseId']
        },
        serverName: 'knowledge'
      }
    ]
  }

  /**
   * 执行知识库工具调用
   * @param name 工具名称（包含前缀，如 knowledge__search）
   * @param args 工具参数
   * @param selectedKnowledgeBaseIds 当前会话选中的知识库 ID 列表
   */
  async callTool(
    name: string,
    args: ToolArgs,
    selectedKnowledgeBaseIds?: string[]
  ): Promise<MCPToolCallResult> {
    logger.info(`执行知识库工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        case 'knowledge__search':
          return await this.searchKnowledge(args, selectedKnowledgeBaseIds)
        case 'knowledge__list':
          return await this.listKnowledgeBases(selectedKnowledgeBaseIds)
        case 'knowledge__documents':
          return await this.listDocuments(args, selectedKnowledgeBaseIds)

        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`知识库工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  // ==================== 工具实现（调用核心服务）====================

  /**
   * 搜索知识库
   */
  private async searchKnowledge(
    args: ToolArgs,
    selectedKnowledgeBaseIds?: string[]
  ): Promise<MCPToolCallResult> {
    const query = args.query as string
    const knowledgeBaseId = args.knowledgeBaseId as string | undefined
    const limit = Math.min((args.limit as number) || 5, 20)

    if (!query) {
      return {
        success: false,
        error: '缺少必需参数: query'
      }
    }

    // 调用核心服务执行搜索，限制结果数量最大为 20
    const result = await knowledgeCoreService.searchKnowledge({
      query,
      knowledgeBaseId,
      limit,
      allowedKnowledgeBaseIds: selectedKnowledgeBaseIds
    })

    // 格式化搜索结果为可读文本（按知识库分组展示）
    if (result.items.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: `在知识库中未找到与 "${query}" 相关的内容。建议尝试使用不同的关键词搜索。`
          }
        ]
      }
    }

    let resultText = `搜索 "${query}" 的结果:\n\n`

    // 按知识库分组展示结果，每个知识库独立一段
    const groupedByKB = new Map<string, typeof result.items>()
    for (const item of result.items) {
      const existing = groupedByKB.get(item.knowledgeBaseId) || []
      existing.push(item)
      groupedByKB.set(item.knowledgeBaseId, existing)
    }

    for (const [kbId, items] of groupedByKB) {
      const kbName = items[0]?.knowledgeBaseName || kbId
      resultText += `## 知识库: ${kbName}\n\n`

      for (const item of items) {
        resultText += `### 文档: ${item.fileName}\n`
        resultText += `**相关度: ${(item.similarity * 100).toFixed(1)}%**\n\n`
        resultText += `${item.content}\n\n---\n\n`
      }
    }

    resultText += `\n共找到 ${result.totalCount} 条相关内容。`

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: resultText
        }
      ]
    }
  }

  /**
   * 获取知识库列表
   */
  private async listKnowledgeBases(
    selectedKnowledgeBaseIds?: string[]
  ): Promise<MCPToolCallResult> {
    // 调用核心服务获取知识库列表
    const knowledgeBases = await knowledgeCoreService.getKnowledgeBases({
      knowledgeBaseIds: selectedKnowledgeBaseIds
    })

    if (knowledgeBases.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '当前没有可用的知识库。请先创建知识库并添加文档。'
          }
        ]
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `找到 ${knowledgeBases.length} 个知识库:\n\n${JSON.stringify(knowledgeBases, null, 2)}`
        }
      ]
    }
  }

  /**
   * 获取知识库文档列表
   */
  private async listDocuments(
    args: ToolArgs,
    selectedKnowledgeBaseIds?: string[]
  ): Promise<MCPToolCallResult> {
    const knowledgeBaseId = args.knowledgeBaseId as string

    if (!knowledgeBaseId) {
      return {
        success: false,
        error: '缺少必需参数: knowledgeBaseId'
      }
    }

    // 调用核心服务获取文档列表
    const documents = await knowledgeCoreService.getDocuments({
      knowledgeBaseId,
      allowedKnowledgeBaseIds: selectedKnowledgeBaseIds
    })

    if (documents === null) {
      return {
        success: false,
        error: selectedKnowledgeBaseIds?.length
          ? `知识库 ${knowledgeBaseId} 不在当前可用的知识库范围内`
          : `知识库不存在: ${knowledgeBaseId}`
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(documents, null, 2)
        }
      ]
    }
  }
}

/**
 * 知识库工具服务单例
 */
export const knowledgeToolService = new KnowledgeToolService()
