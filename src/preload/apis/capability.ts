import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'

/**
 * 能力系统相关的 API
 * 用于 AI 会话中动态添加和查询能力
 */
export const capabilityApi = {
  /** 为会话添加指定的能力 */
  add: (sessionId: string, capabilityId: string) =>
    ipcRenderer.invoke('capability:add', sessionId, capabilityId),

  /** 获取会话当前已激活的能力状态 */
  getState: (sessionId: string) =>
    ipcRenderer.invoke('capability:getState', sessionId),

  /** 响应对能力的建议（接受或拒绝） */
  respondSuggestion: (sessionId: string, capabilityId: string, accepted: boolean) =>
    ipcRenderer.invoke('capability:suggestResponse', sessionId, capabilityId, accepted),

  /** 监听能力建议事件 */
  onSuggest: (callback: (data: { capabilityId: string; reason: string }) => void) =>
    createIpcListener('capability:suggest', callback)
}
