import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { Int32, Int64, Utf8, Schema, Field, FixedSizeList, Float32 } from 'apache-arrow'
import type { Connection, Table } from '@lancedb/lancedb'

import { logger } from '@main/services/logger'
import { getVectorDBDirPath } from '@main/services/knowledge/knowledgePaths'

// 文档块数据结构
export interface DocumentChunk {
  id?: number
  fileId: string
  fileName: string
  content: string
  chunkIndex: number
  totalChunks: number
}

// 搜索结果
export interface SearchResult {
  chunkId: number
  fileId: string
  fileName: string
  content: string
  chunkIndex: number
  totalChunks: number
  similarity: number
}

// 向量记录（数据库存储格式）
interface VectorRecord extends Record<string, unknown> {
  chunk_id: number
  file_id: string
  file_name: string
  content: string
  chunk_index: number
  total_chunks: number
  embedding: number[]
}

type LanceDBModule = typeof import('@lancedb/lancedb')

let lancedbModule: LanceDBModule | null = null

/**
 * 获取 LanceDB 原生模块
 * 延迟加载以避免模块未安装时直接报错
 * @throws 加载失败时抛出错误提示安装问题
 */
function getLanceDB(): LanceDBModule {
  if (lancedbModule) {
    return lancedbModule
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lancedbModule = require('@lancedb/lancedb') as LanceDBModule
    return lancedbModule
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('LanceDB 原生模块加载失败', 'main', { error: errorMessage })
    throw new Error(`LanceDB 原生模块加载失败，请确认安装包包含当前系统架构的依赖: ${errorMessage}`)
  }
}

/**
 * 向量数据库服务
 * 使用 LanceDB 为每个知识库管理独立的向量数据库
 * 支持文档块添加、删除、相似性搜索等功能
 */
export class VectorDBService {
  private dbConnections: Map<string, Connection> = new Map()
  private tables: Map<string, Table> = new Map()
  private indexedTables: Set<string> = new Set()

  /**
   * 确保向量数据库数据目录存在
   */
  private ensureDataDir(): void {
    const dataDir = getVectorDBDirPath()
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
      logger.info('创建向量数据库目录', 'main', { path: dataDir })
    }
  }

  /**
   * 获取指定知识库的数据库路径
   * LanceDB 使用目录作为数据库
   */
  private getDatabasePath(kbId: string): string {
    this.ensureDataDir()
    const dataDir = getVectorDBDirPath()
    // LanceDB 使用目录作为数据库，使用简单路径而非 file:// 协议
    return join(dataDir, kbId)
  }

  /**
   * 获取或创建知识库的数据库连接
   * 连接会被缓存，同一知识库复用同一连接
   */
  private async getConnection(kbId: string): Promise<Connection> {
    if (this.dbConnections.has(kbId)) {
      return this.dbConnections.get(kbId)!
    }

    const dbPath = this.getDatabasePath(kbId)
    const db = await getLanceDB().connect(dbPath)

    this.dbConnections.set(kbId, db)
    logger.info('LanceDB 连接已建立', 'main', { kbId, path: dbPath })

    return db
  }

  // 添加文档块及其向量
  // 将文档块和对应的嵌入向量存储到数据库中
  // 如果表不存在则创建表，如果表存在则追加数据
  async addChunks(
    kbId: string,
    dimension: number,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error('文档块数量和向量数量不匹配')
    }

    logger.info('addChunks 开始', 'main', {
      kbId,
      dimension,
      chunkCount: chunks.length
    })

    // 构建记录 - 使用唯一 ID 避免冲突
    const baseId = Date.now()
    const records: VectorRecord[] = chunks.map((chunk, index) => ({
      chunk_id: baseId + index,
      file_id: chunk.fileId,
      file_name: chunk.fileName,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      total_chunks: chunk.totalChunks,
      embedding: embeddings[index]
    }))

    const tableKey = `${kbId}_chunks`

    try {
      const db = await this.getConnection(kbId)

      // 尝试打开现有表
      let table: Table | undefined
      let isNewTable = false

      try {
        table = await db.openTable('chunks')
      } catch {
        // 表不存在，将创建新表
      }

      if (!table) {
        // 创建新表并添加数据，显式定义 schema
        const embeddingMetadata = new Map<string, string>()
        embeddingMetadata.set('metric_type', 'cosine')

        const schema = new Schema([
          new Field('chunk_id', new Int64()),
          new Field('file_id', new Utf8()),
          new Field('file_name', new Utf8()),
          new Field('content', new Utf8()),
          new Field('chunk_index', new Int32()),
          new Field('total_chunks', new Int32()),
          new Field(
            'embedding',
            new FixedSizeList(dimension, new Field('item', new Float32(), true)),
            false,
            embeddingMetadata
          )
        ])

        table = await db.createTable('chunks', records, { schema })
        isNewTable = true
        this.tables.set(tableKey, table)
        logger.info('新表已创建并添加数据', 'main', { kbId, count: records.length })
      } else {
        // 表已存在，添加数据
        await table.add(records)
        this.tables.set(tableKey, table)
        logger.info('数据已添加到现有表', 'main', { kbId, count: records.length })
      }

      // 创建索引（如果是新表或首次添加数据）
      if (!this.indexedTables.has(tableKey)) {
        await this.createVectorIndex(table, kbId, tableKey)
      }

      // 验证数据是否写入
      const rowCount = await table.countRows()
      logger.info('addChunks 完成', 'main', { kbId, rowCount, isNewTable })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('添加文档块失败', 'main', { kbId, error: errorMessage })
      throw new Error(`添加文档块失败: ${errorMessage}`)
    }
  }

  /**
   * 创建向量索引
   * 使用 IVF_PQ 索引提高搜索性能
   * 如果表为空或索引已存在则跳过
   */
  private async createVectorIndex(table: Table, kbId: string, tableKey: string): Promise<void> {
    try {
      const rowCount = await table.countRows()

      if (rowCount === 0) {
        return
      }

      // 创建 IVF_PQ 索引
      await table.createIndex('embedding', {
        config: getLanceDB().Index.ivfPq({
          distanceType: 'cosine'
        })
      })

      this.indexedTables.add(tableKey)
      logger.info('向量索引已创建', 'main', { kbId })
    } catch (error) {
      logger.warn('创建索引失败（可能已存在）', 'main', { kbId, error })
      // 标记为已索引，避免重复尝试
      this.indexedTables.add(tableKey)
    }
  }

  /**
   * 删除指定文件的所有文档块
   * @param kbId 知识库 ID
   * @param fileId 文件 ID
   */
  async deleteFileChunks(kbId: string, fileId: string): Promise<void> {
    try {
      if (!this.exists(kbId)) {
        return
      }

      const db = await this.getConnection(kbId)
      let table: Table

      try {
        table = await db.openTable('chunks')
      } catch {
        return
      }

      await table.delete(`file_id = '${fileId}'`)
      logger.info('文件文档块已删除', 'main', { kbId, fileId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除文件文档块失败', 'main', { kbId, fileId, error: errorMessage })
      throw new Error(`删除文件文档块失败: ${errorMessage}`)
    }
  }

  // 相似性搜索
  // 使用查询向量在数据库中搜索最相似的文档块
  async search(kbId: string, queryEmbedding: number[], limit: number = 5): Promise<SearchResult[]> {
    try {
      if (!this.exists(kbId)) {
        return []
      }

      const db = await this.getConnection(kbId)
      let table: Table

      try {
        table = await db.openTable('chunks')
      } catch {
        return []
      }

      const results = await table.query().nearestTo(queryEmbedding).limit(limit).toArray()

      return results.map((r) => {
        const distance = r._distance as number
        const similarity = 1 - distance

        return {
          chunkId: r.chunk_id as number,
          fileId: r.file_id as string,
          fileName: r.file_name as string,
          content: r.content as string,
          chunkIndex: r.chunk_index as number,
          totalChunks: r.total_chunks as number,
          similarity
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('向量搜索失败', 'main', { kbId, error: errorMessage })
      throw new Error(`向量搜索失败: ${errorMessage}`)
    }
  }

  // 获取知识库的文档统计信息
  // 返回文件数量和文档块数量
  async getStats(kbId: string): Promise<{ fileCount: number; chunkCount: number }> {
    try {
      if (!this.exists(kbId)) {
        return { fileCount: 0, chunkCount: 0 }
      }

      const db = await this.getConnection(kbId)
      let table: Table

      try {
        table = await db.openTable('chunks')
      } catch {
        return { fileCount: 0, chunkCount: 0 }
      }

      const chunkCount = await table.countRows()

      // 采样查询获取文件级统计（最多 10000 条记录覆盖所有文件）
      let uniqueFileIds = new Set<string>()
      if (chunkCount > 0) {
        const files = await table.query().limit(10000).toArray()
        uniqueFileIds = new Set(files.map((r) => r.file_id as string))
      }

      return {
        fileCount: uniqueFileIds.size,
        chunkCount
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取统计信息失败', 'main', { kbId, error: errorMessage })
      return { fileCount: 0, chunkCount: 0 }
    }
  }

  /**
   * 删除整个知识库的向量数据库
   * 关闭连接并删除所有相关文件
   * @param kbId 知识库 ID
   */
  deleteKnowledgeBase(kbId: string): void {
    const tableKey = `${kbId}_chunks`

    // 关闭并清除缓存的连接
    const conn = this.dbConnections.get(kbId)
    if (conn) {
      try {
        conn.close()
      } catch (error) {
        logger.debug('关闭数据库连接时出错', 'main', { kbId, error })
      }
    }

    // 关闭并清除缓存的表
    const table = this.tables.get(tableKey)
    if (table) {
      try {
        table.close()
      } catch (error) {
        logger.debug('关闭表时出错', 'main', { kbId, error })
      }
    }

    // 清除缓存
    this.tables.delete(tableKey)
    this.indexedTables.delete(tableKey)
    this.dbConnections.delete(kbId)

    const dataDir = getVectorDBDirPath()

    // 删除数据库目录
    const dbPath = join(dataDir, kbId)
    if (existsSync(dbPath)) {
      try {
        rmSync(dbPath, { recursive: true, force: true })
        logger.info('知识库向量数据库已删除', 'main', { kbId, path: dbPath })
      } catch (error) {
        logger.error('删除知识库向量数据库失败', 'main', { kbId, path: dbPath, error })
      }
    }

    // 同时删除 LanceDB 目录格式的旧版本 `.db` 文件（兼容旧版本迁移）
    const oldDbPath = join(dataDir, `${kbId}.db`)
    if (existsSync(oldDbPath)) {
      try {
        rmSync(oldDbPath, { recursive: true, force: true })
        logger.info('旧格式知识库向量数据库已删除', 'main', { kbId, path: oldDbPath })
      } catch (error) {
        logger.error('删除旧格式知识库向量数据库失败', 'main', { kbId, path: oldDbPath, error })
      }
    }
  }

  /**
   * 检查知识库数据库是否存在
   * @param kbId 知识库 ID
   */
  exists(kbId: string): boolean {
    const dbPath = this.getDatabasePath(kbId)
    const exists = existsSync(dbPath)
    return exists
  }

  /**
   * 获取数据库目录大小（字节）
   * @param kbId 知识库 ID
   */
  getDatabaseSize(kbId: string): number {
    const dbPath = this.getDatabasePath(kbId)
    if (!existsSync(dbPath)) {
      return 0
    }

    try {
      return this.calculateDirSize(dbPath)
    } catch {
      return 0
    }
  }

  /**
   * 递归计算目录大小（字节）
   */
  private calculateDirSize(dirPath: string): number {
    let totalSize = 0
    const files = readdirSync(dirPath)

    for (const file of files) {
      const filePath = join(dirPath, file)
      const stats = statSync(filePath)

      if (stats.isDirectory()) {
        totalSize += this.calculateDirSize(filePath)
      } else {
        totalSize += stats.size
      }
    }

    return totalSize
  }

  /**
   * 关闭所有数据库连接并清理缓存
   */
  closeAll(): void {
    for (const [kbId] of this.dbConnections) {
      try {
        logger.info('向量数据库连接已关闭', 'main', { kbId })
      } catch (error) {
        logger.error('关闭向量数据库连接失败', 'main', { kbId, error })
      }
    }
    this.dbConnections.clear()
    this.tables.clear()
    this.indexedTables.clear()
  }
}

// 单例实例
let vectorDBServiceInstance: VectorDBService | null = null

// 获取向量数据库服务单例
export function getVectorDBService(): VectorDBService {
  if (!vectorDBServiceInstance) {
    vectorDBServiceInstance = new VectorDBService()
  }
  return vectorDBServiceInstance
}
