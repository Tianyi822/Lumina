<script setup lang="ts">
import { ref } from 'vue'
import MessageInput from './MessageInput.vue'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

const props = defineProps<{
  sidebarCollapsed: boolean
  currentChatId?: string
  messages?: Message[]
}>()

const emit = defineEmits<{
  (e: 'toggle-sidebar'): void
  (e: 'send-message', message: string): void
}>()

// 判断是否有活动对话
const hasActiveChat = ref(false)

function handleToggleSidebar(): void {
  emit('toggle-sidebar')
}

function handleSendMessage(message: string): void {
  emit('send-message', message)
}
</script>

<template>
  <main class="main-content">
    <!-- 顶部工具栏 -->
    <div class="content-header">
      <button
        class="btn toggle-sidebar-btn"
        :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="handleToggleSidebar"
      >
        <span class="toggle-icon">{{ sidebarCollapsed ? '»' : '«' }}</span>
      </button>
    </div>

    <!-- 消息区域 -->
    <div class="messages-area">
      <!-- 空状态 -->
      <div v-if="!currentChatId" class="empty-state">
        <p class="empty-text">选择或创建一个对话开始</p>
      </div>

      <!-- 消息列表 -->
      <div v-else class="messages-list">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message"
          :class="msg.role"
        >
          <div class="message-content">
            <span v-if="msg.role === 'user'" class="terminal-prompt">{{ msg.content }}</span>
            <span v-else class="output">{{ msg.content }}</span>
          </div>
        </div>
        <div v-if="!messages || messages.length === 0" class="empty-chat">
          <div class="command-line">
            <span class="terminal-prompt">开始新对话</span>
            <span class="terminal-cursor"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <MessageInput @send="handleSendMessage" />
  </main>
</template>

<style scoped>
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--theme-bg);
  overflow: hidden;
}

.content-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.toggle-sidebar-btn {
  padding: 6px 10px;
  font-size: 16px;
}

.toggle-icon {
  font-weight: bold;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-text {
  color: var(--theme-text-secondary);
  font-size: 15px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  max-width: 85%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: 12px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  font-size: 14px;
  line-height: 1.6;
}

.message.user .message-content {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.command-line {
  display: flex;
  align-items: center;
}
</style>
