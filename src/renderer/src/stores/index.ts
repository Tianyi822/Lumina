// Store 入口（Zustand — Phase 2 迁移中）

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// Pinia 实例（保留以支持尚未迁移的 store：lab/*, paperReaderStore）
export const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// Zustand Stores（已迁移）
export { usePaperChatStreamStore } from './paperChatStreamStore'
export { usePaperChatMessageCacheStore } from './paperChatMessageCacheStore'
export { useUIStateStore } from './uiStateStore'
export { useKnowledgeIndexStore } from './knowledgeIndexStore'
export { useConfigStore } from './configStore'
export { useNotificationCenterStore } from './notificationCenterStore'

export { useMCPStore } from './mcpStore'
export { useKnowledgeStore } from './knowledgeStore'
export { useFileStore } from './fileStore'
export { usePaperChatDocumentUploadStore } from './paperChatDocumentUploadStore'
export { usePaperChatImageUploadStore } from './paperChatImageUploadStore'
export { usePaperChatQuoteStore } from './paperChatQuoteStore'
export { useUpdateStore } from './updateStore'

// Lab Stores (Zustand 已迁移)
export { useDockerConfigStore, useComposeConfigStore } from './lab'

// Lab Stores (Pinia — 待迁移，暂时通过 lab/index 导出)
export { useLabStore, useContainerStore, useLabCreatorStore } from './lab'

// Paper Reader Store (Pinia — 待迁移)
export { usePaperReaderStore } from './paperReaderStore'

// 初始化（在应用启动时调用）
export function initializePinia(): void {
  window.api.logger?.info('Pinia store initialized (部分 stores 仍使用 Pinia，待 Phase 3 完成迁移)')
}
