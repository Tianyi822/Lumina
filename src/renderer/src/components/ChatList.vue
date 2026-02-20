<script setup lang="ts">
import { ref } from 'vue'
import type { SessionListItem } from '@renderer/types'

defineProps<{
  sessions: SessionListItem[]
  activeSessionId?: string
}>()

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
  (e: 'delete', sessionId: string): void
}>()

// 悬停的会话 ID
const hoveredSessionId = ref<string | null>(null)

function selectSession(sessionId: string): void {
  emit('select', sessionId)
}

function deleteSession(event: Event, sessionId: string): void {
  event.stopPropagation()
  if (confirm('确定要删除这个对话吗？')) {
    emit('delete', sessionId)
  }
}

/**
 * 格式化时间显示
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    // 今天，显示时间
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    // 超过一周，显示日期
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
}
</script>

<template>
  <div class="chat-list">
    <div
      v-for="session in sessions"
      :key="session.sessionId"
      class="chat-item"
      :class="{ active: session.sessionId === activeSessionId }"
      @click="selectSession(session.sessionId)"
      @mouseenter="hoveredSessionId = session.sessionId"
      @mouseleave="hoveredSessionId = null"
    >
      <div class="chat-header">
        <div class="chat-title">{{ session.title }}</div>
        <div class="chat-actions">
          <span class="chat-time">{{ formatTime(session.updatedAt) }}</span>
          <button
            v-show="hoveredSessionId === session.sessionId"
            class="delete-btn"
            title="删除对话"
            @click="deleteSession($event, session.sessionId)"
          >
            ×
          </button>
        </div>
      </div>
    </div>
    <div v-if="sessions.length === 0" class="empty-state">暂无对话记录</div>
  </div>
</template>

<style scoped>
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.chat-item {
  padding: 10px 12px;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.chat-item:hover {
  background:
    linear-gradient(135deg, var(--glass-white-05, rgba(255,255,255,0.05)) 0%, var(--glass-white-027, rgba(255,255,255,0.027)) 100%),
    var(--glass-white-02, rgba(255,255,255,0.02));
  border-color: var(--glass-white-12, rgba(255,255,255,0.12));
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
}

.chat-item.active {
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0.06) 100%);
  border-color: rgba(99, 102, 241, 0.3);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-title {
  font-size: 13px;
  color: var(--theme-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.chat-time {
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

.delete-btn {
  background: none;
  border: none;
  color: var(--theme-text-tertiary);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.6;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.delete-btn:hover {
  opacity: 1;
  color: var(--theme-danger);
}

.empty-state {
  padding: 24px 12px;
  text-align: center;
  color: var(--theme-text-tertiary);
  font-size: 13px;
}
</style>
