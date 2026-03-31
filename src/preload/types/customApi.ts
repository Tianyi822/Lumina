import type { ConfigApi } from './config'
import type { LoggerApi } from './logger'
import type { ChatApi } from './chat'
import type { SessionApi } from './session'
import type { MCPApi } from './mcp'
import type { WindowApi } from './window'
import type { EmbeddingApi, EmbeddingModelsApi } from './embedding'
import type { KnowledgeApi, FileProgressEvent, ReindexProgressEvent } from './knowledge'
import type { FileApi } from './file'
import type { SandboxApi } from './sandbox'
import type { DocumentApi } from './document'
import type { KnowledgeMCPApi } from './knowledgeMCP'
import type { VoiceRecognitionApi } from './voiceRecognition'
import type { PptExportApi } from './ppt'
import type { PromptEngineeringApi } from './promptEngineering'

/**
 * 自定义的完整 API
 */
export interface CustomApi {
  config: ConfigApi
  logger: LoggerApi
  chat: ChatApi
  session: SessionApi
  mcp: MCPApi
  window: WindowApi
  embedding: EmbeddingApi
  embeddingModels: EmbeddingModelsApi
  knowledge: KnowledgeApi
  file: FileApi
  sandbox: SandboxApi
  document: DocumentApi
  onFileProgress: (callback: (data: FileProgressEvent) => void) => () => void
  onReindexProgress: (callback: (data: ReindexProgressEvent) => void) => () => void
  // 提示词工程统一 API
  promptEngineering: PromptEngineeringApi
  // 知识库 MCP 服务 API
  knowledgeMCP: KnowledgeMCPApi
  // 语音识别 API
  voiceRecognition: VoiceRecognitionApi
  // PPT 导出 API
  pptExport: PptExportApi
}
