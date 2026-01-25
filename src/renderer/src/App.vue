<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import MainContent from './components/MainContent.vue'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

// 配置加载错误信息
const configError = ref<string | null>(null)
// 是否显示错误提示
const showError = ref(false)

// 侧边栏是否折叠
const sidebarCollapsed = ref(false)

// 当前对话ID
const currentChatId = ref<string | undefined>(undefined)

// 当前对话的消息列表
const messages = ref<Message[]>([])

/**
 * 加载配置状态
 * 只有在配置加载失败（如格式错误、权限问题等）时才显示错误
 */
async function loadConfigStatus(): Promise<void> {
  try {
    const status = await window.api.config.getStatus()

    // 只有在配置加载失败时才显示错误（配置不存在时会自动创建，不需要提示）
    if (!status.success && status.error) {
      configError.value = status.error
      showError.value = true
    }
  } catch (error) {
    configError.value = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
    showError.value = true
  }
}

/**
 * 关闭错误提示
 */
function dismissError(): void {
  showError.value = false
}

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/**
 * 创建新对话
 */
function handleNewChat(): void {
  const newChatId = `chat-${Date.now()}`
  currentChatId.value = newChatId
  messages.value = []
}

/**
 * 选择对话
 */
function handleSelectChat(chatId: string): void {
  currentChatId.value = chatId
  // TODO: 加载对应对话的消息
  messages.value = []
}

/**
 * 发送消息
 */
function handleSendMessage(content: string): void {
  // 如果没有当前对话，先创建一个
  if (!currentChatId.value) {
    handleNewChat()
  }

  // 添加用户消息
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  }
  messages.value.push(userMessage)

  // TODO: 实际发送到后端并获取响应
  // 这里模拟一个助手响应
  setTimeout(() => {
    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `收到命令: ${content}`,
      timestamp: new Date().toISOString()
    }
    messages.value.push(assistantMessage)
  }, 500)
}

onMounted(() => {
  loadConfigStatus()
})
</script>

<template>
  <div class="app-container">
    <!-- 配置加载错误提示（仅在加载失败时显示） -->
    <div v-if="showError" class="error-banner">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-message">{{ configError }}</span>
        <button class="error-dismiss" @click="dismissError">×</button>
      </div>
    </div>

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- 侧边栏 -->
      <Sidebar
        v-show="!sidebarCollapsed"
        @new-chat="handleNewChat"
        @select-chat="handleSelectChat"
      />

      <!-- 主内容区 -->
      <MainContent
        :sidebar-collapsed="sidebarCollapsed"
        :current-chat-id="currentChatId"
        :messages="messages"
        @toggle-sidebar="toggleSidebar"
        @send-message="handleSendMessage"
      />
    </div>
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

/* 错误提示样式 */
.error-banner {
  background-color: rgba(248, 81, 73, 0.1);
  border-bottom: 1px solid var(--theme-danger);
  padding: 12px 16px;
  flex-shrink: 0;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
}

.error-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  color: var(--theme-danger);
  font-size: 14px;
  line-height: 1.5;
}

.error-dismiss {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--theme-danger);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
  font-family: var(--theme-font);
}

.error-dismiss:hover {
  opacity: 1;
}

/* 主布局 */
.app-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
