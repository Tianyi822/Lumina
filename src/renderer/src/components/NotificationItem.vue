<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { Notification, NotificationAction } from '@renderer/types/notification'
import styles from './NotificationItem.module.css'

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

function handleAction(action: NotificationAction): void {
  action.handler()
}
</script>

<template>
  <div
    :class="[styles['sm-notification-item'], typeClass]"
    :role="liveRole"
    :aria-live="liveMode"
    aria-atomic="true"
  >
    <div :class="styles['message-icon']">
      <SvgIcon :name="icon" :size="14" />
    </div>
    <div :class="styles['message-content']">
      <div :class="styles['message-title']">{{ notification.title }}</div>
      <div v-if="notification.message" :class="styles['message-text']">
        {{ notification.message }}
      </div>
      <div
        v-if="notification.actions && notification.actions.length > 0"
        :class="styles['message-actions']"
      >
        <button
          v-for="(action, index) in notification.actions"
          :key="index"
          type="button"
          class="sm-button sm-button--small"
          :class="action.primary ? 'sm-button--primary' : 'sm-button--secondary'"
          @click="handleAction(action)"
        >
          {{ action.label }}
        </button>
      </div>
    </div>
    <button
      v-if="notification.dismissible"
      type="button"
      :class="styles['message-close']"
      aria-label="关闭通知"
      @click="handleClose"
    >
      <SvgIcon name="close" :size="14" />
    </button>
  </div>
</template>
