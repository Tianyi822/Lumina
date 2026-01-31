import { ref, toRaw } from 'vue'
import type { Ref } from 'vue'
import type { MCPServerConfig, MCPConnectionStatus } from '@renderer/types'
import { deepClone } from '@shared/utils'

export function useMCPConfig(): {
  mcpConfigs: Ref<MCPServerConfig[]>
  mcpStatuses: Ref<MCPConnectionStatus[]>
  loading: Ref<boolean>
  error: Ref<string | undefined>
  loadConfigs: () => Promise<void>
  saveConfig: (config: MCPServerConfig) => Promise<boolean>
  deleteConfig: (name: string) => Promise<boolean>
  getStatus: (name: string) => MCPConnectionStatus | undefined
} {
  const mcpConfigs = ref<MCPServerConfig[]>([])
  const mcpStatuses = ref<MCPConnectionStatus[]>([])
  const loading = ref(false)
  const error = ref<string>()

  /**
   * 加载所有 MCP 配置
   */
  async function loadConfigs(): Promise<void> {
    loading.value = true
    error.value = undefined
    try {
      mcpConfigs.value = await window.api.mcp.listConfigs()
      mcpStatuses.value = await window.api.mcp.getStatus()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('加载 MCP 配置失败:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存 MCP 配置
   */
  async function saveConfig(config: MCPServerConfig): Promise<boolean> {
    loading.value = true
    error.value = undefined
    try {
      const plainConfig = deepClone(toRaw(config))
      const result = await window.api.mcp.saveConfig(plainConfig)
      if (result.success) {
        await loadConfigs()
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('保存 MCP 配置失败:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 删除 MCP 配置
   */
  async function deleteConfig(name: string): Promise<boolean> {
    loading.value = true
    error.value = undefined
    try {
      const result = await window.api.mcp.deleteConfig(name)
      if (result.success) {
        await loadConfigs()
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('删除 MCP 配置失败:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取 MCP 服务器连接状态
   */
  function getStatus(name: string): MCPConnectionStatus | undefined {
    return mcpStatuses.value.find((s) => s.serverName === name)
  }

  return {
    mcpConfigs,
    mcpStatuses,
    loading,
    error,
    loadConfigs,
    saveConfig,
    deleteConfig,
    getStatus
  }
}
