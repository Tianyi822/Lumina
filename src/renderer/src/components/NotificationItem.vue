<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { Notification } from '@renderer/types/notification'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'dismiss', id: string): void
}>()

const icon = computed(() => {
  switch (props.notification.type) {
    case 'error':
      return 'close'
    case 'warning':
      return 'warning'
    case 'success':
      return 'check'
    case 'info':
      return 'info'
    default:
      return 'info'
  }
})

const typeClass = computed(() => `message-${props.notification.type}`)
const liveRole = computed(() => (props.notification.type === 'error' ? 'alert' : 'status'))
const liveMode = computed(() => (props.notification.type === 'error' ? 'assertive' : 'polite'))

function handleClose(): void {
  emit('dismiss', props.notification.id)
}
</script>

<template>
  <div
    class="sm-notification-item"
    :class="typeClass"
    :role="liveRole"
    :aria-live="liveMode"
    aria-atomic="true"
  >
    <div class="message-icon">
      <SvgIcon :name="icon" :size="14" />
    </div>
    <div class="message-content">
      <div class="message-title">{{ notification.title }}</div>
      <div v-if="notification.message" class="message-text">{{ notification.message }}</div>
    </div>
    <button
      v-if="notification.dismissible"
      type="button"
      class="message-close"
      aria-label="关闭通知"
      @click="handleClose"
    >
      <SvgIcon name="close" :size="14" />
    </button>
  </div>
</template>

<style scoped>
@import '@renderer/styles/operation-message-colors.css';

.sm-notification-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  min-width: 320px;
  max-width: 480px;
  background-color: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.message-text {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
  white-space: pre-line;
  word-break: break-word;
}

.message-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  flex-shrink: 0;
}

.message-close:hover {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}
</style>
