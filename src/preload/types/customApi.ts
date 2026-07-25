import type { ConfigApi } from './config'
import type { LoggerApi } from './logger'
import type { ChatApi } from './chat'
import type { SessionApi } from './session'
import type { MCPApi } from './mcp'
import type { WindowApi } from './window'
import type { EmbeddingApi, EmbeddingModelsApi } from './embedding'
import type {
  KnowledgeApi,
  KnowledgeFileProgressEvent,
  KnowledgeReindexProgressEvent
} from './knowledge'
import type { FileApi } from './file'
import type { DocumentApi } from './document'
import type { KnowledgeMCPApi } from './knowledgeMCP'
import type { PaperApi } from './paper'
import type { ToolStatsApi } from './toolStats'
import type { PaperWebSearchApi } from './paperWebSearch'
import type { UpdateApi } from './update'
import type { CapabilityApi } from './capability'
import type { WriterApi } from './writer'

/**
 * 自定义的完整 API 集合
 * 通过 contextBridge 暴露给渲染进程的 window.api 对象
 */
export interface CustomApi {
  /** 应用配置管理 */
  config: ConfigApi
  /** 日志记录 */
  logger: LoggerApi
  /** AI 对话 */
  chat: ChatApi
  /** 会话管理 */
  session: SessionApi
  /** MCP 服务管理 */
  mcp: MCPApi
  /** 窗口控制 */
  window: WindowApi
  /** 嵌入模型 */
  embedding: EmbeddingApi
  /** 嵌入模型管理 */
  embeddingModels: EmbeddingModelsApi
  /** 知识库管理 */
  knowledge: KnowledgeApi
  /** 文件管理 */
  file: FileApi
  /** 文档上传与解析 */
  document: DocumentApi
  /** 监听文件索引进度 */
  onFileProgress: (callback: (data: KnowledgeFileProgressEvent) => void) => () => void
  /** 监听重新索引进度 */
  onReindexProgress: (callback: (data: KnowledgeReindexProgressEvent) => void) => () => void
  /** 知识库 MCP 服务 */
  knowledgeMCP: KnowledgeMCPApi
  /** 论文阅读器 */
  paper: PaperApi
  /** 工具调用统计 */
  toolStats: ToolStatsApi
  /** 论文网页搜索 */
  paperWebSearch: PaperWebSearchApi
  /** 自动更新 */
  update: UpdateApi
  /** 能力系统 */
  capability: CapabilityApi
  /** 写作工作区 */
  writer: WriterApi
}
