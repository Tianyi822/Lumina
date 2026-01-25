<script setup lang="ts">
import { ref } from 'vue'
import ChatList from './ChatList.vue'

interface ChatItem {
  id: string
  title: string
  lastMessage?: string
  timestamp?: string
}

const emit = defineEmits<{
  (e: 'new-chat'): void
  (e: 'select-chat', chatId: string): void
}>()

// 搜索关键词
const searchQuery = ref('')

// 示例对话数据（后续可接入实际数据）
const chats = ref<ChatItem[]>([])

// 当前激活的对话ID
const activeChatId = ref<string | undefined>(undefined)

function handleNewChat(): void {
  emit('new-chat')
}

function handleSelectChat(chatId: string): void {
  activeChatId.value = chatId
  emit('select-chat', chatId)
}
</script>

<template>
  <aside class="sidebar">
    <!-- 新对话按钮 -->
    <button class="btn-primary new-chat-btn" @click="handleNewChat">
      <span class="btn-icon">+</span>
      <span>新对话</span>
    </button>

    <!-- 搜索框 -->
    <div class="search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索对话 ..."
      />
    </div>

    <!-- 对话列表 -->
    <ChatList :chats="chats" :active-chat-id="activeChatId" @select="handleSelectChat" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  border-right: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px;
  width: calc(100% - 24px);
}

.btn-icon {
  font-size: 16px;
  font-weight: 600;
}

.search-container {
  padding: 0 12px 12px;
}

.search-input {
  width: 100%;
}
</style>
