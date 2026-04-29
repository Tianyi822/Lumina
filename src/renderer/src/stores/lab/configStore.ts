import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest
} from '@renderer/types/lab'
import { labApi } from '@renderer/services/labApi'

export const useDockerConfigStore = defineStore('dockerConfig', () => {
  // ==================== State ====================

  /** Dockerfile 配置列表 */
  const dockerfileConfigs = ref<DockerfileConfigMeta[]>([])
  /** Compose 配置列表 */
  const composeConfigs = ref<ComposeConfigMeta[]>([])
  /** 配置加载状态 */
  const configsLoading = ref(false)

  // ==================== Actions: Dockerfile 配置 ====================

  async function loadDockerfileConfigs(): Promise<void> {
    try {
      configsLoading.value = true
      const result = await labApi.dockerfile.list()
      if (result.success && result.configs) {
        dockerfileConfigs.value = result.configs
      }
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Dockerfile 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      configsLoading.value = false
    }
  }

  async function loadDockerfileConfig(id: string): Promise<DockerfileConfig | null> {
    try {
      const result = await labApi.dockerfile.load(id)
      if (result.success && result.config) {
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  }

  async function saveDockerfileConfig(
    request: SaveConfigRequest
  ): Promise<DockerfileConfigMeta | null> {
    try {
      const result = await labApi.dockerfile.save(request)
      if (result.success && result.config) {
        await loadDockerfileConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 保存 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function deleteDockerfileConfig(id: string): Promise<boolean> {
    try {
      const result = await labApi.dockerfile.delete(id)
      if (result.success) {
        await loadDockerfileConfigs()
        return true
      }
      return false
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 删除 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return false
    }
  }

  // ==================== Actions: Compose 配置 ====================

  async function loadComposeConfigs(): Promise<void> {
    try {
      configsLoading.value = true
      const result = await labApi.compose.list()
      if (result.success && result.configs) {
        composeConfigs.value = result.configs
      }
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Compose 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      configsLoading.value = false
    }
  }

  async function loadComposeConfig(id: string): Promise<ComposeConfig | null> {
    try {
      const result = await labApi.compose.load(id)
      if (result.success && result.config) {
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  }

  async function saveComposeConfig(request: SaveConfigRequest): Promise<ComposeConfigMeta | null> {
    try {
      const result = await labApi.compose.save(request)
      if (result.success && result.config) {
        await loadComposeConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 保存 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function deleteComposeConfig(id: string): Promise<boolean> {
    try {
      const result = await labApi.compose.delete(id)
      if (result.success) {
        await loadComposeConfigs()
        return true
      }
      return false
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 删除 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return false
    }
  }

  // ==================== Actions: 批量加载 ====================

  async function loadAllConfigs(): Promise<void> {
    await Promise.all([loadDockerfileConfigs(), loadComposeConfigs()])
  }

  return {
    // State
    dockerfileConfigs,
    composeConfigs,
    configsLoading,

    // Actions: Dockerfile
    loadDockerfileConfigs,
    loadDockerfileConfig,
    saveDockerfileConfig,
    deleteDockerfileConfig,

    // Actions: Compose
    loadComposeConfigs,
    loadComposeConfig,
    saveComposeConfig,
    deleteComposeConfig,

    // Actions: 批量
    loadAllConfigs
  }
})
