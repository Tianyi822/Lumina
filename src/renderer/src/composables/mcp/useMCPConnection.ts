import { ref, toRaw, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { MCPServerConfig, MCPConnectionStatus } from '@renderer/types'

export function useMCPConnection(): {
  connecting: Ref<string | null>
  testing: Ref<string | null>
  connect: (
    name: string,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ) => Promise<boolean>
  disconnect: (name: string, onError?: (message: string) => void) => Promise<boolean>
  testConnection: (
    config: MCPServerConfig,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ) => Promise<boolean>
  onStatusChange: (
    callback: (event: { serverName: string; status: MCPConnectionStatus }) => void
  ) => void
} {
  const connecting = ref<string | null>(null)
  const testing = ref<string | null>(null)

  /**
   * 连接 MCP 服务器
   */
  async function connect(
    name: string,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ): Promise<boolean> {
    connecting.value = name
    try {
      const result = await window.api.mcp.connect(name)
      if (result.success) {
        onSuccess?.(`${name} 已连接`)
        return true
      } else {
        onError?.(`连接失败: ${result.error}`)
        return false
      }
    } catch (e) {
      const errorMsg = `连接失败: ${e instanceof Error ? e.message : String(e)}`
      onError?.(errorMsg)
      return false
    } finally {
      connecting.value = null
    }
  }

  /**
   * 断开 MCP 服务器
   */
  async function disconnect(name: string, onError?: (message: string) => void): Promise<boolean> {
    try {
      await window.api.mcp.disconnect(name)
      return true
    } catch (e) {
      const errorMsg = `断开失败: ${e instanceof Error ? e.message : String(e)}`
      onError?.(errorMsg)
      return false
    }
  }

  /**
   * 测试 MCP 连接
   */
  async function testConnection(
    config: MCPServerConfig,
    onSuccess?: (message: string) => void,
    onError?: (message: string) => void
  ): Promise<boolean> {
    testing.value = config.name
    try {
      // 将 Vue 响应式对象转换为普通对象，以便通过 IPC 传输
      const plainConfig = JSON.parse(JSON.stringify(toRaw(config)))
      const result = await window.api.mcp.testConnection(plainConfig)
      if (result.success) {
        onSuccess?.(`${config.name} 连接测试成功，发现 ${result.tools?.length || 0} 个工具`)
        return true
      } else {
        onError?.(`连接测试失败: ${result.error}`)
        return false
      }
    } catch (e) {
      const errorMsg = `测试失败: ${e instanceof Error ? e.message : String(e)}`
      onError?.(errorMsg)
      return false
    } finally {
      testing.value = null
    }
  }

  /**
   * 监听 MCP 状态变更
   */
  function onStatusChange(
    callback: (event: { serverName: string; status: MCPConnectionStatus }) => void
  ): void {
    const unsubscribe = window.api.mcp.onStatusChange(callback)

    onUnmounted(() => {
      unsubscribe()
    })
  }

  return {
    connecting,
    testing,
    connect,
    disconnect,
    testConnection,
    onStatusChange
  }
}
