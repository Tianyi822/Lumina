import type { ConfigApi } from './config'
import type { LoggerApi } from './logger'
import type { ChatApi } from './chat'
import type { SessionApi } from './session'
import type { MCPApi } from './mcp'
import type { PromptApi } from './prompt'
import type { WindowApi } from './window'
import type { EmbeddingApi, EmbeddingModelsApi } from './embedding'
import type { KnowledgeApi, FileProgressEvent, ReindexProgressEvent } from './knowledge'
import type { FileApi } from './file'
import type { SandboxApi } from './sandbox'
import type { DocumentApi } from './document'
import type { PromptTemplateApi, CacheStatsApi } from './promptTemplate'
import type { KnowledgeMCPApi } from './knowledgeMCP'
import type { VoiceRecognitionApi } from './voiceRecognition'
import type { PptTemplateApi, PptExportApi } from './ppt'

/**
 * 自定义的完整 API
 */
export interface CustomApi {
  config: ConfigApi
  logger: LoggerApi
  chat: ChatApi
  session: SessionApi
  mcp: MCPApi
  prompt: PromptApi
  window: WindowApi
  embedding: EmbeddingApi
  embeddingModels: EmbeddingModelsApi
  knowledge: KnowledgeApi
  file: FileApi
  sandbox: SandboxApi
  document: DocumentApi
  onFileProgress: (callback: (data: FileProgressEvent) => void) => () => void
  onReindexProgress: (callback: (data: ReindexProgressEvent) => void) => () => void
  // 提示词工程相关 API
  promptTemplate: PromptTemplateApi
  cacheStats: CacheStatsApi
  // 知识库 MCP 服务 API
  knowledgeMCP: KnowledgeMCPApi
  // 语音识别 API
  voiceRecognition: VoiceRecognitionApi
  // PPT 模板 API
  pptTemplate: PptTemplateApi
  // PPT 导出 API
  pptExport: PptExportApi
}

