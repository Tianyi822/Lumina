<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { SessionListItem } from '@renderer/types'

defineProps<{
  sessions: SessionListItem[]
  activeSessionId?: string
}>()

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
  (e: 'delete', sessionId: string): void
}>()

const SIDEBAR_ITEM_ENTER_BASE_DELAY_MS = 220
const SIDEBAR_ITEM_ENTER_STAGGER_MS = 88
const SIDEBAR_ITEM_ENTER_DURATION_MS = 320
const SIDEBAR_ITEM_OPACITY_DELAY_MS = 36

function getItemMotionStyle(index: number): {
  '--sm-sidebar-item-enter-base-delay': string
  '--sm-sidebar-item-enter-duration': string
  '--sm-sidebar-item-opacity-delay': string
} {
  const enterBaseDelay = SIDEBAR_ITEM_ENTER_BASE_DELAY_MS + index * SIDEBAR_ITEM_ENTER_STAGGER_MS

  return {
    '--sm-sidebar-item-enter-base-delay': `${enterBaseDelay}ms`,
    '--sm-sidebar-item-enter-duration': `${SIDEBAR_ITEM_ENTER_DURATION_MS}ms`,
    '--sm-sidebar-item-opacity-delay': `${SIDEBAR_ITEM_OPACITY_DELAY_MS}ms`
  }
}

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
  <TransitionGroup
    v-if="sessions.length > 0"
    name="sm-sidebar-list-item"
    tag="div"
    class="chat-list"
    appear
  >
    <div
      v-for="(session, index) in sessions"
      :key="session.sessionId"
      class="chat-item"
      :class="{ active: session.sessionId === activeSessionId }"
      :style="getItemMotionStyle(index)"
      @click="selectSession(session.sessionId)"
    >
      <div class="chat-header">
        <div class="chat-title">{{ session.title }}</div>
        <div class="chat-actions">
          <div class="chat-action-slot">
            <span class="chat-time">{{ formatTime(session.updatedAt) }}</span>
            <button
              class="delete-btn"
              title="删除对话"
              aria-label="删除对话"
              @click="deleteSession($event, session.sessionId)"
            >
              <SvgIcon name="trash" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </TransitionGroup>

  <div v-else class="chat-list">
    <div v-if="sessions.length === 0" class="empty-state">暂无对话记录</div>
  </div>
</template>

<style scoped>
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}

.chat-item {
  padding: 12px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.chat-item:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.chat-item.active {
  background: rgba(142, 149, 217, 0.12);
  border-color: var(--sm-color-border-accent);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-title {
  font-size: 13px;
  color: var(--sm-color-text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.chat-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 24px;
  flex-shrink: 0;
}

.chat-action-slot {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 24px;
}

.chat-time {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  transition:
    opacity var(--sm-transition-fast),
    visibility var(--sm-transition-fast);
}

.delete-btn {
  position: absolute;
  top: 50%;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  padding: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-50%);
  border-radius: 6px;
  transition: all var(--sm-transition-fast);
}

.chat-item:hover .chat-time,
.chat-item:focus-within .chat-time {
  opacity: 0;
  visibility: hidden;
}

.chat-item:hover .delete-btn,
.chat-item:focus-within .delete-btn {
  opacity: 0.6;
  visibility: visible;
  pointer-events: auto;
}

.delete-btn:hover {
  opacity: 1;
  background: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: var(--sm-color-status-danger);
}

.empty-state {
  padding: 24px 12px;
  text-align: center;
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
}
</style>
