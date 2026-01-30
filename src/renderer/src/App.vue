<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import ChatPage from './components/ChatPage.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import KnowledgeSidebar from './components/KnowledgeSidebar.vue'
import KnowledgeMain from './components/KnowledgeMain.vue'
import KnowledgeForm from './components/knowledge/KnowledgeForm.vue'
import DocumentUploader from './components/knowledge/DocumentUploader.vue'
import SettingsModal from './components/SettingsModal.vue'

// Composables
import { useConfigError } from './composables/useConfigError'
import { useUIState } from './composables/useUIState'
import { useSettings } from './composables/useSettings'
import { useKnowledge } from './composables/useKnowledge'
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

// ==================== 知识库管理 ====================
const {
  knowledgeBases,
  activeKbId,
  showKnowledgeForm,
  showDocumentUploader,
  handleSelectKB,
  handleCreateKB,
  handleDeleteKB,
  handleKnowledgeSubmit,
  handleKnowledgeCancel,
  handleUploadDocuments,
  handleDocumentUpload,
  handleUploaderCancel
} = useKnowledge()

// ==================== 生命周期 ====================
// 聊天相关的初始化由 ChatPage 组件内部处理,这里只处理全局和知识库相关的初始化
useLifecycle({
  loadConfigStatus,
  setupStreamListener: undefined, // ChatPage 会处理
  cleanupStreamListener: undefined, // ChatPage 会处理
  loadSessionList: undefined, // ChatPage 会处理
  loadKnowledgeBases: undefined // TODO: 从知识库 composable 添加加载逻辑
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
      <template v-else>
        <KnowledgeSidebar
          :knowledge-bases="knowledgeBases"
          :active-kb-id="activeKbId"
          @select-kb="handleSelectKB"
          @create-kb="handleCreateKB"
          @delete-kb="handleDeleteKB"
        />
        <KnowledgeMain
          :knowledge-base="knowledgeBases.find((kb) => kb.id === activeKbId)"
          @upload-documents="handleUploadDocuments"
        />
      </template>
    </div>

    <!-- 知识库表单模态框 -->
    <KnowledgeForm
      v-if="showKnowledgeForm"
      @submit="handleKnowledgeSubmit"
      @cancel="handleKnowledgeCancel"
    />

    <!-- 文档上传模态框 -->
    <DocumentUploader
      v-if="showDocumentUploader"
      @upload="handleDocumentUpload"
      @cancel="handleUploaderCancel"
    />

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
