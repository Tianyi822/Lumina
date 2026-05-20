import { create } from 'zustand'
import type {
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest
} from '@renderer/types/lab'
import { labApi } from '@renderer/services/labApi'

interface DockerConfigState {
  dockerfileConfigs: DockerfileConfigMeta[]
  composeConfigs: ComposeConfigMeta[]
  configsLoading: boolean

  loadDockerfileConfigs: () => Promise<void>
  loadDockerfileConfig: (id: string) => Promise<DockerfileConfig | null>
  saveDockerfileConfig: (request: SaveConfigRequest) => Promise<DockerfileConfigMeta | null>
  deleteDockerfileConfig: (id: string) => Promise<boolean>

  loadComposeConfigs: () => Promise<void>
  loadComposeConfig: (id: string) => Promise<ComposeConfig | null>
  saveComposeConfig: (request: SaveConfigRequest) => Promise<ComposeConfigMeta | null>
  deleteComposeConfig: (id: string) => Promise<boolean>

  loadAllConfigs: () => Promise<void>
}

export const useDockerConfigStore = create<DockerConfigState>()((set, get) => ({
  dockerfileConfigs: [],
  composeConfigs: [],
  configsLoading: false,

  loadDockerfileConfigs: async () => {
    try {
      set({ configsLoading: true })
      const result = await labApi.dockerfile.list()
      if (result.success && result.configs) {
        set({ dockerfileConfigs: result.configs })
      }
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Dockerfile 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      set({ configsLoading: false })
    }
  },

  loadDockerfileConfig: async (id) => {
    try {
      const result = await labApi.dockerfile.load(id)
      if (result.success && result.config) return result.config
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  },

  saveDockerfileConfig: async (request) => {
    try {
      const result = await labApi.dockerfile.save(request)
      if (result.success && result.config) {
        await get().loadDockerfileConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 保存 Dockerfile 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  },

  deleteDockerfileConfig: async (id) => {
    try {
      const result = await labApi.dockerfile.delete(id)
      if (result.success) {
        await get().loadDockerfileConfigs()
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
  },

  loadComposeConfigs: async () => {
    try {
      set({ configsLoading: true })
      const result = await labApi.compose.list()
      if (result.success && result.configs) {
        set({ composeConfigs: result.configs })
      }
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Compose 配置列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      set({ configsLoading: false })
    }
  },

  loadComposeConfig: async (id) => {
    try {
      const result = await labApi.compose.load(id)
      if (result.success && result.config) return result.config
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 加载 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error),
        id
      })
      return null
    }
  },

  saveComposeConfig: async (request) => {
    try {
      const result = await labApi.compose.save(request)
      if (result.success && result.config) {
        await get().loadComposeConfigs()
        return result.config
      }
      return null
    } catch (error) {
      window.api.logger.error('[DockerConfigStore] 保存 Compose 配置失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  },

  deleteComposeConfig: async (id) => {
    try {
      const result = await labApi.compose.delete(id)
      if (result.success) {
        await get().loadComposeConfigs()
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
  },

  loadAllConfigs: async () => {
    await Promise.all([get().loadDockerfileConfigs(), get().loadComposeConfigs()])
  }
}))
