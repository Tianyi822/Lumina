<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import MainContent from './components/MainContent.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import ChatErrorToast from './components/ChatErrorToast.vue'
import KnowledgeSidebar from './components/KnowledgeSidebar.vue'
import KnowledgeMain from './components/KnowledgeMain.vue'
import KnowledgeForm from './components/knowledge/KnowledgeForm.vue'
import DocumentUploader from './components/knowledge/DocumentUploader.vue'
import SettingsModal from './components/SettingsModal.vue'

// Composables
import { useConfigError } from './composables/useConfigError'
import { useChatStream } from './composables/useChatStream'
import { useSessionActions } from './composables/useSessionActions'
import { useChatMessage } from './composables/useChatMessage'
import { useChatError } from './composables/useChatError'
import { useUIState } from './composables/useUIState'
import { useSettings } from './composables/useSettings'
import { useKnowledge } from './composables/useKnowledge'
import { useLifecycle } from './composables/useLifecycle'

// ==================== 配置错误处理 ====================
const { configError, dismissError, loadConfigStatus } = useConfigError()

// ==================== 聊天错误处理 ====================
const { showChatError, chatErrorMessage, handleChatError, closeChatError } = useChatError()

// ==================== UI 状态管理 ====================
const uiState = useUIState()
const { currentModel, sidebarCollapsed, currentView } = uiState

// ==================== 会话管理 ====================
// 先创建一个临时 chatStream 对象用于初始化 sessionActions
import { ref } from 'vue'
const tempChatStream = {
  isSending: ref(false),
  setStreamingSessionId: () => {}
}

const sessionActions = useSessionActions(tempChatStream)

// 从 sessionActions 中解构出响应式变量供模板使用
const { currentChatId, messages, sessionList, sessionUpdateKey } = sessionActions

// ==================== 聊天流式处理 ====================
const chatStream = useChatStream(
  () => sessionActions.currentSession.value,
  () => sessionActions.messages.value,
  sessionActions.saveCurrentSession,
  (sessionId: string) => sessionActions.saveCachedSession(sessionId),
  handleChatError
)

const { isSending, setupStreamListener, cleanupStreamListener, stopRequest } = chatStream

// ==================== 聊天消息处理 ====================
const { handleSendMessage } = useChatMessage(
  sessionActions.currentSession,
  sessionActions.currentChatId,
  sessionActions.messages,
  isSending,
  currentModel,
  sessionActions.createSession,
  sessionActions.updateSessionTitle,
  chatStream.setStreamingSessionId,
  chatStream.setMessagesSnapshot,
  handleChatError
)

// ==================== 停止请求 ====================
async function handleStopRequest(): Promise<void> {
  const sessionId = sessionActions.currentSession.value?.sessionId
  if (sessionId) {
    await stopRequest(sessionId)
  }
}

// ==================== 设置管理 ====================
const settings = useSettings()
const { showSettings, configUpdateKey, openSettings, closeSettings, handleConfigUpdated, handleMCPUpdated } = settings

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
useLifecycle({
  loadConfigStatus,
  setupStreamListener,
  cleanupStreamListener,
  loadSessionList: sessionActions.loadSessionList
})
</script>

<template>
  <div class="app-container">
    <!-- 自定义标题栏 -->
    <TitleBar :model-value="currentView" @update:model-value="uiState.switchToChatView" @open-settings="openSettings" />

    <!-- 配置加载错误提示（仅在加载失败时显示） -->
    <ErrorBanner :error="configError" @dismiss="dismissError" />

    <!-- 聊天错误提示（临时显示） -->
    <ChatErrorToast
      :show="showChatError"
      :message="chatErrorMessage"
      @close="closeChatError"
    />

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- Chat 视图 -->
      <template v-if="currentView === 'chat'">
        <!-- 侧边栏 -->
        <Sidebar
          v-show="!sidebarCollapsed"
          :sessions="sessionList"
          :active-session-id="currentChatId"
          :session-update-key="sessionUpdateKey"
          @new-chat="sessionActions.handleNewChat"
          @select-chat="sessionActions.handleSelectChat"
          @delete-session="sessionActions.handleDeleteSession"
        />

        <!-- 主内容区 -->
        <MainContent
          :sidebar-collapsed="sidebarCollapsed"
          :current-chat-id="currentChatId"
          :messages="messages"
          :is-sending="isSending"
          :current-model-name="currentModel"
          :config-update-key="configUpdateKey"
          @toggle-sidebar="uiState.toggleSidebar"
          @send-message="handleSendMessage"
          @stop-request="handleStopRequest"
        />
      </template>

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
