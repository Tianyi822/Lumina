import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@shared/types/mcp'
import { getKnowledgeServiceManager } from './KnowledgeServiceManager'
import { getFileService } from '@main/services/file/FileService'

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
 */
export class KnowledgeToolService {
  /**
   * 获取知识库工具定义
   * @param selectedKnowledgeBaseIds 选中的知识库 ID 列表，如果指定则只搜索这些知识库
   */
  getTools(selectedKnowledgeBaseIds?: string[]): MCPTool[] {
    // 获取可用知识库信息用于工具描述
    const knowledgeManager = getKnowledgeServiceManager()
    const allKnowledgeBases = knowledgeManager.getAllKnowledgeBases()

    // 确定可用的知识库
    let availableKnowledgeBases = allKnowledgeBases
    if (selectedKnowledgeBaseIds && selectedKnowledgeBaseIds.length > 0) {
      availableKnowledgeBases = allKnowledgeBases.filter((kb) =>
        selectedKnowledgeBaseIds.includes(kb.id)
      )
    }

    const kbDescription =
      availableKnowledgeBases.length > 0
        ? `当前可用的知识库: ${availableKnowledgeBases.map((kb) => `"${kb.name}"(${kb.id})`).join(', ')}`
        : '当前没有可用的知识库'

    return [
      {
        name: 'knowledge__search',
        description: `在知识库中搜索相关内容。${kbDescription}。当用户问题需要参考知识库中的特定信息时使用此工具。使用精确的搜索词可以获得更好的结果。`,
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
          return this.listKnowledgeBases(selectedKnowledgeBaseIds)
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

  // ==================== 工具实现 ====================

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

    const knowledgeManager = getKnowledgeServiceManager()

    // 确定要搜索的知识库
    let targetKbIds: string[] = []

    if (knowledgeBaseId) {
      // 如果指定了特定知识库，只搜索该知识库
      // 但需要验证是否在选中的知识库范围内
      if (selectedKnowledgeBaseIds && selectedKnowledgeBaseIds.length > 0) {
        if (!selectedKnowledgeBaseIds.includes(knowledgeBaseId)) {
          return {
            success: false,
            error: `知识库 ${knowledgeBaseId} 不在当前可用的知识库范围内`
          }
        }
      }
      targetKbIds = [knowledgeBaseId]
    } else {
      // 未指定知识库，搜索所有可用知识库
      if (selectedKnowledgeBaseIds && selectedKnowledgeBaseIds.length > 0) {
        targetKbIds = selectedKnowledgeBaseIds
      } else {
        // 没有选中的知识库，获取所有知识库
        const allKbs = knowledgeManager.getAllKnowledgeBases()
        targetKbIds = allKbs.map((kb) => kb.id)
      }
    }

    if (targetKbIds.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '没有可用的知识库进行搜索。请确保已创建并索引了知识库。'
          }
        ]
      }
    }

    // 执行搜索
    const allResults: Array<{
      knowledgeBaseId: string
      knowledgeBaseName: string
      results: Array<{
        fileName: string
        content: string
        similarity: number
      }>
    }> = []

    for (const kbId of targetKbIds) {
      const kbData = knowledgeManager.getKnowledgeBaseById(kbId)
      if (!kbData) {
        logger.warn('知识库不存在', 'main', { kbId })
        continue
      }

      const service = knowledgeManager.getOrCreateInstance(kbId, kbData)
      const searchResult = await service.search(kbId, query, limit)

      if (searchResult.success && searchResult.data) {
        allResults.push({
          knowledgeBaseId: kbId,
          knowledgeBaseName: kbData.name,
          results: searchResult.data.results.map((r) => ({
            fileName: r.fileName,
            content: r.content,
            similarity: r.similarity
          }))
        })
      }
    }

    // 格式化结果
    if (allResults.length === 0 || allResults.every((r) => r.results.length === 0)) {
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

    for (const kbResult of allResults) {
      resultText += `## 知识库: ${kbResult.knowledgeBaseName}\n\n`

      for (const item of kbResult.results) {
        resultText += `### 文档: ${item.fileName}\n`
        resultText += `**相关度: ${(item.similarity * 100).toFixed(1)}%**\n\n`
        resultText += `${item.content}\n\n---\n\n`
      }
    }

    resultText += `\n共找到 ${allResults.reduce((sum, r) => sum + r.results.length, 0)} 条相关内容。`

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
  private listKnowledgeBases(selectedKnowledgeBaseIds?: string[]): MCPToolCallResult {
    const knowledgeManager = getKnowledgeServiceManager()

    // 确定要列出的知识库
    let knowledgeBases = knowledgeManager.getAllKnowledgeBases()

    if (selectedKnowledgeBaseIds && selectedKnowledgeBaseIds.length > 0) {
      // 只列出选中的知识库
      knowledgeBases = knowledgeBases.filter((kb) => selectedKnowledgeBaseIds.includes(kb.id))
    }

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

    const formatted = knowledgeBases.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description || '无描述',
      documentCount: kb.linkedFileIds?.length || 0,
      createdAt: kb.createdAt,
      embeddingModel: kb.embeddingConfig.model
    }))

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `找到 ${formatted.length} 个知识库:\n\n${JSON.stringify(formatted, null, 2)}`
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

    // 验证知识库是否在可用范围内
    if (selectedKnowledgeBaseIds && selectedKnowledgeBaseIds.length > 0) {
      if (!selectedKnowledgeBaseIds.includes(knowledgeBaseId)) {
        return {
          success: false,
          error: `知识库 ${knowledgeBaseId} 不在当前可用的知识库范围内`
        }
      }
    }

    const knowledgeManager = getKnowledgeServiceManager()
    const kbData = knowledgeManager.getKnowledgeBaseById(knowledgeBaseId)

    if (!kbData) {
      return {
        success: false,
        error: `知识库不存在: ${knowledgeBaseId}`
      }
    }

    // 获取关联的文件 ID 列表
    const linkedFileIds = kbData.linkedFileIds || []

    // 获取文件服务并查询文件详细信息
    const fileService = getFileService()
    const documents: Array<{
      documentName: string
      size: string
      sizeBytes: number
      uploadTime: string
      documentType: string
    }> = []

    for (const fileId of linkedFileIds) {
      const fileInfo = fileService.getFileById(fileId)
      if (fileInfo) {
        // 格式化文件大小
        const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(1)
        documents.push({
          documentName: fileInfo.name,
          size: `${sizeMB} MB`,
          sizeBytes: fileInfo.size,
          uploadTime: fileInfo.uploadedAt,
          documentType: fileInfo.fileType
        })
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
