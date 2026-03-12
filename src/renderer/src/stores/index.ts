// Pinia Store 入口

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// 创建 Pinia 实例
export const pinia = createPinia()

// 注册持久化插件
pinia.use(piniaPluginPersistedstate)

// 导出所有 stores
export { useSessionStore } from './sessionStore'
export { useChatStreamStore } from './chatStreamStore'
export { useInputStateStore } from './inputStateStore'
export { useMessageCacheStore } from './messageCacheStore'
export { useUIStateStore } from './uiStateStore'
export { useKnowledgeIndexStore } from './knowledgeIndexStore'
export { useConfigStore } from './configStore'

// 新增 Stores
export { useMCPStore } from './mcpStore'
export { useKnowledgeStore } from './knowledgeStore'
export { useFileStore } from './fileStore'
export { useDocumentUploadStore } from './documentUploadStore'
export { useImageUploadStore } from './imageUploadStore'
export { usePptTemplateStore } from './pptTemplateStore'

// Sandbox Stores (拆分后的模块)
export {
  useSandboxStore,
  useContainerStore,
  useSandboxCreatorStore,
  useDockerConfigStore
} from './sandbox'

// 初始化 Pinia（在应用启动时调用）
export function initializePinia(): void {
  // 可以在这里添加全局 store 初始化逻辑
  window.api.logger?.info('Pinia store initialized')
}
