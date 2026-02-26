import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { logger } from '@main/services/logger'
import { getKnowledgeServiceManager } from './KnowledgeServiceManager'
import type {
  KnowledgeMCPConfig,
  KnowledgeMCPServerStatus,
  KnowledgeSearchResult,
  KnowledgeBaseListItem
} from '@shared/types/knowledgeMCP'
import { DEFAULT_KNOWLEDGE_MCP_CONFIG } from '@shared/types/knowledgeMCP'

/**
 * 知识库 MCP 服务器服务
 * 负责创建和管理 MCP Server 实例，将知识库能力通过 MCP 协议对外暴露
 */
export class KnowledgeMCPServerService {
  private mcpServer: McpServer | null = null
  private httpServer: Server | null = null
  private transport: StreamableHTTPServerTransport | null = null
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
        'sparrow-knowledge': {
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
    if (this.httpServer !== null) {
      logger.warn('知识库 MCP 服务已在运行中', 'main')
      return { success: true }
    }

    try {
      logger.info('正在启动知识库 MCP 服务...', 'main', { port: this.config.port })

      // 刷新本机 IP
      this.localIP = this.getLocalIP()

      // 创建 MCP Server，声明 capabilities
      this.mcpServer = new McpServer(
        {
          name: 'sparrow-knowledge-server',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      )

      // 注册工具
      this.registerTools()

      // 创建传输层（有状态模式，生成 session ID）
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID()
      })

      // 连接传输层
      await this.mcpServer.connect(this.transport)

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

        if (this.transport) {
          try {
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

            await this.transport.handleRequest(req, res, parsedBody)
          } catch (error) {
            logger.error('处理 MCP 请求失败', 'main', {
              error: error instanceof Error ? error.message : String(error)
            })
            if (!res.headersSent) {
              res.statusCode = 500
              res.end('Internal Server Error')
            }
          }
        } else {
          res.statusCode = 503
          res.end('Service Unavailable')
        }
      })

      // 监听端口
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.port, () => {
          logger.info(`知识库 MCP 服务已启动，监听端口 ${this.config.port}`, 'main')
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

    // 关闭 MCP Server
    if (this.mcpServer) {
      try {
        await this.mcpServer.close()
      } catch (error) {
        logger.warn('关闭 MCP Server 时出错', 'main', { error })
      }
      this.mcpServer = null
    }

    this.transport = null
  }

  /**
   * 注册 MCP 工具
   */
  private registerTools(): void {
    if (!this.mcpServer) return

    // 注册知识库搜索工具
    this.mcpServer.registerTool(
      'knowledge_search',
      {
        description:
          '在知识库中搜索相关内容。使用向量相似度搜索，返回最相关的文档片段。可以指定特定知识库搜索，也可以搜索所有知识库。',
        inputSchema: {
          query: z.string().describe('搜索查询文本'),
          knowledgeBaseId: z.string().optional().describe('知识库ID（可选，不指定则搜索所有知识库）'),
          limit: z.number().optional().describe('返回结果数量限制（默认5）')
        }
      },
      async (args: { query: string; knowledgeBaseId?: string; limit?: number }) => {
        try {
          const results = await this.searchKnowledge(args.query, args.knowledgeBaseId, args.limit || 5)
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
    this.mcpServer.registerTool(
      'knowledge_list',
      {
        description: '获取所有可用的知识库列表及其基本信息，包括知识库名称、描述、文档数量等。',
        inputSchema: {}
      },
      async () => {
        try {
          const knowledgeBases = this.listKnowledgeBases()
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

    logger.info('MCP 工具已注册', 'main', { tools: ['knowledge_search', 'knowledge_list'] })
  }

  /**
   * 搜索知识库
   */
  private async searchKnowledge(
    query: string,
    knowledgeBaseId?: string,
    limit: number = 5
  ): Promise<KnowledgeSearchResult[]> {
    const manager = getKnowledgeServiceManager()
    const allKBs = manager.getAllKnowledgeBases()
    const results: KnowledgeSearchResult[] = []

    // 确定要搜索的知识库
    const targetKBs = knowledgeBaseId
      ? allKBs.filter((kb) => kb.id === knowledgeBaseId)
      : allKBs

    if (targetKBs.length === 0) {
      return []
    }

    // 搜索每个知识库
    for (const kb of targetKBs) {
      try {
        const service = manager.getOrCreateInstance(kb.id, kb)
        const searchResult = await service.search(kb.id, query, limit)

        if (searchResult.success && searchResult.data) {
          for (const result of searchResult.data.results) {
            results.push({
              knowledgeBaseName: kb.name,
              knowledgeBaseId: kb.id,
              fileName: result.fileName,
              content: result.content,
              score: result.similarity,
              chunkIndex: result.chunkIndex
            })
          }
        }
      } catch (error) {
        logger.warn('搜索知识库失败', 'main', { kbId: kb.id, error })
      }
    }

    // 按相似度排序并限制结果数量
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  /**
   * 获取知识库列表
   */
  private listKnowledgeBases(): KnowledgeBaseListItem[] {
    const manager = getKnowledgeServiceManager()
    const allKBs = manager.getAllKnowledgeBases()

    return allKBs.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb.linkedFileIds?.length || 0,
      createdAt: kb.createdAt
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
