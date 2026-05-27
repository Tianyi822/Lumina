import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { logger } from '@main/services/logger'
import { knowledgeCoreService } from './KnowledgeCoreService'
import type {
  KnowledgeMCPConfig,
  KnowledgeMCPServerStatus,
  KnowledgeSearchResult,
  KnowledgeBaseListItem,
  KnowledgeDocumentListItem
} from '@shared/types/knowledgeMCP'
import { DEFAULT_KNOWLEDGE_MCP_CONFIG } from '@shared/types/knowledgeMCP'

/**
 * 知识库 MCP 服务器服务
 * 负责创建和管理 MCP Server 实例，将知识库能力通过 MCP 协议对外暴露
 *
 * 架构说明：
 * - 使用无状态模式，每个 HTTP 请求使用独立的 transport 实例
 * - 这样可以支持多个客户端同时连接，以及断开后重新连接
 */
export class KnowledgeMCPServerService {
  private httpServer: Server | null = null
  private config: KnowledgeMCPConfig = { ...DEFAULT_KNOWLEDGE_MCP_CONFIG }
  private localIP: string = '127.0.0.1'

  constructor() {
    this.localIP = this.getLocalIP()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<KnowledgeMCPConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('知识库 MCP 配置已更新', 'main', { config: this.config })
  }

  /**
   * 获取当前配置
   */
  getConfig(): KnowledgeMCPConfig {
    return { ...this.config }
  }

  /**
   * 获取本机 IP 地址
   * 优先返回 IPv4 地址，如果找不到则返回 127.0.0.1
   */
  getLocalIP(): string {
    const nets = networkInterfaces()

    // 优先返回 IPv4 地址
    for (const name of Object.keys(nets)) {
      const netInfo = nets[name]
      if (!netInfo) continue

      for (const net of netInfo) {
        // 跳过内部和非 IPv4 地址
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }

    // 回退到 localhost
    return '127.0.0.1'
  }

  /**
   * 获取服务状态
   */
  getStatus(): KnowledgeMCPServerStatus {
    return {
      running: this.httpServer !== null,
      port: this.config.port,
      localIP: this.localIP,
      url: `http://${this.localIP}:${this.config.port}/mcp`,
      error: undefined
    }
  }

  /**
   * 获取 MCP 客户端配置 JSON
   * 生成符合标准 MCP 配置文件格式的 JSON
   */
  getMCPConfigJSON(): string {
    const status = this.getStatus()
    // 使用标准 MCP 配置格式
    const config = {
      mcpServers: {
        'lumina-knowledge': {
          type: 'streamableHttp',
          url: status.url
        }
      }
    }
    return JSON.stringify(config, null, 2)
  }

  /**
   * 启动 MCP 服务
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    // 如果服务已在运行，直接返回成功
    if (this.httpServer !== null) {
      logger.warn('知识库 MCP 服务已在运行中', 'main')
      return { success: true }
    }

    try {
      logger.info('正在启动知识库 MCP 服务...', 'main', { port: this.config.port })

      // 刷新本机 IP
      this.localIP = this.getLocalIP()

      // 创建 HTTP 服务器，添加 CORS 支持
      this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // 添加 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

        // 处理预检请求
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        try {
          // 为每个请求创建新的 MCP Server 和 Transport（无状态模式）
          // 这样可以支持多个客户端同时连接，以及断开后重新连接
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined // 无状态模式
          })

          const mcpServer = new McpServer(
            {
              name: 'lumina-knowledge-server',
              version: '1.0.0'
            },
            {
              capabilities: {
                tools: {}
              }
            }
          )

          // 注册工具
          this.registerToolsForServer(mcpServer)

          // 连接传输层
          await mcpServer.connect(transport)

          // 读取并解析请求体
          let body = ''
          for await (const chunk of req) {
            body += chunk.toString()
          }

          let parsedBody: unknown = undefined
          if (body) {
            try {
              parsedBody = JSON.parse(body)
            } catch {
              // 忽略解析错误，让 transport 处理
            }
          }

          // 处理请求
          await transport.handleRequest(req, res, parsedBody)
        } catch (error) {
          logger.error('处理 MCP 请求失败', 'main', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          })
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        }
      })

      // 监听端口
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.port, () => {
          logger.info(`知识库 MCP 服务已启动，监听端口 ${this.config.port}`, 'main', {
            url: `http://${this.localIP}:${this.config.port}/mcp`,
            tools: ['knowledge_search', 'knowledge_list', 'knowledge_documents'],
            mode: 'stateless'
          })
          resolve()
        })
        this.httpServer!.on('error', (err: Error) => {
          logger.error('知识库 MCP 服务启动失败', 'main', { error: err.message })
          reject(err)
        })
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('启动知识库 MCP 服务失败', 'main', { error: errorMessage })

      // 清理资源
      await this.cleanup()

      return { success: false, error: errorMessage }
    }
  }

  /**
   * 停止 MCP 服务
   */
  async stop(): Promise<void> {
    logger.info('正在停止知识库 MCP 服务...', 'main')
    await this.cleanup()
    logger.info('知识库 MCP 服务已停止', 'main')
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    // 关闭 HTTP 服务器
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = null
    }
  }

  /**
   * 注册 MCP 工具
   * @param mcpServer 要注册工具的 MCP Server 实例
   */
  private registerToolsForServer(mcpServer: McpServer): void {
    // 注册知识库搜索工具
    mcpServer.registerTool(
      'knowledge_search',
      {
        description:
          '在知识库中搜索相关内容。使用向量相似度搜索，返回最相关的文档片段。可以指定特定知识库搜索，也可以搜索所有知识库。',
        inputSchema: {
          query: z.string().describe('搜索查询文本'),
          knowledgeBaseId: z
            .string()
            .optional()
            .describe('知识库ID（可选，不指定则搜索所有知识库）'),
          limit: z.number().optional().describe('返回结果数量限制（默认5）')
        }
      },
      async (args: { query: string; knowledgeBaseId?: string; limit?: number }) => {
        try {
          const results = await this.searchKnowledge(
            args.query,
            args.knowledgeBaseId,
            args.limit || 5
          )
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(results, null, 2)
              }
            ]
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: errorMessage })
              }
            ],
            isError: true
          }
        }
      }
    )

    // 注册知识库列表工具
    mcpServer.registerTool(
      'knowledge_list',
      {
        description: '获取所有可用的知识库列表及其基本信息，包括知识库名称、描述、文档数量等。',
        inputSchema: {}
      },
      async () => {
        try {
          const knowledgeBases = await this.listKnowledgeBases()
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(knowledgeBases, null, 2)
              }
            ]
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: errorMessage })
              }
            ],
            isError: true
          }
        }
      }
    )

    // 注册知识库文档列表工具
    mcpServer.registerTool(
      'knowledge_documents',
      {
        description: '获取指定知识库中所有文档的详细信息，包括文档名称、大小、上传时间和文档类型。',
        inputSchema: {
          knowledgeBaseId: z.string().describe('知识库ID')
        }
      },
      async (args: { knowledgeBaseId: string }) => {
        try {
          const documents = await this.getDocumentsByKnowledgeBase(args.knowledgeBaseId)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(documents, null, 2)
              }
            ]
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: errorMessage })
              }
            ],
            isError: true
          }
        }
      }
    )

    logger.debug('MCP 工具已注册', 'main', {
      tools: ['knowledge_search', 'knowledge_list', 'knowledge_documents']
    })
  }

  /**
   * 搜索知识库
   * 调用核心服务实现
   */
  private async searchKnowledge(
    query: string,
    knowledgeBaseId?: string,
    limit: number = 5
  ): Promise<KnowledgeSearchResult[]> {
    // 调用核心服务执行搜索
    const result = await knowledgeCoreService.searchKnowledge({
      query,
      knowledgeBaseId,
      limit
    })

    // 转换为 MCP 服务返回格式
    return result.items.map((item) => ({
      knowledgeBaseName: item.knowledgeBaseName,
      knowledgeBaseId: item.knowledgeBaseId,
      fileName: item.fileName,
      content: item.content,
      score: item.similarity,
      chunkIndex: item.chunkIndex
    }))
  }

  /**
   * 获取知识库列表
   * 调用核心服务实现
   */
  private async listKnowledgeBases(): Promise<KnowledgeBaseListItem[]> {
    // 调用核心服务获取知识库列表
    const knowledgeBases = await knowledgeCoreService.getKnowledgeBases()

    return knowledgeBases.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb.documentCount,
      createdAt: kb.createdAt
    }))
  }

  /**
   * 获取指定知识库中的文档列表
   * 调用核心服务实现
   * @param knowledgeBaseId 知识库 ID
   * @returns 文档列表，包含文档名称、大小、上传时间和类型
   */
  private async getDocumentsByKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeDocumentListItem[]> {
    // 调用核心服务获取文档列表
    const documents = await knowledgeCoreService.getDocuments({ knowledgeBaseId })

    if (documents === null) {
      return []
    }

    return documents.map((doc) => ({
      documentName: doc.documentName,
      size: doc.size,
      sizeBytes: doc.sizeBytes,
      uploadTime: doc.uploadTime,
      documentType: doc.documentType
    }))
  }
}

// 单例实例
let knowledgeMCPServerServiceInstance: KnowledgeMCPServerService | null = null

/**
 * 获取知识库 MCP 服务器服务单例
 */
export function getKnowledgeMCPServerService(): KnowledgeMCPServerService {
  if (!knowledgeMCPServerServiceInstance) {
    knowledgeMCPServerServiceInstance = new KnowledgeMCPServerService()
    logger.info('知识库 MCP 服务器服务已初始化', 'main')
  }
  return knowledgeMCPServerServiceInstance
}
