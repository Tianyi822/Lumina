import type { IpcRendererEvent } from 'electron'

/**
 * PPT 导出 API
 */
export interface PptExportApi {
  getConfig: () => Promise<{
    success: boolean
    configured: boolean
    config: {
      accessKeyId: string
      accessKeySecret: string
      workspaceId: string
    }
    error?: string
  }>
  saveConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }) => Promise<{ success: boolean; error?: string }>
  testConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }) => Promise<{ success: boolean; error?: string }>
  generateOutline: (
    prompt: string,
    sessionId: string
  ) => Promise<{ success: boolean; taskId?: string; outline?: string; error?: string }>
  onOutlineChunk: (
    callback: (event: IpcRendererEvent, data: { sessionId: string; text: string }) => void
  ) => () => void
  onOutlineDone: (
    callback: (
      event: IpcRendererEvent,
      data: { sessionId: string; taskId: string; outline: string }
    ) => void
  ) => () => void
  onOutlineError: (
    callback: (event: IpcRendererEvent, data: { sessionId: string; error: string }) => void
  ) => () => void
  removeOutlineListeners: () => void
  initiateCreation: (
    taskId: string,
    outline: string
  ) => Promise<{ success: boolean; appkey?: string; code?: string; error?: string }>
  bindArtifact: (
    taskId: string,
    artifactId: number
  ) => Promise<{ success: boolean; error?: string }>
}
