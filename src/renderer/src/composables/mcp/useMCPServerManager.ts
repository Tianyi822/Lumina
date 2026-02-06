/**
 * MCP Server Manager - 服务器配置和连接管理
 * 作为 mcpStore 的包装层，保持向后兼容
 */

import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import type { MCPServerConfig, MCPConnectionStatus, MCPStatusChangeEvent } from '@renderer/types'
import { useMCPStore } from '@renderer/stores'

export function useMCPServerManager(): {
  // 配置
  mcpConfigs: Ref<MCPServerConfig[]>
  mcpStatuses: Ref<MCPConnectionStatus[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  loadConfigs: () => Promise<void>
  saveConfig: (config: MCPServerConfig) => Promise<boolean>
  deleteConfig: (name: string) => Promise<boolean>
  getStatus: (name: string) => MCPConnectionStatus | undefined

  // 连接
  connecting: Ref<string | null>
  testing: Ref<string | null>
  connect: (
    name: string,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void
  ) => Promise<boolean>
  disconnect: (name: string, onError?: (msg: string) => void) => Promise<boolean>
  testConnection: (
    config: MCPServerConfig,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void
  ) => Promise<boolean>
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void) => () => void

  // 表单
  showForm: Ref<boolean>
  formData: MCPServerConfig
  argsText: Ref<string>
  envText: Ref<string>
  headersText: Ref<string>
  parseKeyValueText: (text: string) => Record<string, string>
  keyValueToText: (obj: Record<string, string>) => string
  buildConfig: () => MCPServerConfig
  validateConfig: (config: MCPServerConfig, existingNames: string[]) => string | null
  resetForm: () => void
  openForm: () => void
} {
  const mcpStore = useMCPStore()

  // 从 Store 获取响应式引用
  const {
    configs,
    statuses,
    loading,
    error,
    connecting,
    testing,
    showForm,
    formData,
    argsText,
    envText,
    headersText
  } = storeToRefs(mcpStore)

  // 兼容旧的命名
  const mcpConfigs = configs
  const mcpStatuses = statuses

  // 配置管理
  const loadConfigs = mcpStore.loadConfigs
  const saveConfig = mcpStore.saveConfig
  const deleteConfig = mcpStore.deleteConfig
  const getStatus = mcpStore.getStatus

  // 连接管理
  const connect = mcpStore.connect
  const disconnect = mcpStore.disconnect
  const testConnection = mcpStore.testConnection

  // 状态监听（保持原有接口）
  function onStatusChange(callback: (event: MCPStatusChangeEvent) => void): () => void {
    return window.api.mcp.onStatusChange(callback)
  }

  // 表单辅助函数
  const parseKeyValueText = mcpStore.parseKeyValueText
  const keyValueToText = mcpStore.keyValueToText
  const buildConfig = mcpStore.buildConfig
  const validateConfig = mcpStore.validateConfig
  const resetForm = mcpStore.resetForm

  function openForm(): void {
    mcpStore.openCreateForm()
  }

  return {
    // 配置
    mcpConfigs,
    mcpStatuses,
    loading,
    error,
    loadConfigs,
    saveConfig,
    deleteConfig,
    getStatus,

    // 连接
    connecting,
    testing,
    connect,
    disconnect,
    testConnection,
    onStatusChange,

    // 表单
    showForm,
    formData: formData.value,
    argsText,
    envText,
    headersText,
    parseKeyValueText,
    keyValueToText,
    buildConfig,
    validateConfig,
    resetForm,
    openForm
  }
}
