import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'

export const capabilityApi = {
  add: (sessionId: string, capabilityId: string) =>
    ipcRenderer.invoke('capability:add', sessionId, capabilityId),

  getState: (sessionId: string) =>
    ipcRenderer.invoke('capability:getState', sessionId),

  respondSuggestion: (sessionId: string, capabilityId: string, accepted: boolean) =>
    ipcRenderer.invoke('capability:suggestResponse', sessionId, capabilityId, accepted),

  onSuggest: (callback: (data: { capabilityId: string; reason: string }) => void) =>
    createIpcListener('capability:suggest', callback)
}
