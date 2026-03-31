import { ipcRenderer } from 'electron'

/**
 * PPT 导出 API
 * 提供妙笔 PPT 生成相关功能
 */
export const pptExportApi = {
  getConfig: (): Promise<{
    success: boolean
    configured: boolean
    config: {
      accessKeyId: string
      accessKeySecret: string
      workspaceId: string
    }
    error?: string
  }> => {
    return ipcRenderer.invoke('ppt:getConfig')
  },

  saveConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('ppt:saveConfig', config)
  },

  testConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('ppt:testConfig', config)
  },

  generateOutline: (
    prompt: string,
    sessionId: string
  ): Promise<{ success: boolean; taskId?: string; outline?: string; error?: string }> => {
    return ipcRenderer.invoke('ppt:generateOutline', { prompt, sessionId })
  },

  onOutlineChunk: (
    callback: (event: Electron.IpcRendererEvent, data: { sessionId: string; text: string }) => void
  ): (() => void) => {
    const listener = (
      event: Electron.IpcRendererEvent,
      data: { sessionId: string; text: string }
    ): void => {
      callback(event, data)
    }
    ipcRenderer.on('ppt:outline:chunk', listener)
    return () => {
      ipcRenderer.removeListener('ppt:outline:chunk', listener)
    }
  },

  onOutlineDone: (
    callback: (
      event: Electron.IpcRendererEvent,
      data: { sessionId: string; taskId: string; outline: string }
    ) => void
  ): (() => void) => {
    const listener = (
      event: Electron.IpcRendererEvent,
      data: { sessionId: string; taskId: string; outline: string }
    ): void => {
      callback(event, data)
    }
    ipcRenderer.on('ppt:outline:done', listener)
    return () => {
      ipcRenderer.removeListener('ppt:outline:done', listener)
    }
  },

  onOutlineError: (
    callback: (event: Electron.IpcRendererEvent, data: { sessionId: string; error: string }) => void
  ): (() => void) => {
    const listener = (
      event: Electron.IpcRendererEvent,
      data: { sessionId: string; error: string }
    ): void => {
      callback(event, data)
    }
    ipcRenderer.on('ppt:outline:error', listener)
    return () => {
      ipcRenderer.removeListener('ppt:outline:error', listener)
    }
  },

  removeOutlineListeners: (): void => {
    ipcRenderer.removeAllListeners('ppt:outline:chunk')
    ipcRenderer.removeAllListeners('ppt:outline:done')
    ipcRenderer.removeAllListeners('ppt:outline:error')
  },

  initiateCreation: (
    taskId: string,
    outline: string
  ): Promise<{ success: boolean; appkey?: string; code?: string; error?: string }> => {
    return ipcRenderer.invoke('ppt:initiateCreation', { taskId, outline })
  },

  bindArtifact: (
    taskId: string,
    artifactId: number
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('ppt:bindArtifact', { taskId, artifactId })
  }
}
