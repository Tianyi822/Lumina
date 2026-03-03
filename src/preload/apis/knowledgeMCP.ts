import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { KnowledgeMCPServerStatus, KnowledgeMCPConfig } from '@shared/types/knowledgeMCP'

/**
 * 知识库 MCP 服务 API
 */
export const knowledgeMCPApi = {
  /**
   * 获取服务状态
   */
  getStatus: (): Promise<KnowledgeMCPServerStatus> => {
    return ipcRenderer.invoke('knowledge-mcp:getStatus')
  },

  /**
   * 启动服务
   * @param port 可选的端口号
   */
  start: (port?: number): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('knowledge-mcp:start', port)
  },

  /**
   * 停止服务
   */
  stop: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('knowledge-mcp:stop')
  },

  /**
   * 获取 MCP 配置 JSON（用于外部工具连接）
   */
  getConfig: (): Promise<string> => {
    return ipcRenderer.invoke('knowledge-mcp:getConfig')
  },

  /**
   * 获取本机 IP 地址
   */
  getLocalIP: (): Promise<string> => {
    return ipcRenderer.invoke('knowledge-mcp:getLocalIP')
  },

  /**
   * 更新配置
   */
  updateConfig: (config: Partial<KnowledgeMCPConfig>): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('knowledge-mcp:updateConfig', config)
  },

  /**
   * 获取当前配置
   */
  getCurrentConfig: (): Promise<KnowledgeMCPConfig> => {
    return ipcRenderer.invoke('knowledge-mcp:getCurrentConfig')
  },

  /**
   * 监听状态变更事件
   * @param callback 状态变更回调函数
   * @returns 取消监听函数
   */
  onStatusChange: (callback: (status: KnowledgeMCPServerStatus) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: KnowledgeMCPServerStatus): void => {
      callback(status)
    }
    ipcRenderer.on('knowledge-mcp:statusChange', handler)
    return () => {
      ipcRenderer.removeListener('knowledge-mcp:statusChange', handler)
    }
  }
}
