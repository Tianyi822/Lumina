// Pinia Store 入口

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// 创建 Pinia 实例
export const pinia = createPinia()

// 注册持久化插件
pinia.use(piniaPluginPersistedstate)

// 导出所有 stores
export { usePaperChatStreamStore } from './paperChatStreamStore'
export { usePaperChatMessageCacheStore } from './paperChatMessageCacheStore'
export { useUIStateStore } from './uiStateStore'
export { useKnowledgeIndexStore } from './knowledgeIndexStore'
export { useConfigStore } from './configStore'
export { useNotificationCenterStore } from './notificationCenterStore'

// 新增 Stores
export { useMCPStore } from './mcpStore'
export { useKnowledgeStore } from './knowledgeStore'
export { useFileStore } from './fileStore'
export { usePaperChatDocumentUploadStore } from './paperChatDocumentUploadStore'
export { usePaperChatImageUploadStore } from './paperChatImageUploadStore'
export { usePaperChatQuoteStore } from './paperChatQuoteStore'

// Sandbox Stores (拆分后的模块)
export {
  useSandboxStore,
  useContainerStore,
  useSandboxCreatorStore,
  useDockerConfigStore
} from './sandbox'

// Prompt Engineering Store (提示词工程增强)
export { usePromptEngineeringStore } from './promptEngineeringStore'

// Paper Reader Store (论文阅读器)
export { usePaperReaderStore } from './paperReaderStore'

// 初始化 Pinia（在应用启动时调用）
export function initializePinia(): void {
  // 可以在这里添加全局 store 初始化逻辑
  window.api.logger?.info('Pinia store initialized')
}
