<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import ChatPage from './pages/ChatPage.vue'
import KnowledgePage from './pages/KnowledgePage.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import SettingsModal from './components/SettingsModal.vue'

// Composables
import { useConfigError } from './composables/useConfigError'
import { useUIState } from './composables/useUIState'
import { useSettings } from './composables/useSettings'
import { useLifecycle } from './composables/useLifecycle'

// ==================== 配置错误处理 ====================
const { configError, dismissError, loadConfigStatus } = useConfigError()

// ==================== UI 状态管理 ====================
const uiState = useUIState()
const { currentView } = uiState

// ==================== 设置管理 ====================
const settings = useSettings()
const { showSettings, openSettings, closeSettings, handleConfigUpdated, handleMCPUpdated } =
  settings

// ==================== 生命周期 ====================
// ChatPage 和 KnowledgePage 各自处理自己的初始化逻辑
useLifecycle({
  loadConfigStatus,
  setupStreamListener: undefined,
  cleanupStreamListener: undefined,
  loadSessionList: undefined,
  loadKnowledgeBases: undefined
})
</script>

<template>
  <div class="app-container">
    <!-- 自定义标题栏 -->
    <TitleBar v-model="currentView" @open-settings="openSettings" />

    <!-- 配置加载错误提示(仅在加载失败时显示) -->
    <ErrorBanner :error="configError" @dismiss="dismissError" />

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- Chat 视图 -->
      <ChatPage v-if="currentView === 'chat'" @open-settings="openSettings" />

      <!-- 知识库视图 -->
      <KnowledgePage v-else />
    </div>

    <!-- 设置弹窗 -->
    <SettingsModal
      v-if="showSettings"
      @close="closeSettings"
      @config-updated="handleConfigUpdated"
      @mcp-updated="handleMCPUpdated"
    />
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--theme-font);
  background-color: var(--theme-bg);
  color: var(--theme-text);
}

/* 主布局 */
.app-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
