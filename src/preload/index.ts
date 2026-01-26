import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { loggerApi } from './apis/logger'
import { chatApi } from './apis/chat'
import { mcpApi } from './apis/mcp'
import { sessionApi } from './apis/session'
import { configApi } from './apis/config'

/**
 * 自定义渲染器 API
 */
const api = {
  config: configApi,
  logger: loggerApi,
  chat: chatApi,
  session: sessionApi,
  mcp: mcpApi
}

// 使用 `contextBridge` API 向渲染器暴露 Electron API
// 仅在启用了上下文隔离时使用，否则直接添加到 DOM 全局对象
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
