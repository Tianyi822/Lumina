import { registerConfigHandlers } from './handlers/configHandlers'
import { registerLoggerHandlers } from './handlers/loggerHandlers'
import { registerChatHandlers } from './handlers/chatHandlers'
import { registerSessionHandlers } from './handlers/sessionHandlers'
import { registerMCPHandlers } from './handlers/mcpHandlers'
import { registerWindowHandlers } from './handlers/windowHandlers'
import { registerEmbeddingHandlers } from './handlers/embeddingHandlers'
import { registerKnowledgeHandlers } from './handlers/knowledgeHandlers'
import { registerEmbeddingModelHandlers } from './handlers/embeddingModelHandlers'
import { registerFileHandlers } from './handlers/fileHandlers'
import { registerKnowledgeMCPHandlers } from './handlers/knowledgeMCPHandlers'
import { registerDocumentHandlers } from './handlers/documentHandlers'
import { registerPaperHandlers } from './handlers/paperHandlers'
import { registerToolStatsHandlers } from './handlers/toolStatsHandlers'
import { registerPaperWebSearchHandlers } from './handlers/paperWebSearchHandlers'
import { registerCapabilityHandlers } from './handlers/capabilityHandlers'
import { registerUpdateHandlers } from './handlers/updateHandlers'
import { registerWriterHandlers } from './handlers/writerHandlers'

export { initializeConfig } from './handlers/configHandlers'
export { initializeLogger } from './handlers/loggerHandlers'
export { initializeMCP } from './handlers/mcpHandlers'
export { initializeEmbedding } from './handlers/embeddingHandlers'
export { initializeKnowledge } from './handlers/knowledgeHandlers'
export { initializeEmbeddingModels } from './handlers/embeddingModelHandlers'
export { initializeFileService } from './handlers/fileHandlers'
export { initializeWriterService } from '@main/services/writer'

/**
 * 注册所有 IPC 处理程序
 */
export function registerAllIpcHandlers(): void {
  // 注册配置相关处理程序
  registerConfigHandlers()

  // 注册日志相关处理程序
  registerLoggerHandlers()

  // 注册聊天相关处理程序
  registerChatHandlers()

  // 注册会话相关处理程序
  registerSessionHandlers()

  // 注册 MCP 相关处理程序
  registerMCPHandlers()

  // 注册窗口控制相关处理程序
  registerWindowHandlers()

  // 注册嵌入模型相关处理程序
  registerEmbeddingHandlers()

  // 注册嵌入模型管理相关处理程序
  registerEmbeddingModelHandlers()

  // 注册知识库相关处理程序
  registerKnowledgeHandlers()

  // 注册文件管理相关处理程序
  registerFileHandlers()

  // 注册知识库 MCP 服务相关处理程序
  registerKnowledgeMCPHandlers()

  // 注册文档处理相关处理程序
  registerDocumentHandlers()

  // 注册论文相关处理程序
  registerPaperHandlers()

  // 注册工具统计相关处理程序
  registerToolStatsHandlers()

  // 注册论文网页搜索相关处理程序
  registerPaperWebSearchHandlers()

  // 注册能力系统相关处理程序
  registerCapabilityHandlers()

  // 注册自动更新相关处理程序
  registerUpdateHandlers()

  // 注册写作工作区相关处理程序
  registerWriterHandlers()
}
