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
  <aside class="sidebar sm-sidebar-shell">
    <header class="sm-sidebar-shell__header">
      <div class="sm-sidebar-shell__headline">
        <h2 class="sm-sidebar-shell__title">会话工作台</h2>
        <span class="sm-sidebar-shell__count">{{ sessions.length }}</span>
      </div>
      <div class="sm-sidebar-shell__actions">
        <button class="btn-primary new-chat-btn" @click="handleNewChat">创建智能体</button>
      </div>
    </header>

    <div class="sm-sidebar-shell__search search-container">
      <input v-model="searchQuery" type="text" class="input search-input" placeholder="搜索会话" />
    </div>

    <div class="sm-sidebar-shell__body sm-sidebar-shell__body--flush">
      <ChatList
        :sessions="filteredSessions"
        :active-session-id="activeSessionId"
        @select="handleSelectChat"
        @delete="handleDeleteSession"
      />
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  min-height: 0;
}

.new-chat-btn {
  width: 100%;
  min-height: 36px;
}

.search-container {
  display: flex;
}
</style>
