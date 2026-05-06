import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { loggerApi } from './apis/logger'
import { chatApi } from './apis/chat'
import { mcpApi } from './apis/mcp'
import { sessionApi } from './apis/session'
import { configApi } from './apis/config'
import { windowApi } from './apis/window'
import { embeddingApi } from './apis/embedding'
import { embeddingModelsApi } from './apis/embeddingModels'
import { knowledgeApi, onFileProgress, onReindexProgress } from './apis/knowledge'
import { fileApi } from './apis/file'
import { labApi } from './apis/lab'
import { knowledgeMCPApi } from './apis/knowledgeMCP'
import { documentApi } from './apis/document'
import { paperApi } from './apis/paper'
import { toolStatsApi } from './apis/toolStats'
import { paperWebSearchApi } from './apis/paperWebSearch'

/**
 * 自定义渲染器 API
 * 将各个模块的 API 整合到一个对象中
 */
const api = {
  config: configApi,
  logger: loggerApi,
  chat: chatApi,
  session: sessionApi,
  mcp: mcpApi,
  window: windowApi,
  embedding: embeddingApi,
  embeddingModels: embeddingModelsApi,
  knowledge: knowledgeApi,
  file: fileApi,
  lab: labApi,
  document: documentApi,
  onFileProgress,
  onReindexProgress,
  // 知识库 MCP 服务 API
  knowledgeMCP: knowledgeMCPApi,
  // 论文相关 API
  paper: paperApi,
  // 工具统计 API
  toolStats: toolStatsApi,
  // 论文网页搜索 API
  paperWebSearch: paperWebSearchApi
}

// 使用 contextBridge 向渲染器暴露 API
// 仅在启用上下文隔离时使用，否则直接添加到 DOM 全局对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (在 dts 中定义)
  window.electron = electronAPI
  // @ts-ignore (在 dts 中定义)
  window.api = api
}
