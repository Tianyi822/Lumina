<script setup lang="ts">
import { ref, computed } from 'vue'
import ChatList from './ChatList.vue'
import type { SessionListItem } from '@renderer/types'

const props = defineProps<{
  sessions: SessionListItem[]
  activeSessionId?: string
  sessionUpdateKey?: number
}>()

const emit = defineEmits<{
  (e: 'new-chat'): void
  (e: 'select-chat', sessionId: string): void
  (e: 'delete-session', sessionId: string): void
}>()

// 搜索关键词
const searchQuery = ref('')

// 过滤后的会话列表
const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.sessions
  }
  const query = searchQuery.value.toLowerCase()
  return props.sessions.filter((session) => session.title.toLowerCase().includes(query))
})

function handleNewChat(): void {
  emit('new-chat')
}

function handleSelectChat(sessionId: string): void {
  emit('select-chat', sessionId)
}

function handleDeleteSession(sessionId: string): void {
  emit('delete-session', sessionId)
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
    <ChatList
      :sessions="filteredSessions"
      :active-session-id="activeSessionId"
      @select="handleSelectChat"
      @delete="handleDeleteSession"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg,
      var(--glass-white-013, rgba(255,255,255,0.013)) 0%,
      var(--glass-white-007, rgba(255,255,255,0.007)) 100%),
    var(--theme-bg);
  border-right: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
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
