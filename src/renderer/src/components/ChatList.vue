<script setup lang="ts">

interface ChatItem {
  id: string
  title: string
  lastMessage?: string
  timestamp?: string
  isActive?: boolean
}

defineProps<{
  chats: ChatItem[]
  activeChatId?: string
}>()

const emit = defineEmits<{
  (e: 'select', chatId: string): void
}>()

function selectChat(chatId: string): void {
  emit('select', chatId)
}
</script>

<template>
  <div class="chat-list">
    <div
      v-for="chat in chats"
      :key="chat.id"
      class="chat-item"
      :class="{ active: chat.id === activeChatId }"
      @click="selectChat(chat.id)"
    >
      <div class="chat-title">{{ chat.title }}</div>
      <div v-if="chat.lastMessage" class="chat-preview">{{ chat.lastMessage }}</div>
    </div>
    <div v-if="chats.length === 0" class="empty-list">
      <span class="terminal-prompt">暂无对话</span>
    </div>
  </div>
</template>

<style scoped>
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.chat-item {
  padding: 12px;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--theme-radius);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-item:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-border);
}

.chat-item.active {
  background-color: var(--theme-bg-secondary);
  border-color: var(--theme-accent);
}

.chat-title {
  font-size: 14px;
  color: var(--theme-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-preview {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-list {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--theme-text-secondary);
  font-size: 13px;
}
</style>
