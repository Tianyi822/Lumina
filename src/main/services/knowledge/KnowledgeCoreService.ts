import { logger } from '@main/services/logger'
import { getKnowledgeServiceManager } from './KnowledgeServiceManager'
import { getFileService } from '@main/services/file/FileService'
import type { KnowledgeBase } from '@shared/types/knowledge'

/**
 * 知识库搜索结果项
 */
export interface KnowledgeSearchItem {
  knowledgeBaseId: string
  knowledgeBaseName: string
  fileName: string
  content: string
  similarity: number
  chunkIndex?: number
}

/**
 * 知识库搜索结果
 */
export interface KnowledgeSearchResult {
  query: string
  items: KnowledgeSearchItem[]
  totalCount: number
}

/**
 * 知识库列表项
 */
export interface KnowledgeBaseItem {
  id: string
  name: string
  description: string
  documentCount: number
  createdAt: string
  embeddingModel: string
}

/**
 * 文档列表项
 */
export interface DocumentItem {
  documentName: string
  size: string
  sizeBytes: number
  uploadTime: string
  documentType: string
}

/**
 * 搜索知识库参数
 */
export interface SearchKnowledgeParams {
  query: string
  knowledgeBaseId?: string
  limit?: number
  /** 可选：限制在指定的知识库 ID 列表范围内 */
  allowedKnowledgeBaseIds?: string[]
}

/**
 * 获取文档列表参数
 */
export interface GetDocumentsParams {
  knowledgeBaseId: string
  /** 可选：限制在指定的知识库 ID 列表范围内 */
  allowedKnowledgeBaseIds?: string[]
}

/**
 * 获取知识库列表参数
 */
export interface GetKnowledgeBasesParams {
  /** 可选：只返回指定的知识库 ID 列表 */
  knowledgeBaseIds?: string[]
}

/**
 * 知识库核心服务
 * 提供知识库操作的核心业务逻辑
 * 被 KnowledgeToolService（聊天工具）和 KnowledgeMCPServerService（MCP 服务）共同使用
 */
export class KnowledgeCoreService {
  /**
   * 搜索知识库
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async searchKnowledge(params: SearchKnowledgeParams): Promise<KnowledgeSearchResult> {
    const { query, knowledgeBaseId, limit = 5, allowedKnowledgeBaseIds } = params

    if (!query) {
      return {
        query: '',
        items: [],
        totalCount: 0
      }
    }

    const knowledgeManager = getKnowledgeServiceManager()

    // 确定要搜索的知识库
    let targetKBs: KnowledgeBase[] = []
    const allKBs = await knowledgeManager.getAllKnowledgeBases()

    if (knowledgeBaseId) {
      // 如果指定了特定知识库
      // 验证是否在允许的范围内
      if (allowedKnowledgeBaseIds && allowedKnowledgeBaseIds.length > 0) {
        if (!allowedKnowledgeBaseIds.includes(knowledgeBaseId)) {
          logger.warn('知识库不在允许范围内', 'main', {
            knowledgeBaseId,
            allowedKnowledgeBaseIds
          })
          return {
            query,
            items: [],
            totalCount: 0
          }
        }
      }
      // 查找指定的知识库
      const kb = allKBs.find((kb) => kb.id === knowledgeBaseId)
      if (kb) {
        targetKBs = [kb]
      }
    } else {
      // 未指定知识库，搜索所有可用的知识库
      if (allowedKnowledgeBaseIds && allowedKnowledgeBaseIds.length > 0) {
        targetKBs = allKBs.filter((kb) => allowedKnowledgeBaseIds.includes(kb.id))
      } else {
        targetKBs = allKBs
      }
    }

    if (targetKBs.length === 0) {
      return {
        query,
        items: [],
        totalCount: 0
      }
    }

    // 执行搜索
    const allItems: KnowledgeSearchItem[] = []

    for (const kb of targetKBs) {
      try {
        const service = knowledgeManager.getOrCreateInstance(kb.id, kb)
        const searchResult = await service.search(kb.id, query, limit)

        if (searchResult.success && searchResult.data) {
          for (const result of searchResult.data.results) {
            allItems.push({
              knowledgeBaseId: kb.id,
              knowledgeBaseName: kb.name,
              fileName: result.fileName,
              content: result.content,
              similarity: result.similarity,
              chunkIndex: result.chunkIndex
            })
          }
        }
      } catch (error) {
        logger.warn('搜索知识库失败', 'main', {
          kbId: kb.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // 按相似度排序并限制结果数量
    allItems.sort((a, b) => b.similarity - a.similarity)
    const limitedItems = allItems.slice(0, limit)

    return {
      query,
      items: limitedItems,
      totalCount: limitedItems.length
    }
  }

  /**
   * 获取知识库列表
   * @param params 参数
   * @returns 知识库列表
   */
  async getKnowledgeBases(params: GetKnowledgeBasesParams = {}): Promise<KnowledgeBaseItem[]> {
    const { knowledgeBaseIds } = params
    const knowledgeManager = getKnowledgeServiceManager()
    let knowledgeBases = await knowledgeManager.getAllKnowledgeBases()

    // 如果指定了知识库 ID 列表，则只返回这些知识库
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      knowledgeBases = knowledgeBases.filter((kb) => knowledgeBaseIds.includes(kb.id))
    }

    return knowledgeBases.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description || '无描述',
      documentCount: kb.linkedFileIds?.length || 0,
      createdAt: kb.createdAt,
      embeddingModel: kb.embeddingConfig.displayName || kb.embeddingConfig.model
    }))
  }

  /**
   * 获取知识库中的文档列表
   * @param params 参数
   * @returns 文档列表，如果知识库不存在或不在允许范围内则返回 null
   */
  async getDocuments(params: GetDocumentsParams): Promise<DocumentItem[] | null> {
    const { knowledgeBaseId, allowedKnowledgeBaseIds } = params

    // 验证知识库是否在允许的范围内
    if (allowedKnowledgeBaseIds && allowedKnowledgeBaseIds.length > 0) {
      if (!allowedKnowledgeBaseIds.includes(knowledgeBaseId)) {
        logger.warn('知识库不在允许范围内', 'main', {
          knowledgeBaseId,
          allowedKnowledgeBaseIds
        })
        return null
      }
    }

    const knowledgeManager = getKnowledgeServiceManager()
    const kbData = await knowledgeManager.getKnowledgeBaseById(knowledgeBaseId)

    if (!kbData) {
      logger.warn('知识库不存在', 'main', { knowledgeBaseId })
      return null
    }

    // 获取关联的文件 ID 列表
    const linkedFileIds = kbData.linkedFileIds || []

    // 获取文件服务并查询文件详细信息
    const fileService = getFileService()
    const documents: DocumentItem[] = []

    for (const fileId of linkedFileIds) {
      const fileInfo = fileService.getFileById(fileId)
      if (fileInfo) {
        documents.push({
          documentName: fileInfo.name,
          size: this.formatFileSize(fileInfo.size),
          sizeBytes: fileInfo.size,
          uploadTime: fileInfo.uploadedAt,
          documentType: fileInfo.fileType
        })
      }
    }

    return documents
  }

  /**
   * 格式化文件大小
   * 将字节转换为易读的格式
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  /**
   * 根据知识库 ID 获取知识库信息
   * @param knowledgeBaseId 知识库 ID
   * @returns 知识库信息，不存在则返回 null
   */
  async getKnowledgeBaseById(knowledgeBaseId: string): Promise<KnowledgeBaseItem | null> {
    const knowledgeManager = getKnowledgeServiceManager()
    const kb = await knowledgeManager.getKnowledgeBaseById(knowledgeBaseId)

    if (!kb) {
      return null
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description || '无描述',
      documentCount: kb.linkedFileIds?.length || 0,
      createdAt: kb.createdAt,
      embeddingModel: kb.embeddingConfig.displayName || kb.embeddingConfig.model
    }
  }

  /**
   * 检查知识库是否存在
   * @param knowledgeBaseId 知识库 ID
   * @returns 是否存在
   */
  async knowledgeBaseExists(knowledgeBaseId: string): Promise<boolean> {
    const knowledgeManager = getKnowledgeServiceManager()
    return (await knowledgeManager.getKnowledgeBaseById(knowledgeBaseId)) !== null
  }
}

/**
 * 知识库核心服务单例
 */
export const knowledgeCoreService = new KnowledgeCoreService()
